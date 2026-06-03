"""Long-term user memory via Mem0 (local OSS mode — no API key required).

Stores per-user travel preferences after each session and reads them back
at the start of persona classification to inform the LLM.

Local config: HuggingFace embeddings (same model as RAG) + Chroma vector store.
"""
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

MEMORY_DB_PATH = Path(__file__).parent / "data" / "memory_db"

_memory = None


def _get_memory():
    global _memory
    if _memory is not None:
        return _memory

    from mem0 import Memory

    MEMORY_DB_PATH.mkdir(parents=True, exist_ok=True)

    config = {
        "llm": {
            "provider": "openai",
            "config": {
                "model": os.environ.get("LLM_MODEL", "openai/gpt-oss-120b"),
                "api_key": os.environ.get("LLM_API_KEY", ""),
                "openai_base_url": os.environ.get("LLM_BASE_URL", ""),
            },
        },
        "embedder": {
            "provider": "huggingface",
            "config": {
                "model": "BAAI/bge-small-en-v1.5",
            },
        },
        "vector_store": {
            "provider": "chroma",
            "config": {
                "collection_name": "tripsathi_memories",
                "path": str(MEMORY_DB_PATH),
            },
        },
    }
    _memory = Memory.from_config(config)
    return _memory


def read_memories(user_id: str) -> str:
    """Return a formatted string of past preferences for this user, or empty string."""
    if not user_id:
        return ""
    try:
        mem = _get_memory()
        results = mem.search("travel preferences past trips", user_id=user_id, limit=10)
        memories = results.get("results", []) if isinstance(results, dict) else results
        if not memories:
            return ""
        lines = [m.get("memory", "") for m in memories if m.get("memory")]
        return "Past user travel preferences:\n" + "\n".join(f"- {l}" for l in lines)
    except Exception as e:
        logger.warning("read_memories failed user_id=%r: %s", user_id, e)
        return ""


def write_memory(user_id: str, plan: dict, trip_parameters: dict, user_profile: dict) -> None:
    """Extract travel preferences from a completed session and persist to Mem0."""
    if not user_id or not plan:
        return
    try:
        mem = _get_memory()
        destination = trip_parameters.get("destination", "unknown")
        budget = trip_parameters.get("budget", "mid")
        trip_style = trip_parameters.get("trip_style", [])
        persona = user_profile.get("persona_type", "")
        constraints = user_profile.get("constraints", {})

        messages = [
            {
                "role": "user",
                "content": (
                    f"I planned a trip to {destination}. "
                    f"Budget: {budget}. Style: {', '.join(trip_style) if trip_style else 'general'}. "
                    f"Group: {persona}. "
                    f"Constraints: elderly={constraints.get('elderly', False)}, "
                    f"kid_ages={constraints.get('kid_ages', [])}, "
                    f"pace={constraints.get('pace', 'moderate')}."
                ),
            }
        ]
        mem.add(messages, user_id=user_id)
        logger.info("memory written user_id=%r destination=%r", user_id, destination)
    except Exception as e:
        logger.warning("write_memory failed user_id=%r: %s", user_id, e)
