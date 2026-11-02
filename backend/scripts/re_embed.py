"""
IndustryMind -- Re-embed all chunks that have NULL embedding_vector.
Run: python -m scripts.re_embed
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.core.config import settings
from app.core.database import get_db
from app.services.embeddings import embed_text


def main():
    db = get_db()

    # Fetch chunks with NULL embedding
    result = db.table("document_chunks").select(
        "id, content_text, chunk_type"
    ).is_("embedding_vector", "null").execute()

    chunks = result.data or []
    print(f"Found {len(chunks)} chunks with NULL embedding")

    if not chunks:
        print("Nothing to do.")
        return

    success = 0
    failed = 0

    for i, chunk in enumerate(chunks):
        chunk_id = chunk["id"]
        text = chunk.get("content_text") or ""

        if not text.strip():
            print(f"  [{i+1}/{len(chunks)}] SKIP {chunk_id[:8]}... (no text content)")
            continue

        try:
            vec = embed_text(text)
            assert len(vec) == settings.embed_dim, (
                f"Got {len(vec)}-dim, expected {settings.embed_dim}"
            )

            db.table("document_chunks").update({
                "embedding_vector": vec,
            }).eq("id", chunk_id).execute()

            success += 1
            print(f"  [{i+1}/{len(chunks)}] OK {chunk_id[:8]}... dim={len(vec)}")

            # Rate limit: small sleep between calls
            time.sleep(0.3)

        except Exception as e:
            failed += 1
            print(f"  [{i+1}/{len(chunks)}] FAIL {chunk_id[:8]}... {e}")

    print(f"\nDone: {success} embedded, {failed} failed, {len(chunks) - success - failed} skipped")


if __name__ == "__main__":
    main()
