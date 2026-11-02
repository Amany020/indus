"""
IndustryMind — Diagnostic Script
Run: python -m scripts.diagnose
Prints PASS/FAIL for every system dependency.
No secrets are printed — only names and status.
"""
from __future__ import annotations

import sys
import os
from pathlib import Path

# Ensure backend package is on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Load .env before importing settings
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"
WARN = "\033[33mWARN\033[0m"


def check(label: str, ok: bool, detail: str = "") -> bool:
    icon = PASS if ok else FAIL
    line = f"  [{icon}] {label}"
    if detail:
        line += f"  — {detail}"
    print(line)
    return ok


def section(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


# ── 1. Required env vars ─────────────────────────────────────────────────────
section("1. Required Environment Variables")
from app.core.config import settings

env_checks = {
    "SUPABASE_URL": bool(settings.supabase_url),
    "SUPABASE_SERVICE_KEY": bool(settings.supabase_service_key),
    "GEMINI_API_KEY": bool(settings.gemini_api_key),
    "EMBED_MODEL": bool(settings.embed_model),
    "EMBED_DIM": settings.embed_dim > 0,
}
all_env_ok = True
for name, ok in env_checks.items():
    if not check(name, ok):
        all_env_ok = False

# ── 2. Gemini API key + model availability ────────────────────────────────────
section("2. Gemini API — Key Validity and Available Models")
available_embed_models: list[str] = []
available_generate_models: list[str] = []
gemini_ok = False

if not settings.gemini_api_key:
    check("Gemini API key set", False, "GEMINI_API_KEY is empty")
else:
    try:
        import google.generativeai as genai  # type: ignore
        genai.configure(api_key=settings.gemini_api_key)
        models = list(genai.list_models())
        for m in models:
            name = m.name.replace("models/", "")
            methods = getattr(m, "supported_generation_methods", [])
            if "embedContent" in methods:
                available_embed_models.append(name)
            if "generateContent" in methods:
                available_generate_models.append(name)

        check("API key valid (list_models succeeded)", True,
              f"{len(models)} models visible")
        gemini_ok = True

        embed_in_list = settings.embed_model in available_embed_models
        check(
            f"EMBED_MODEL '{settings.embed_model}' in available list",
            embed_in_list,
            f"Available embed models: {available_embed_models[:8]}" if not embed_in_list else "",
        )

        if settings.gemini_model:
            gen_in_list = settings.gemini_model in available_generate_models
            check(
                f"GEMINI_MODEL '{settings.gemini_model}' in available list",
                gen_in_list,
                f"Available generate models: {available_generate_models[:6]}" if not gen_in_list else "",
            )
        else:
            # Auto-detect
            flash_models = [m for m in available_generate_models if "flash" in m.lower()]
            check(
                "GEMINI_MODEL auto-detect (not set, will use flash)",
                bool(flash_models),
                f"Flash candidates: {flash_models[:3]}",
            )

    except Exception as e:
        check("Gemini API key valid", False, str(e)[:120])

# ── 3. Embedding call ─────────────────────────────────────────────────────────
section("3. Embedding Call")
embed_dim_ok = False
if gemini_ok and settings.embed_model:
    try:
        import google.generativeai as genai  # type: ignore
        result = genai.embed_content(
            model=f"models/{settings.embed_model}",
            content="test diagnostic query",
            task_type="retrieval_query",
        )
        vec = result["embedding"]
        embed_dim_ok = len(vec) == settings.embed_dim
        check(
            f"embed_content returns {len(vec)}-dim vector",
            True,
            f"EMBED_DIM setting={settings.embed_dim}",
        )
        check(
            f"Returned dim ({len(vec)}) matches EMBED_DIM ({settings.embed_dim})",
            embed_dim_ok,
            "" if embed_dim_ok else f"Mismatch! Update EMBED_DIM to {len(vec)} in .env",
        )
    except Exception as e:
        check("embed_content call", False, str(e)[:120])
else:
    print(f"  [{WARN}] Skipped — Gemini not configured")

# ── 4. Database reachability + pgvector ─────────────────────────────────────
section("4. Database — Reachability and pgvector")
db_ok = False
try:
    from app.core.database import get_db
    db = get_db()
    # Simple ping
    ping = db.table("factories").select("id").limit(1).execute()
    db_ok = True
    check("Supabase REST API reachable", True)

    # pgvector: try the match_chunks RPC with a zero vector
    zero_vec = [0.0] * settings.embed_dim
    try:
        rpc_res = db.rpc(
            "match_chunks",
            {
                "query_embedding": zero_vec,
                "match_machine_id": "00000000-0000-0000-0000-000000000000",
                "match_count": 1,
                "similarity_threshold": -1.0,
            },
        ).execute()
        check("match_chunks RPC (pgvector) callable", True)
    except Exception as e:
        check("match_chunks RPC (pgvector) callable", False, str(e)[:120])

    # FTS: keyword_search_chunks RPC
    try:
        fts_res = db.rpc(
            "keyword_search_chunks",
            {
                "search_query": "belt",
                "match_machine_id": "00000000-0000-0000-0000-000000000000",
                "match_count": 1,
            },
        ).execute()
        check("keyword_search_chunks RPC (FTS) callable", True)
    except Exception as e:
        check("keyword_search_chunks RPC (FTS) callable", False, str(e)[:120])

except Exception as e:
    check("Supabase reachable", False, str(e)[:120])

# ── 5. Document and chunk counts ─────────────────────────────────────────────
section("5. Document and Chunk Counts")
if db_ok:
    try:
        from app.core.database import get_db
        db = get_db()

        # Documents by approval_status
        docs = db.table("documents").select("approval_status").execute()
        doc_counts: dict[str, int] = {}
        for d in (docs.data or []):
            s = d.get("approval_status", "unknown")
            doc_counts[s] = doc_counts.get(s, 0) + 1

        total_docs = sum(doc_counts.values())
        approved_docs = doc_counts.get("approved", 0)
        check(
            f"Documents: {total_docs} total, {approved_docs} approved",
            approved_docs > 0,
            str(doc_counts) if doc_counts else "No documents found",
        )

        # Chunks by approval_status
        chunks = db.table("document_chunks").select(
            "approval_status, embedding_vector"
        ).execute()
        chunk_data = chunks.data or []
        chunk_counts: dict[str, int] = {}
        null_embedding_count = 0
        stored_dims: set[int] = set()

        for c in chunk_data:
            s = c.get("approval_status", "unknown")
            chunk_counts[s] = chunk_counts.get(s, 0) + 1
            ev = c.get("embedding_vector")
            if ev is None:
                null_embedding_count += 1
            elif isinstance(ev, list):
                stored_dims.add(len(ev))

        total_chunks = sum(chunk_counts.values())
        approved_chunks = chunk_counts.get("approved", 0)
        check(
            f"Chunks: {total_chunks} total, {approved_chunks} approved",
            approved_chunks > 0,
            str(chunk_counts),
        )
        check(
            f"Chunks with NULL embedding: {null_embedding_count}",
            null_embedding_count == 0,
            "Run re-embed script to fix" if null_embedding_count else "",
        )

        if stored_dims:
            dim_match = embed_dim_ok and all(d == settings.embed_dim for d in stored_dims)
            check(
                f"Stored embedding dims: {stored_dims} vs EMBED_DIM={settings.embed_dim}",
                dim_match,
                "Dimension mismatch — stored vectors will not match query vectors" if not dim_match else "",
            )

        # Error-code ILIKE check
        ilike_res = db.table("document_chunks").select("id").ilike(
            "content_text", "%E-247%"
        ).limit(5).execute()
        check(
            f"Error-code ILIKE search (E-247): {len(ilike_res.data or [])} hits",
            True,  # informational
            "0 hits — E-247 not in any chunk (expected if no manual uploaded)" if not ilike_res.data else "",
        )

    except Exception as e:
        check("Document/chunk query", False, str(e)[:120])
else:
    print(f"  [{WARN}] Skipped — database not reachable")

# ── 6. Summary ───────────────────────────────────────────────────────────────
section("6. Summary")
print("""
  Key things to fix if any FAIL above:
  - EMBED_MODEL not in list → update EMBED_MODEL in backend/.env
  - Returned dim ≠ EMBED_DIM → update EMBED_DIM in backend/.env
  - 0 approved documents → upload a PDF via Admin and approve it
  - Chunks with NULL embedding → run scripts/re_embed.py
  - Dim mismatch in stored vectors → re-embed all chunks
""")
