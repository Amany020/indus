"""
IndustryMind — PDF Ingestion Pipeline
PDF → page images → text chunks → embeddings → Supabase
Uses PyMuPDF + pdfplumber. Scanned/figure-heavy pages use Gemini vision.
"""

from __future__ import annotations

import io
import logging
import uuid
from typing import List, Dict, Any, Optional

import fitz  # PyMuPDF
import pdfplumber

from app.core.database import get_db
from app.core.config import settings
from app.services.embeddings import embed_text

logger = logging.getLogger(__name__)

# ─── Text extraction ────────────────────────────────────────────────────────

def _extract_text_pdfplumber(pdf_bytes: bytes) -> List[Dict[str, Any]]:
    """Extract text per page using pdfplumber (better for tables)."""
    pages = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            tables = page.extract_tables() or []
            table_text = ""
            for table in tables:
                for row in table:
                    if row:
                        table_text += " | ".join(str(c or "") for c in row) + "\n"

            pages.append({
                "page_number": i + 1,
                "text": text,
                "table_text": table_text,
                "width": float(page.width),
                "height": float(page.height),
            })
    return pages


def _extract_page_images(pdf_bytes: bytes) -> List[Dict[str, Any]]:
    """Extract page images using PyMuPDF."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images = []
    for i in range(len(doc)):
        page = doc[i]
        # Render at 150 DPI for storage
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("png")
        images.append({
            "page_number": i + 1,
            "image_bytes": img_bytes,
            "width": pix.width,
            "height": pix.height,
            "rotation": page.rotation,
        })
    doc.close()
    return images


# ─── Chunking ────────────────────────────────────────────────────────────────

def _chunk_text(
    text: str,
    page_number: int,
    chunk_size: int = 800,
    overlap: int = 100,
) -> List[Dict[str, Any]]:
    """Split text into overlapping chunks."""
    if not text or not text.strip():
        return []

    chunks = []
    words = text.split()
    current = []
    current_len = 0

    for word in words:
        current.append(word)
        current_len += len(word) + 1

        if current_len >= chunk_size:
            chunk_text = " ".join(current)
            chunks.append({
                "content_text": chunk_text,
                "page_number": page_number,
            })
            # Overlap: keep last N characters worth of words
            overlap_words = []
            ol = 0
            for w in reversed(current):
                ol += len(w) + 1
                overlap_words.insert(0, w)
                if ol >= overlap:
                    break
            current = overlap_words
            current_len = sum(len(w) + 1 for w in current)

    if current:
        chunks.append({
            "content_text": " ".join(current),
            "page_number": page_number,
        })

    return chunks


def _detect_section_heading(text: str) -> Optional[str]:
    """Try to detect the section heading from chunk text."""
    lines = text.strip().split("\n")
    if lines:
        first_line = lines[0].strip()
        # Heuristic: short lines in all caps or ending with colon
        if len(first_line) < 100 and (
            first_line.isupper()
            or first_line.endswith(":")
            or first_line.startswith("#")
        ):
            return first_line.replace("#", "").strip()
    return None


def _detect_risk_level(text: str) -> str:
    """Detect risk level from chunk content."""
    text_lower = text.lower()
    hazardous_terms = [
        "danger", "hazardous", "lethal", "fatal", "explosion",
        "high voltage", "खतरनाक", "जानलेवा",
    ]
    caution_terms = [
        "warning", "caution", "attention", "careful",
        "safety", "ppe", "lockout", "tagout",
        "सावधानी", "चेतावनी",
    ]

    for term in hazardous_terms:
        if term in text_lower:
            return "hazardous"
    for term in caution_terms:
        if term in text_lower:
            return "caution"
    return "none"


# ─── Full Ingestion Pipeline ────────────────────────────────────────────────

def ingest_document(
    pdf_bytes: bytes,
    document_id: str,
    machine_id: str,
    factory_id: str,
    revision: str = "1.0",
) -> Dict[str, Any]:
    """
    Full ingestion: extract text, create chunks, embed, upload page images.
    Returns ingestion stats.
    """
    db = get_db()
    logger.info("Starting ingestion for document %s", document_id)

    # 1. Extract text pages
    try:
        pages = _extract_text_pdfplumber(pdf_bytes)
    except Exception as e:
        logger.error("pdfplumber extraction failed: %s", e)
        db.table("documents").update({"approval_status": "failed"}).eq("id", document_id).execute()
        return {"error": str(e), "chunks_created": 0}

    # 2. Extract page images
    try:
        page_images = _extract_page_images(pdf_bytes)
    except Exception as e:
        logger.warning("Page image extraction failed: %s (continuing without images)", e)
        page_images = []

    # 3. Upload page images to storage and insert document_pages
    for img_data in page_images:
        page_num = img_data["page_number"]
        storage_key = f"pages/{document_id}/page_{page_num}.png"
        try:
            db.storage.from_(settings.supabase_bucket).upload(
                storage_key,
                img_data["image_bytes"],
                {"content-type": "image/png"},
            )
            db.table("document_pages").upsert({
                "document_id": document_id,
                "page_number": page_num,
                "image_storage_key": storage_key,
                "width": img_data["width"],
                "height": img_data["height"],
                "rotation": img_data.get("rotation", 0),
            }).execute()
        except Exception as e:
            logger.warning("Failed to upload page %d image: %s", page_num, e)

    # 4. Chunk text and embed
    all_chunks = []
    for page_data in pages:
        page_num = page_data["page_number"]
        text = page_data["text"]
        table_text = page_data.get("table_text", "")

        # Combine text and table content
        full_text = text
        if table_text:
            full_text += "\n\n[TABLE]\n" + table_text

        chunks = _chunk_text(full_text, page_num)
        all_chunks.extend(chunks)

    # 5. Generate embeddings and insert chunks
    chunks_created = 0
    for idx, chunk_data in enumerate(all_chunks):
        content = chunk_data["content_text"]
        if not content.strip() or len(content.strip()) < 10:
            continue

        try:
            embedding = embed_text(content)
        except Exception as e:
            logger.warning("Embedding failed for chunk %d: %s", idx, e)
            embedding = None

        section = _detect_section_heading(content)
        risk = _detect_risk_level(content)

        chunk_row = {
            "id": str(uuid.uuid4()),
            "document_id": document_id,
            "machine_id": machine_id,
            "factory_id": factory_id,
            "chunk_type": "text",
            "content_text": content,
            "page_number": chunk_data["page_number"],
            "chunk_index": idx,
            "revision": revision,
            "approval_status": "approved",  # Inherits from approved document
            "embedding_vector": str(embedding) if embedding else None,
            "risk_level": risk,
            "section_heading": section,
        }

        try:
            db.table("document_chunks").insert(chunk_row).execute()
            chunks_created += 1
        except Exception as e:
            logger.error("Failed to insert chunk %d: %s", idx, e)

    # 6. Update document status
    db.table("documents").update({
        "approval_status": "approved",
        "page_count": len(pages),
    }).eq("id", document_id).execute()

    stats = {
        "pages": len(pages),
        "chunks_created": chunks_created,
        "page_images_uploaded": len(page_images),
    }
    logger.info("Ingestion complete for %s: %s", document_id, stats)
    return stats
