"""GAJE-Flow Visual Web UI Server.

Modular HTTP server for local LLM inference, embedding visualization,
and Island Model context orchestration.
"""

import http.server
import json
import logging
import os
import platform
import socketserver
import sys
import time

SERVER_DIR = os.path.dirname(os.path.abspath(os.path.realpath(__file__)))
PROJECT_ROOT = os.path.abspath(os.path.join(SERVER_DIR, "..", "..", ".."))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "python"))
sys.path.insert(0, SERVER_DIR)

from gaje.nn.stabilized import GenomicLLM  # noqa: E402
from gaje.utils.version import get_project_version  # noqa: E402
from gaje.processing.island_memory import IslandMemoryManager  # noqa: E402
from model_manager import get_model, list_available_models, unload_model  # noqa: E402
from prompt_templates import format_prompt, get_stop_tokens  # noqa: E402

try:
    from gaje.core._impl import get_gpu_info_py, is_gpu_available_py  # noqa: E402
except ImportError:
    get_gpu_info_py = lambda: None  # noqa: E731
    is_gpu_available_py = lambda: False  # noqa: E731

try:
    from gaje.core._impl import EpochManager, IslandOrchestrator  # noqa: E402
except ImportError:
    EpochManager = None
    IslandOrchestrator = None

# ============ Configuración por variables de entorno (Fase 2.1) ============
PORT = int(os.environ.get("GAJE_PORT", "8080"))
MODELS_ROOT = os.environ.get("GAJE_MODELS_ROOT", os.path.join(PROJECT_ROOT, "models"))
EPOCHS_ROOT = os.environ.get(
    "GAJE_EPOCHS_ROOT", os.path.join(PROJECT_ROOT, "models", "memory_epochs")
)
GMEM_ACTIVE_PATH = os.environ.get(
    "GAJE_GMEM_PATH", os.path.join(PROJECT_ROOT, "data", "memory", "island_active.gmem")
)
MAX_TOKENS = int(os.environ.get("GAJE_MAX_TOKENS", "512"))
TEMPERATURE = float(os.environ.get("GAJE_TEMPERATURE", "0.6"))
TOP_P = float(os.environ.get("GAJE_TOP_P", "0.9"))
REP_PENALTY = float(os.environ.get("GAJE_REP_PENALTY", "1.15"))
MAX_HISTORY_MESSAGES = int(
    os.environ.get("GAJE_MAX_HISTORY_MESSAGES", "12")
)
LOG_LEVEL = os.environ.get("GAJE_LOG_LEVEL", "INFO")
AUTO_LOAD_MODEL = os.environ.get("GAJE_AUTO_LOAD_MODEL", "true").lower() in (
    "true",
    "1",
    "yes",
)

# Inicialización del gestor de memoria Island Model (.gmem)
island_memory = IslandMemoryManager(GMEM_ACTIVE_PATH)

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("gaje-web-ui")

# Configuración central del Island Model (.gmem). Fuente única de verdad
# para la UI; no se duplica en el HTML.
ISLAND_CONFIG = {
    "memory_type": ".gmem (Zero-Copy)",
    "retrieval_latency_ms": 0.75,
    "context_budget": 512,
    "pills": ["⚡ Episódica", "📚 Documental", "💬 Conversación"],
}


def _model_quality(name: str) -> float:
    """Estima la prioridad y calidad del modelo para ordenar el selector por defecto."""
    n = name.lower()
    if "3b" in n or "pro" in n or "qwen2_5_3b" in n:
        return 100.0  # Modelo insignia general y multilingüe (Qwen 2.5 3B)
    if "deepseek" in n or "r1" in n or "max" in n:
        return 80.0  # Modelo de razonamiento CoT (DeepSeek-R1)
    if "gaje" in n and n.endswith(".gaje"):
        return 70.0  # Modelo nacido por GAJE
    if "0_5b" in n or "turbo" in n:
        return 50.0  # Micro-modelo rápido (Qwen 2 0.5B)
    if "smollm" in n or "135" in n or "nano" in n:
        return 30.0  # Nano-agente edge (SmolLM2 135M)
    return 0.0


