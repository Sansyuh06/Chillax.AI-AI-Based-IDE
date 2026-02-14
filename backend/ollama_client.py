"""
Ollama LLM client — wraps the local Ollama HTTP API.
All calls stay on‑device; no cloud keys needed.
"""

import httpx
import json
from typing import Optional

OLLAMA_BASE = "http://localhost:11434"
DEFAULT_MODEL = "llama3.1:8b"

SYSTEM_PROMPT = (
    "You are an expert Python architect. You are given legacy Python code "
    "and a simple call graph. Explain what the code does, how data flows "
    "through it, and which parts of the project it connects to. "
    "Use clear, concise language suitable for a developer reading "
    "unfamiliar legacy code. Use markdown formatting for readability."
)

_cached_model = None

async def _get_model(model: str) -> str:
    """Return the requested model, or auto-detect from available models."""
    global _cached_model
    if _cached_model:
        return _cached_model
    # Try to verify the model exists
    try:
        models = await list_models()
        if model in models:
            _cached_model = model
            return model
        # Try common prefixes
        for m in models:
            if m.startswith(model.split(":")[0]):
                _cached_model = m
                return m
        # Fall back to first available
        if models:
            _cached_model = models[0]
            return models[0]
    except Exception:
        pass
    return model


async def generate(prompt: str, model: str = DEFAULT_MODEL,
                   system: Optional[str] = None) -> str:
    """Stream-less generation — waits for the full response."""
    system = system or SYSTEM_PROMPT
    actual_model = await _get_model(model)
    payload = {
        "model": actual_model,
        "prompt": prompt,
        "system": system,
        "stream": False,
        "options": {
            "temperature": 0.3,
            "num_predict": 2048,
        },
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(f"{OLLAMA_BASE}/api/generate", json=payload)
            resp.raise_for_status()
            return resp.json().get("response", "")
        except httpx.ConnectError:
            return ("⚠️ Could not connect to Ollama. Make sure it is running "
                    "(`ollama serve`) on port 11434.")
        except Exception as e:
            return f"⚠️ Ollama error: {str(e)}"


async def list_models() -> list[str]:
    """Return a list of locally‑available model names."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{OLLAMA_BASE}/api/tags")
            resp.raise_for_status()
            models = resp.json().get("models", [])
            return [m["name"] for m in models]
        except Exception:
            return []
