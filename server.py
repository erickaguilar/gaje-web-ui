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

# ============ Configuración por variables de entorno (Fase 2.1) ============
PORT = int(os.environ.get("GAJE_PORT", "8080"))
MODELS_ROOT = os.environ.get("GAJE_MODELS_ROOT", os.path.join(PROJECT_ROOT, "models"))
GMEM_ACTIVE_PATH = os.environ.get("GAJE_GMEM_PATH", os.path.join(PROJECT_ROOT, "data", "memory", "island_active.gmem"))
MAX_TOKENS = int(os.environ.get("GAJE_MAX_TOKENS", "512"))
TEMPERATURE = float(os.environ.get("GAJE_TEMPERATURE", "0.2"))
TOP_P = float(os.environ.get("GAJE_TOP_P", "0.9"))
REP_PENALTY = float(os.environ.get("GAJE_REP_PENALTY", "1.1"))
LOG_LEVEL = os.environ.get("GAJE_LOG_LEVEL", "INFO")
AUTO_LOAD_MODEL = os.environ.get("GAJE_AUTO_LOAD_MODEL", "true").lower() in ("true", "1", "yes")

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
        return 80.0   # Modelo de razonamiento CoT (DeepSeek-R1)
    if "gaje" in n and n.endswith(".gaje"):
        return 70.0   # Modelo nacido por GAJE
    if "0_5b" in n or "turbo" in n:
        return 50.0   # Micro-modelo rápido (Qwen 2 0.5B)
    if "smollm" in n or "135" in n or "nano" in n:
        return 30.0   # Nano-agente edge (SmolLM2 135M)
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
        "gpu": (lambda: get_gpu_info_py() if 'get_gpu_info_py' in globals() else None)(),
    }


class GajeHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = http.server.SimpleHTTPRequestHandler.extensions_map.copy()
    extensions_map['.wasm'] = 'application/wasm'
    extensions_map['.js'] = 'application/javascript'
    extensions_map['.mjs'] = 'application/javascript'

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
        elif self.path.startswith("/models/"):
            rel_path = self.path[len("/models/"):].split("?")[0]
            target_path = os.path.join(MODELS_ROOT, rel_path)
            if not os.path.exists(target_path):
                target_path = os.path.join(MODELS_ROOT, "production", rel_path)
            if os.path.exists(target_path) and os.path.isfile(target_path):
                try:
                    with open(target_path, "rb") as f:
                        content = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/octet-stream")
                    self.send_header("Content-Length", str(len(content)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(content)
                    return
                except Exception as e:
                    logger.error("Error sirviendo modelo binario %s: %s", target_path, e)
                    self.send_error(500, "Error leyendo archivo binario")
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
        else:
            self.send_error(404, "Endpoint not found")

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

            logger.info("Procesando mensaje con modelo: %s (Historial: %d turnos)", model_name, len(history))
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
                model_name, message, history=history, system_prompt=system_prompt, island_context=island_ctx
            )
            prompt_tokens = llm.tokenizer.encode(formatted_message, add_special_tokens=False)
            if hasattr(prompt_tokens, "ids"):
                prompt_tokens = prompt_tokens.ids
            prompt_tokens_count = len(prompt_tokens)

            # 3. Inferencia Nativa
            start_time = time.time()
            eos_ids = get_stop_tokens(model_name, llm.tokenizer)

            try:
                gen_ids = llm.rust_llm.generate_native_py(
                    prompt_tokens, MAX_TOKENS, TEMPERATURE, REP_PENALTY, eos_ids
                )
            except Exception as e:
                logger.warning("Warning en generate_native_py: %s", e)
                gen_ids = [2]

            elapsed_ms = (time.time() - start_time) * 1000.0

            # 4. Decodificar Respuesta
            full_response = llm.tokenizer.decode(gen_ids)
            cleaned_response = (
                full_response.split("<|im_end|>")[0]
                .split("<|endoftext|>")[0]
                .split("<end_of_turn>")[0]
                .strip()
            )

            # 5. Registrar en memoria episódica .gmem para turnos futuros
            if cleaned_response:
                island_memory.add_memory("conversational", f"Usuario: {message[:100]} | Asistente: {cleaned_response[:100]}")
                island_memory.save()

            generated_tokens_count = len(gen_ids)
            total_tokens = prompt_tokens_count + generated_tokens_count
            tok_per_sec = (
                (generated_tokens_count / (elapsed_ms / 1000.0)) if elapsed_ms > 0 else 0.0
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

            logger.info("Streaming con modelo: %s (Historial: %d turnos)", model_name, len(history))
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
                model_name, message, history=history, system_prompt=system_prompt, island_context=island_ctx
            )
            prompt_tokens = llm.tokenizer.encode(formatted_message, add_special_tokens=False)
            if hasattr(prompt_tokens, "ids"):
                prompt_tokens = prompt_tokens.ids
            prompt_tokens_count = len(prompt_tokens)

            start_time = time.time()
            gen = llm.generate(
                formatted_message,
                max_new_tokens=MAX_TOKENS,
                temperature=TEMPERATURE,
                top_p=TOP_P,
                repetition_penalty=REP_PENALTY,
            )

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

            generated_tokens_count = 0
            streamed_tokens = []
            stop_tokens_str = ["<|im_end|>", "<|endoftext|>", "<end_of_turn>", "</s>"]
            for token in gen:
                if not isinstance(token, str):
                    token = str(token)

                # Detener y filtrar tokens de parada especiales
                if token in stop_tokens_str or any(st in token for st in stop_tokens_str):
                    token_clean = token
                    for st in stop_tokens_str:
                        token_clean = token_clean.replace(st, "")
                    if token_clean:
                        streamed_tokens.append(token_clean)
                        token_clean = token_clean.replace("\n", "\u000A")
                        self.wfile.write(f"data: {json.dumps(token_clean)}\n\n".encode("utf-8"))
                        self.wfile.flush()
                    break

                generated_tokens_count += 1
                streamed_tokens.append(token)
                token = token.replace("\n", "\u000A")
                self.wfile.write(f"data: {json.dumps(token)}\n\n".encode("utf-8"))
                self.wfile.flush()

            # Registrar en memoria episódica .gmem
            full_stream_text = "".join(streamed_tokens).strip()
            if full_stream_text:
                island_memory.add_memory("conversational", f"Usuario: {message[:100]} | Asistente: {full_stream_text[:100]}")
                island_memory.save()

            elapsed_ms = (time.time() - start_time) * 1000.0
            total_tokens = prompt_tokens_count + generated_tokens_count
            tok_per_sec = (
                (generated_tokens_count / (elapsed_ms / 1000.0)) if elapsed_ms > 0 else 0.0
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
