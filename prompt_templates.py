"""GAJE-Flow Prompt Templates Module.

Manages architecture-specific prompt formatting for chat models (Qwen2, SmolLM2, LLaMA, Gemma, DeepSeek-R1)
with multi-turn conversational memory, context window trimming, and ChatML compliance.
"""

from typing import List, Dict, Optional, Any


def format_prompt(
    model_name: str,
    message: str,
    history: Optional[List[Dict[str, str]]] = None,
    system_prompt: Optional[str] = None,
    max_history_turns: int = 6,
) -> str:
    """Format an incoming user message along with multi-turn conversation history into the model's native template."""
    model_name_lower = model_name.lower()

    # Limpiar y filtrar historial
    valid_history = []
    if history and isinstance(history, list):
        for h in history:
            role = h.get("role", "")
            content = h.get("content", "").strip()
            if role in ("user", "assistant", "system") and content:
                valid_history.append({"role": role, "content": content})
        # Conservar los últimos N turnos (pares usuario-asistente)
        if len(valid_history) > max_history_turns * 2:
            valid_history = valid_history[-(max_history_turns * 2):]

    # === Arquitectura 1: DeepSeek-R1 (CoT ChatML + <think> trigger) ===
    if "max" in model_name_lower or "deepseek" in model_name_lower or "r1" in model_name_lower:
        sys_msg = system_prompt or "Eres un asistente experto y preciso que responde en español."
        parts = [f"<|im_start|>system\n{sys_msg}<|im_end|>"]
        for turn in valid_history:
            parts.append(f"<|im_start|>{turn['role']}\n{turn['content']}<|im_end|>")
        parts.append(f"<|im_start|>user\n{message}<|im_end|>\n<|im_start|>assistant\n<think>\n")
        return "\n".join(parts)

    # === Arquitectura 2: Qwen2 / Qwen2.5 / SmolLM2 (Estándar ChatML) ===
    elif "pro" in model_name_lower or "turbo" in model_name_lower or "nano" in model_name_lower or "smollm" in model_name_lower or "qwen" in model_name_lower or ".flat" in model_name_lower:
        sys_msg = system_prompt or "You are a helpful, concise and precise assistant."
        parts = [f"<|im_start|>system\n{sys_msg}<|im_end|>"]
        for turn in valid_history:
            parts.append(f"<|im_start|>{turn['role']}\n{turn['content']}<|im_end|>")
        parts.append(f"<|im_start|>user\n{message}<|im_end|>\n<|im_start|>assistant\n")
        return "\n".join(parts)

    # === Arquitectura 3: Gemma (Instruction template) ===
    elif "gemma" in model_name_lower:
        parts = []
        for turn in valid_history:
            role = "user" if turn["role"] == "user" else "model"
            parts.append(f"<start_of_turn>{role}\n{turn['content']}<end_of_turn>")
        parts.append(f"<start_of_turn>user\n{message}<end_of_turn>\n<start_of_turn>model\n")
        return "\n".join(parts)

    # === Arquitectura 4: Fallback estándar Turnos ===
    else:
        parts = []
        for turn in valid_history:
            r = "User" if turn["role"] == "user" else "Assistant"
            parts.append(f"{r}: {turn['content']}")
        parts.append(f"User: {message}\nAssistant:")
        return "\n".join(parts)


def get_stop_tokens(model_name: str, tokenizer) -> list:
    """Get the appropriate EOS / stop token IDs for the model."""
    eos_ids = [2, 151643, 151645]
    if hasattr(tokenizer, "eos_token_id") and tokenizer.eos_token_id is not None:
        eos_ids.append(tokenizer.eos_token_id)
    return eos_ids
