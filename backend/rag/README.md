# RAG Module — Destination Knowledge Base

LlamaIndex + ChromaDB knowledge base for destination intelligence. Provides retrieval-augmented context for the plan_assembly and research nodes.

---

## Knowledge Base

18 hand-curated destination markdown files in `knowledge/`:

```
andaman, coorg, darjeeling, goa, guwahati, hampi, jaisalmer, kerala,
ladakh, manali, mysore, pondicherry, puri, rajasthan, rishikesh,
shimla, udaipur, varanasi
```

Each file covers: overview, best time to visit, must-see places, food, travel tips, and budget guidance.

---

## Video Index

`destination_videos.json` contains 50 YouTube video entries tagged with destination and language. Used to surface video previews in the booking funnel.

**Coverage gaps (no English video):** Ajmer (non-English only), Kaziranga, Khajuraho, Thekkady.

---

## ChromaDB Storage

The vector index is auto-created at `backend/data/chroma_db/` on first startup via `indexer.py`. This directory is gitignored — it is rebuilt from the markdown files each time.

---

## Commands

All commands run from the `backend/` directory.

**Reindex all destinations:**
```bash
python reindex.py
```

**Add a new destination:**
1. Create `rag/knowledge/<destination>.md` (follow the format of an existing file)
2. Run `python reindex.py`

**Ingest new YouTube videos:**
```bash
python rag/ingest_videos.py
```

**Generate a knowledge file from a prompt (uses LLM):**
```bash
# See rag/generate_knowledge_prompt.txt for the prompt template
```

---

## How It Works

`indexer.py` reads all markdown files in `knowledge/`, chunks them with LlamaIndex, embeds with the configured embedding model, and stores vectors in ChromaDB. At query time, `top_k=8` chunks are retrieved per destination and injected into the plan_assembly prompt as context.