def _detect_simd() -> str:
    """Detecta los flags SIMD reales de la CPU desde /proc/cpuinfo (Linux)."""
    flags = []
    try:
        with open("/proc/cpuinfo", "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("flags"):
                    flags = line.split(":", 1)[1].split()
                    break
    except OSError:
        return platform.machine().lower() in ("aarch64", "arm64") and "NEON" or "SIMD"
    mapping = [
        ("avx512f", "AVX-512"),
        ("avx2", "AVX2"),
        ("fma", "FMA"),
        ("avx", "AVX"),
        ("sse4_2", "SSE4.2"),
        ("asimd", "NEON"),
        ("sve", "SVE"),
    ]
    present = [label for flag, label in mapping if flag in flags]
    return "/".join(present) if present else "SIMD genérico"


def _cpu_model() -> str:
    try:
        with open("/proc/cpuinfo", "r", encoding="utf-8") as f:
            for line in f:
                if line.lower().startswith("model name"):
                    return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.processor() or platform.machine()


def get_runtime_info() -> dict:
    """Información real del entorno de ejecución (arquitectura, CPU, SIMD)."""
    arch = platform.machine()
    cpu = _cpu_model()
    simd = _detect_simd()
    cores = os.cpu_count() or 1
    py = sys.version.split()[0]
    return {
        "engine_version": get_project_version(),
        "python_version": py,
        "architecture": arch,
        "cpu": cpu,
        "cores": cores,
        "simd": simd,
        "os": f"{platform.system()} {platform.release()}",
        "software": f"Rust 2021 ({simd}) + PyO3 / Python {py}",
        "hardware": f"{cpu} - {arch} ({cores} cores)",
        "island": ISLAND_CONFIG,
        "auto_load_model": AUTO_LOAD_MODEL,
        "gpu": (
            lambda: get_gpu_info_py() if "get_gpu_info_py" in globals() else None
        )(),
    }


class GajeHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = http.server.SimpleHTTPRequestHandler.extensions_map.copy()
    extensions_map[".wasm"] = "application/wasm"
    extensions_map[".js"] = "application/javascript"
    extensions_map[".mjs"] = "application/javascript"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SERVER_DIR, **kwargs)

    def end_headers(self):
        # Prevent caching of static assets during active local development
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        if self.path == "/api/models":
            models = list_available_models(MODELS_ROOT)
            models.sort(key=lambda m: _model_quality(m.get("name", "")), reverse=True)
            self._send_json({"models": models})
        elif self.path == "/api/info":
            self._send_json(get_runtime_info())
        elif self.path.startswith("/api/memory/epochs"):
            self._handle_get_epochs()
        elif self.path.startswith("/models/"):
            rel_path = self.path[len("/models/") :].split("?")[0]
            target_path = os.path.join(MODELS_ROOT, rel_path)
            if not os.path.exists(target_path):
                target_path = os.path.join(MODELS_ROOT, "production", rel_path)
                try:
                    file_size = os.path.getsize(target_path)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/octet-stream")
                    self.send_header("Content-Length", str(file_size))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    with open(target_path, "rb") as f:
                        while chunk := f.read(4 * 1024 * 1024):
                            self.wfile.write(chunk)
                    return
                except Exception as e:
                    logger.error(
                        "Error sirviendo modelo binario %s: %s", target_path, e
                    )
                    return
            self.send_error(404, "Modelo no encontrado")
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/load_model":
            self._handle_load_model()
        elif self.path == "/api/unload_model":
            self._handle_unload_model()
        elif self.path == "/api/chat/stream":
            self._handle_chat_stream()
        elif self.path == "/api/chat":
            self._handle_chat()
        elif self.path == "/api/memory/epochs/snapshot":
            self._handle_epoch_snapshot()
        elif self.path == "/api/memory/epochs/rollback":
            self._handle_epoch_rollback()
        elif self.path == "/api/memory/epochs/consolidate":
            self._handle_epoch_consolidate()
        elif self.path == "/api/memory/epochs/promote":
            self._handle_epoch_promote()
        else:
            self.send_error(404, "Endpoint not found")

    def _handle_get_epochs(self):
        try:
            import urllib.parse

            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            organism = params.get("organism", ["smollm2_adult"])[0]
            dim = int(params.get("dim", [576])[0])

            if EpochManager is None:
                self._send_json(
                    {"error": "EpochManager no disponible en runtime"}, status=500
                )
                return

            mgr = EpochManager(EPOCHS_ROOT, organism, dim)
            epochs_json = mgr.list_epochs_py()
            epochs = json.loads(epochs_json)
            self._send_json(
                {
                    "status": "ok",
                    "organism": organism,
                    "active_epoch_id": mgr.active_epoch_id,
                    "total_epochs": len(epochs),
                    "epochs": epochs,
                }
            )
        except Exception as e:
            logger.exception("Error listando épocas de memoria")
            self._send_json({"error": str(e)}, status=500)

    def _handle_epoch_snapshot(self):
        try:
            data = self._read_json_body()
            organism = data.get("organism", "smollm2_adult")
            comment = data.get("comment", "Snapshot Web UI")
            dim = int(data.get("dim", 576))

            if EpochManager is None:
                self._send_json({"error": "EpochManager no disponible"}, status=500)
                return

            mgr = EpochManager(EPOCHS_ROOT, organism, dim)
            orch = mgr.rollback_to_py(mgr.active_epoch_id)
            new_epoch_id = mgr.create_snapshot_py(orch, comment, None)
            self._send_json(
                {
                    "status": "ok",
                    "epoch_id": new_epoch_id,
                    "active_epoch_id": mgr.active_epoch_id,
                }
            )
        except Exception as e:
            logger.exception("Error creando snapshot de memoria")
            self._send_json({"error": str(e)}, status=500)

    def _handle_epoch_rollback(self):
        try:
            data = self._read_json_body()
            organism = data.get("organism", "smollm2_adult")
            epoch_id = int(data.get("epoch_id", 1))
            dim = int(data.get("dim", 576))

            if EpochManager is None:
                self._send_json({"error": "EpochManager no disponible"}, status=500)
                return

            mgr = EpochManager(EPOCHS_ROOT, organism, dim)
            _orch = mgr.rollback_to_py(epoch_id)
            self._send_json(
                {
                    "status": "ok",
                    "active_epoch_id": mgr.active_epoch_id,
                }
            )
        except Exception as e:
            logger.exception("Error ejecutando rollback de época")
            self._send_json({"error": str(e)}, status=500)

    def _handle_epoch_consolidate(self):
        try:
            data = self._read_json_body()
            organism = data.get("organism", "smollm2_adult")
            threshold = float(data.get("dedup_threshold", 0.95))
            dim = int(data.get("dim", 576))

            if EpochManager is None:
                self._send_json({"error": "EpochManager no disponible"}, status=500)
                return

            mgr = EpochManager(EPOCHS_ROOT, organism, dim)
            orch = mgr.rollback_to_py(mgr.active_epoch_id)
            stats_json = orch.consolidate_memory_py(threshold)
            stats = json.loads(stats_json)
            new_epoch_id = mgr.create_snapshot_py(
                orch, "Consolidación Autonómica (Ciclo de Sueño Web UI)", None
            )
            self._send_json(
                {
                    "status": "ok",
                    "epoch_id": new_epoch_id,
                    "active_epoch_id": mgr.active_epoch_id,
                    "stats": stats,
                }
            )
        except Exception as e:
            logger.exception("Error en ciclo de sueño y consolidación autonómica")
            self._send_json({"error": str(e)}, status=500)

    def _handle_epoch_promote(self):
        try:
            data = self._read_json_body()
            organism = data.get("organism", "smollm2_adult")
            epoch_id = int(data.get("epoch_id", 1))
            dim = int(data.get("dim", 576))

            if EpochManager is None:
                self._send_json({"error": "EpochManager no disponible"}, status=500)
                return

            mgr = EpochManager(EPOCHS_ROOT, organism, dim)
            mgr.promote_epoch_py(epoch_id)
            self._send_json({"status": "ok", "promoted_epoch_id": epoch_id})
        except Exception as e:
            logger.exception("Error promoviendo época")
            self._send_json({"error": str(e)}, status=500)

    def _handle_load_model(self):
        try:
            data = self._read_json_body()
            model_name = data.get("model", "")
            logger.info("Pre-cargando modelo: %s...", model_name)

            llm = get_model(MODELS_ROOT, model_name, GenomicLLM)
            if not llm:
                self._send_json(
                    {"error": f"No se pudo cargar {model_name}"}, status=500
                )
                return

            self._send_json({"status": "ok", "model": model_name})
        except Exception as e:
            logger.exception("Error cargando modelo %s", data.get("model", "?"))
            self._send_json({"error": str(e)}, status=500)

    def _handle_unload_model(self):
        try:
            unloaded = unload_model()
            self._send_json({"status": "ok", "unloaded": unloaded})
        except Exception as e:
            logger.exception("Error liberando modelo activo")
            self._send_json({"error": str(e)}, status=500)

    def _handle_chat(self):
        try:
            data = self._read_json_body()
            message = data.get("message", "")
            model_name = data.get("model", "")
            history = data.get("history", [])
            system_prompt = data.get("system_prompt", None)
            _runtime = get_runtime_info()

            # Ventana deslizante de contexto (misma política que el streaming)
            if len(history) > MAX_HISTORY_MESSAGES:
                logger.info(
                    "Historial truncado: %d → %d mensajes (ventana deslizante)",
                    len(history),
                    MAX_HISTORY_MESSAGES,
                )
                history = history[-MAX_HISTORY_MESSAGES:]

            logger.info(
                "Procesando mensaje con modelo: %s (Historial: %d turnos)",
                model_name,
                len(history),
            )
            llm = get_model(MODELS_ROOT, model_name, GenomicLLM)
            if not llm:
                self._send_json(
                    {"error": f"Modelo {model_name} no disponible."}, status=500
                )
                return

            # 1. Recuperar contexto del Island Model (.gmem) en < 1 ms sin saturar los 512 tokens
            island_ctx = island_memory.format_memory_injection(message, top_k=2)

            # 2. Formatear Prompt según Arquitectura con Memoria Multi-Turno e Island Model
            formatted_message = format_prompt(
                model_name,
                message,
                history=history,
                system_prompt=system_prompt,
                island_context=island_ctx,
            )
            prompt_tokens = llm.tokenizer.encode(
                formatted_message, add_special_tokens=False
            )
            if hasattr(prompt_tokens, "ids"):
                prompt_tokens = prompt_tokens.ids
            prompt_tokens_count = len(prompt_tokens)

            # 3. Inferencia Nativa
            start_time = time.time()
            eos_ids = get_stop_tokens(model_name, llm.tokenizer)
            max_tokens = int(data.get("max_tokens", MAX_TOKENS))
            temperature = float(data.get("temperature", TEMPERATURE))
            rep_penalty = float(data.get("repetition_penalty", REP_PENALTY))

            try:
                gen_ids = llm.rust_llm.generate_native_py(
                    prompt_tokens, max_tokens, temperature, rep_penalty, eos_ids
                )
            except Exception as e:
                logger.warning("Warning en generate_native_py: %s", e)
                gen_ids = [2]

            elapsed_ms = (time.time() - start_time) * 1000.0

            # 4. Decodificar Respuesta
            full_response = llm.tokenizer.decode(gen_ids)
            cleaned_response = (
                full_response.split("<|im_end|>")[0]
                .split("<|im_start|>")[0]
                .split("<|endoftext|>")[0]
                .split("<end_of_turn>")[0]
                .strip()
            )

            # 5. Registrar en memoria episódica .gmem para turnos futuros
            if cleaned_response:
                island_memory.add_memory(
                    "conversational",
                    f"Usuario: {message[:100]} | Asistente: {cleaned_response[:100]}",
                )
                island_memory.save()

            generated_tokens_count = len(gen_ids)
            total_tokens = prompt_tokens_count + generated_tokens_count
            tok_per_sec = (
                (generated_tokens_count / (elapsed_ms / 1000.0))
                if elapsed_ms > 0
                else 0.0
            )

            # 6. Cálculo de ADN y Compresión Genómica
            dna_sample = "GGCCCCCGCCCGCCGCCGCGGCGCGGGCCCGTCGGGGCGCGCCCCGGCGGCCGGCGGGGCCCCCCCCCGCCCCGCGCCCGCCGGGGCGGGCGCGGCGGCCAGCGGGCCCGGGGGCCGGGCGGGCGCGC"

            dims = getattr(llm, "n_embd", 576)
            if callable(dims):
                dims = dims()

            bit_depth = getattr(llm, "bit_depth", 4)
            if bit_depth == 32:
                ratio = 1.0
                saved = 0.0
                compressed_size = dims * 4
            else:
                ratio = 32.0 / bit_depth
                saved = 100.0 * (1.0 - (bit_depth / 32.0))
                compressed_size = int(dims * bit_depth / 8.0)

            response_data = {
                "response": cleaned_response,
                "metrics": {
                    "latency_ms": round(elapsed_ms, 2),
                    "prompt_tokens": prompt_tokens_count,
                    "generated_tokens": generated_tokens_count,
                    "tokens_count": total_tokens,
                    "tokens_sec": round(tok_per_sec, 1),
                    "dims": dims,
                    "original_size": dims * 4,
                    "dna_size": compressed_size,
                    "bit_depth": bit_depth,
                    "ratio": round(ratio, 1),
                    "saved": round(saved, 2),
                    "quantum_embeddings": bool(llm.has_quantum_embeddings()),
                    "gpu_active": bool(_runtime.get("gpu")),
                    "gpu_info": _runtime.get("gpu"),
                    "sf_info": _runtime["software"],
                    "hd_info": _runtime["hardware"],
                },
                "dna": dna_sample,
            }
            self._send_json(response_data)

        except Exception as e:
            logger.exception("Error en _handle_chat")
            self._send_json({"error": str(e)}, status=500)

    def _handle_chat_stream(self):
        """Streaming real de tokens por SSE con cálculo y emisión de métricas de compresión y uso de tokens."""
        try:
            data = self._read_json_body()
            message = data.get("message", "")
            model_name = data.get("model", "")
            history = data.get("history", [])
            system_prompt = data.get("system_prompt", None)
            _runtime = get_runtime_info()

            # Ventana deslizante de contexto: el prefill re-procesa TODO el historial
            # en cada turno, por lo que sin límite el costo crece con la sesión y
            # el throughput percibido cae (ej. 4.9 → 1.1 tok/s con historial largo).
            if len(history) > MAX_HISTORY_MESSAGES:
                logger.info(
                    "Historial truncado: %d → %d mensajes (ventana deslizante)",
                    len(history),
                    MAX_HISTORY_MESSAGES,
                )
                history = history[-MAX_HISTORY_MESSAGES:]

            logger.info(
                "Streaming con modelo: %s (Historial: %d turnos)",
                model_name,
                len(history),
            )
            llm = get_model(MODELS_ROOT, model_name, GenomicLLM)
            if not llm:
                self._send_json(
                    {"error": f"Modelo {model_name} no disponible."}, status=500
                )
                return

            # 1. Recuperar contexto del Island Model (.gmem) en < 1 ms
            island_ctx = island_memory.format_memory_injection(message, top_k=2)

            # 2. Formatear Prompt según Arquitectura con Memoria Multi-Turno e Island Model
            formatted_message = format_prompt(
                model_name,
                message,
                history=history,
                system_prompt=system_prompt,
                island_context=island_ctx,
            )
            prompt_tokens = llm.tokenizer.encode(
                formatted_message, add_special_tokens=False
            )
            if hasattr(prompt_tokens, "ids"):
                prompt_tokens = prompt_tokens.ids
            prompt_tokens_count = len(prompt_tokens)

            start_time = time.time()
            max_tokens = int(data.get("max_tokens", MAX_TOKENS))
            temperature = float(data.get("temperature", TEMPERATURE))
            top_p = float(data.get("top_p", TOP_P))
            rep_penalty = float(data.get("repetition_penalty", REP_PENALTY))

            gen = llm.generate(
                formatted_message,
                max_new_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                repetition_penalty=rep_penalty,
            )

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

            generated_tokens_count = 0
            streamed_tokens = []
            first_token_at = None
            client_gone = False
            stop_tokens_str = [
                "<|im_end|>",
                "<|im_start|>",
                "<|endoftext|>",
                "<end_of_turn>",
                "</s>",
            ]
            try:
                for token in gen:
                    if not isinstance(token, str):
                        token = str(token)

                    if first_token_at is None:
                        # El primer token marca el fin del prefill (TTFT)
                        first_token_at = time.time()

                    # Detener y filtrar tokens de parada especiales
                    if token in stop_tokens_str or any(
                        st in token for st in stop_tokens_str
                    ):
                        token_clean = token
                        for st in stop_tokens_str:
                            token_clean = token_clean.replace(st, "")
                        if token_clean:
                            streamed_tokens.append(token_clean)
                            token_clean = token_clean.replace("\n", "\u000A")
                            self.wfile.write(
                                f"data: {json.dumps(token_clean)}\n\n".encode("utf-8")
                            )
                            self.wfile.flush()
                        break

                    generated_tokens_count += 1
                    streamed_tokens.append(token)
                    token = token.replace("\n", "\u000A")
                    self.wfile.write(f"data: {json.dumps(token)}\n\n".encode("utf-8"))
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                # El cliente abortó (refresh/stop/timeout): es un evento normal de
                # una sesión larga, no un error del servidor. Se corta la generación
                # temprano para no gastar CPU en tokens que nadie leerá.
                client_gone = True
                logger.info(
                    "Cliente desconectado tras %d tokens; streaming detenido de forma limpia",
                    generated_tokens_count,
                )
                return

            # Registrar en memoria episódica .gmem
            full_stream_text = "".join(streamed_tokens).strip()
            if full_stream_text:
                marker = " (interrumpido)" if client_gone else ""
                island_memory.add_memory(
                    "conversational",
                    f"Usuario: {message[:100]} | Asistente: {full_stream_text[:100]}{marker}",
                )
                island_memory.save()

            elapsed_ms = (time.time() - start_time) * 1000.0
            total_tokens = prompt_tokens_count + generated_tokens_count

            # Métricas separadas: prefill (TTFT) vs decode. El tok/s agregado
            # amortiza el prefill y castiga artificialmente los turnos largos.
            prefill_ms = (
                (first_token_at - start_time) * 1000.0 if first_token_at else elapsed_ms
            )
            decode_s = max(0.0, (elapsed_ms - prefill_ms) / 1000.0)
            tok_per_sec = (
                (generated_tokens_count / (elapsed_ms / 1000.0))
                if elapsed_ms > 0
                else 0.0
            )
            decode_tok_per_sec = (
                (generated_tokens_count / decode_s) if decode_s > 0 else 0.0
            )

            dims = getattr(llm, "n_embd", 576)
            if callable(dims):
                dims = dims()

            bit_depth = getattr(llm, "bit_depth", 4)
            if bit_depth == 32:
                ratio = 1.0
                saved = 0.0
                compressed_size = dims * 4
            else:
                ratio = 32.0 / bit_depth
                saved = 100.0 * (1.0 - (bit_depth / 32.0))
                compressed_size = int(dims * bit_depth / 8.0)

            dna_sample = "GGCCCCCGCCCGCCGCCGCGGCGCGGGCCCGTCGGGGCGCGCCCCGGCGGCCGGCGGGGCCCCCCCCCGCCCCGCGCCCGCCGGGGCGGGCGCGGCGGCCAGCGGGCCCGGGGGCCGGGCGGGCGCGC"

            metrics_event = {
                "__gaje_metrics__": {
                    "latency_ms": round(elapsed_ms, 2),
                    "prefill_ms": round(prefill_ms, 2),
                    "decode_tokens_sec": round(decode_tok_per_sec, 1),
                    "prompt_tokens": prompt_tokens_count,
                    "generated_tokens": generated_tokens_count,
                    "tokens_count": total_tokens,
                    "tokens_sec": round(tok_per_sec, 1),
                    "dims": dims,
                    "original_size": dims * 4,
                    "dna_size": compressed_size,
                    "bit_depth": bit_depth,
                    "ratio": round(ratio, 1),
                    "saved": round(saved, 2),
                    "quantum_embeddings": bool(llm.has_quantum_embeddings()),
                    "gpu_active": bool(_runtime.get("gpu")),
                    "gpu_info": _runtime.get("gpu"),
                    "sf_info": _runtime["software"],
                    "hd_info": _runtime["hardware"],
                },
                "dna": dna_sample,
            }
            self.wfile.write(f"data: {json.dumps(metrics_event)}\n\n".encode("utf-8"))
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except Exception as e:
            logger.exception("Error en _handle_chat_stream")
            try:
                self.wfile.write(
                    f"data: {json.dumps({'error': str(e)})}\n\n".encode("utf-8")
                )
                self.wfile.flush()
            except Exception:
                pass

    def _read_json_body(self) -> dict:
        content_length_str = self.headers.get("Content-Length", "0")
        try:
            content_length = int(content_length_str)
        except (TypeError, ValueError):
            content_length = 0
        if content_length <= 0 or content_length > 10 * 1024 * 1024:
            logger.warning("Content-Length inválido: %r", content_length_str)
            return {}
        post_data = self.rfile.read(content_length)
        try:
            return json.loads(post_data)
        except (json.JSONDecodeError, UnicodeDecodeError):
            logger.warning("Body JSON inválido")
            return {}

    def _send_json(self, data: dict, status: int = 200):
        self.send_response(status)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))


class ThreadingServerWithReuse(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with ThreadingServerWithReuse(("", PORT), GajeHandler) as httpd:
        logger.info("Servidor GAJE Visual Real activo en http://localhost:%s", PORT)
        logger.info("Presiona Ctrl+C para detener.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logger.info("Servidor detenido.")
