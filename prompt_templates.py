"""GAJE-Flow Prompt Templates Module.

Manages architecture-specific prompt formatting for chat models (Qwen2, SmolLM2, LLaMA, Gemma, DeepSeek-R1)
with multi-turn conversational memory, Island Model (.gmem) long-term memory injection,
and strict context window budget clamping.
"""

from typing import List, Dict, Optional


def format_prompt(
    model_name: str,
    message: str,
    history: Optional[List[Dict[str, str]]] = None,
    system_prompt: Optional[str] = None,
    island_context: Optional[str] = None,
    max_history_turns: int = 4,
) -> str:
    """Format an incoming user message, conversation history, and Island Model memories into native templates."""
    model_name_lower = model_name.lower()

    # Limpiar y filtrar historial multi-turno
    valid_history = []
    if history and isinstance(history, list):
        for h in history:
            role = h.get("role", "")
            content = h.get("content", "").strip()
            if role in ("user", "assistant", "system") and content:
                valid_history.append({"role": role, "content": content})
        # Limitar para asegurar que quepa holgadamente en el presupuesto de 512 tokens
        if len(valid_history) > max_history_turns * 2:
            valid_history = valid_history[-(max_history_turns * 2):]

    # Inyección de memoria de largo plazo Island Model (.gmem)
    mem_suffix = f"\n\n{island_context}" if island_context else ""

    # === Arquitectura Born: Organismos Nacidos (.gaje / max.gaje) ===
    if model_name_lower.endswith(".gaje") or "born" in model_name_lower or model_name_lower == "max.gaje":
        parts = []
        for turn in valid_history:
            parts.append(f"<|im_start|>{turn['role']}\n{turn['content']}<|im_end|>")
        parts.append(f"<|im_start|>user\n{message}<|im_end|>\n<|im_start|>assistant\n")
        return "\n".join(parts)

    # === Arquitectura 0: Modelos Base / Completado Directo (Pico / Base / Raw) ===
    elif "pico" in model_name_lower or "base" in model_name_lower or "raw" in model_name_lower:
        if not valid_history:
            return message
        parts = []
        if island_context:
            parts.append(f"Context: {island_context}")
        for turn in valid_history:
            r = "Human" if turn["role"] == "user" else "Assistant"
            parts.append(f"{r}: {turn['content']}")
        parts.append(f"Human: {message}\nAssistant:")
        return "\n\n".join(parts)

    # === Arquitectura 1: DeepSeek-R1 (CoT ChatML + <think> trigger) ===
    elif "deepseek" in model_name_lower or "r1" in model_name_lower:
        base_sys = system_prompt or "Eres un asistente experto y preciso que responde en español."
        sys_msg = f"{base_sys}{mem_suffix}"
        parts = [f"<|im_start|>system\n{sys_msg}<|im_end|>"]
        for turn in valid_history:
            parts.append(f"<|im_start|>{turn['role']}\n{turn['content']}<|im_end|>")
        parts.append(f"<|im_start|>user\n{message}<|im_end|>\n<|im_start|>assistant\n")
        return "\n".join(parts)

    # === Arquitectura 2: Qwen2 / Qwen2.5 / SmolLM2 (Estándar ChatML) ===
    elif "pro" in model_name_lower or "turbo" in model_name_lower or "nano" in model_name_lower or "smollm" in model_name_lower or "qwen" in model_name_lower or ".flat" in model_name_lower:
        base_sys = system_prompt or "Eres un asistente de inteligencia artificial conciso, claro y preciso."
        sys_msg = f"{base_sys}{mem_suffix}"
        parts = [f"<|im_start|>system\n{sys_msg}<|im_end|>"]
        for turn in valid_history:
            parts.append(f"<|im_start|>{turn['role']}\n{turn['content']}<|im_end|>")
        parts.append(f"<|im_start|>user\n{message}<|im_end|>\n<|im_start|>assistant\n")
        return "\n".join(parts)

    # === Arquitectura 3: Gemma (Instruction template) ===
    elif "gemma" in model_name_lower:
        parts = []
        if island_context:
            parts.append(f"<start_of_turn>user\n[Contexto del Sistema: {island_context}]<end_of_turn>\n<start_of_turn>model\nEntendido.<end_of_turn>")
        for turn in valid_history:
            role = "user" if turn["role"] == "user" else "model"
            parts.append(f"<start_of_turn>{role}\n{turn['content']}<end_of_turn>")
        parts.append(f"<start_of_turn>user\n{message}<end_of_turn>\n<start_of_turn>model\n")
        return "\n".join(parts)

    # === Arquitectura 4: Fallback estándar Turnos ===
    else:
        parts = []
        if island_context:
            parts.append(f"System Context: {island_context}")
        for turn in valid_history:
            r = "User" if turn["role"] == "user" else "Assistant"
            parts.append(f"{r}: {turn['content']}")
        parts.append(f"User: {message}\nAssistant:")
        return "\n".join(parts)


def get_stop_tokens(model_name: str, tokenizer) -> list:
    """Get the appropriate EOS / stop token IDs for the model."""
    eos_ids = [2, 151643, 151644, 151645]
    if hasattr(tokenizer, "eos_token_id") and tokenizer.eos_token_id is not None:
        eos_ids.append(tokenizer.eos_token_id)
    # Extraer IDs de tokens especiales del tokenizador si existen
    for special_name in ["<|im_end|>", "<|im_start|>", "<|endoftext|>", "<end_of_turn>", "</s>"]:
        try:
            if hasattr(tokenizer, "token_to_id"):
                tid = tokenizer.token_to_id(special_name)
                if tid is not None and tid not in eos_ids:
                    eos_ids.append(tid)
        except Exception:
            pass
    return list(set(eos_ids))
