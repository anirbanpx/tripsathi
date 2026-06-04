"""Long-term user memory via Mem0 Cloud.

Requires MEM0_API_KEY env var. Without it, memory calls are silently no-ops
so the rest of the pipeline runs unaffected.
"""
import logging
import os

logger = logging.getLogger(__name__)

_memory = None


def _get_memory():
    global _memory
    if _memory is not None:
        return _memory

    mem0_api_key = os.environ.get("MEM0_API_KEY", "")
    if not mem0_api_key:
        return None

    from mem0 import MemoryClient
    _memory = MemoryClient(api_key=mem0_api_key)
    logger.info("Mem0 Cloud API initialised")
    return _memory


def read_memories(user_id: str) -> str:
    """Return a formatted string of past preferences for this user, or empty string."""
    if not user_id:
        return ""
    try:
        mem = _get_memory()
        if mem is None:
            return ""
        results = mem.search("travel preferences past trips", filters={"user_id": user_id}, limit=10)
        memories = results.get("results", []) if isinstance(results, dict) else results
        if not memories:
            return ""
        lines = [m.get("memory", "") for m in memories if m.get("memory")]
        return "Past user travel preferences:\n" + "\n".join(f"- {l}" for l in lines)
    except Exception as e:
        logger.warning("read_memories failed user_id=%r: %s", user_id, e)
        return ""


def write_memory(user_id: str, summary: str) -> None:
    """Persist a free-text travel preference summary for this user to Mem0."""
    if not user_id or not summary:
        return
    try:
        mem = _get_memory()
        if mem is None:
            return
        mem.add([{"role": "user", "content": summary}], user_id=user_id)
        logger.info("memory written user_id=%r", user_id)
    except Exception as e:
        logger.warning("write_memory failed user_id=%r: %s", user_id, e)
