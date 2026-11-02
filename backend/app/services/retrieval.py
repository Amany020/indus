"""
IndustryMind — Hybrid Retrieval Service
Dense vectors + Postgres FTS + error-code ILIKE, merged with Reciprocal Rank Fusion.
Every query filters machine_id AND approval_status='approved' on the SERVER.
"""

from __future__ import annotations

import re
import logging
from typing import List, Dict, Any, Optional

from app.core.database import get_db
from app.core.config import settings
from app.services.embeddings import embed_query

logger = logging.getLogger(__name__)

# ─── Error Code Extraction ──────────────────────────────────────────────────

_ERROR_CODE_PATTERN = re.compile(
    r"[A-Z]{1,3}[\-\s]?\d{2,5}",
    re.IGNORECASE,
)


def extract_error_codes(text: str) -> List[str]:
    """Extract error code patterns like E-247, E247, E 247."""
    return _ERROR_CODE_PATTERN.findall(text)


def _error_code_variants(code: str) -> List[str]:
    """Generate ILIKE variants: E-247, E247, E 247."""
    clean = re.sub(r"[\-\s]", "", code).upper()
    # Find the split point between letters and numbers
    match = re.match(r"([A-Z]+)(\d+)", clean)
    if not match:
        return [f"%{code}%"]
    prefix, num = match.group(1), match.group(2)
    return [
        f"%{prefix}-{num}%",
        f"%{prefix}{num}%",
        f"%{prefix} {num}%",
    ]


# ─── Reciprocal Rank Fusion ────────────────────────────────────────────────

def reciprocal_rank_fusion(
    *ranked_lists: List[Dict[str, Any]],
    k: int = 60,
) -> List[Dict[str, Any]]:
    """
    Merge multiple ranked lists using RRF.
    Each list is a list of dicts with at least an 'id' key.
    Returns merged list sorted by RRF score descending.
    """
    scores: Dict[str, float] = {}
    items: Dict[str, Dict[str, Any]] = {}

    for ranked_list in ranked_lists:
        for rank, item in enumerate(ranked_list):
            item_id = item.get("id", "")
            if not item_id:
                continue
            rrf_score = 1.0 / (k + rank + 1)
            scores[item_id] = scores.get(item_id, 0.0) + rrf_score
            # Keep the item with the highest individual score
            if item_id not in items:
                items[item_id] = item

    # Sort by RRF score
    sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    result = []
    for item_id in sorted_ids:
        item = items[item_id].copy()
        item["rrf_score"] = scores[item_id]
        result.append(item)

    return result


# ─── Dense Vector Search ────────────────────────────────────────────────────

def dense_search(
    query_text: str,
    machine_id: str,
    top_k: int = 10,
) -> List[Dict[str, Any]]:
    """Search using pgvector cosine similarity via the match_chunks RPC."""
    db = get_db()
    query_vec = embed_query(query_text)

    try:
        result = db.rpc(
            "match_chunks",
            {
                "query_embedding": query_vec,
                "match_machine_id": machine_id,
                "match_count": top_k,
                "similarity_threshold": 0.0,
            },
        ).execute()

        chunks = result.data or []
        # Add document info
        enriched = []
        for chunk in chunks:
            doc = db.table("documents").select("filename, revision").eq(
                "id", chunk["document_id"]
            ).single().execute()
            doc_data = doc.data or {}
            enriched.append({
                **chunk,
                "filename": doc_data.get("filename", "unknown"),
                "revision": doc_data.get("revision", "?"),
                "evidence_id": f"ev-{chunk['id'][:8]}",
                "search_method": "dense",
            })
        return enriched
    except Exception as e:
        logger.error("Dense search failed: %s", e)
        return []


# ─── Keyword (FTS) Search ───────────────────────────────────────────────────

def keyword_search(
    query_text: str,
    machine_id: str,
    top_k: int = 10,
) -> List[Dict[str, Any]]:
    """Search using Postgres full-text search with 'simple' config."""
    db = get_db()

    # Convert query to tsquery format (simple: just AND the terms)
    words = re.findall(r"\w+", query_text)
    if not words:
        return []
    ts_query = " & ".join(words[:10])  # Limit to 10 terms

    try:
        result = db.rpc(
            "keyword_search_chunks",
            {
                "search_query": ts_query,
                "match_machine_id": machine_id,
                "match_count": top_k,
            },
        ).execute()

        chunks = result.data or []
        enriched = []
        for chunk in chunks:
            doc = db.table("documents").select("filename, revision").eq(
                "id", chunk["document_id"]
            ).single().execute()
            doc_data = doc.data or {}
            enriched.append({
                **chunk,
                "filename": doc_data.get("filename", "unknown"),
                "revision": doc_data.get("revision", "?"),
                "evidence_id": f"ev-{chunk['id'][:8]}",
                "search_method": "keyword",
            })
        return enriched
    except Exception as e:
        logger.error("Keyword search failed: %s", e)
        return []


# ─── Error Code Search ──────────────────────────────────────────────────────

def error_code_search(
    query_text: str,
    machine_id: str,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """Search for exact error codes using ILIKE on code variants."""
    codes = extract_error_codes(query_text)
    if not codes:
        return []

    db = get_db()
    results = []

    for code in codes[:3]:  # Max 3 codes
        variants = _error_code_variants(code)
        for variant in variants:
            try:
                res = db.table("document_chunks").select(
                    "id, document_id, chunk_type, content_text, image_storage_key, "
                    "page_number, chunk_index, revision, bbox, risk_level, section_heading"
                ).eq(
                    "machine_id", machine_id
                ).eq(
                    "approval_status", "approved"
                ).ilike(
                    "content_text", variant
                ).limit(top_k).execute()

                for chunk in (res.data or []):
                    if chunk["id"] not in {r["id"] for r in results}:
                        doc = db.table("documents").select("filename, revision").eq(
                            "id", chunk["document_id"]
                        ).single().execute()
                        doc_data = doc.data or {}
                        results.append({
                            **chunk,
                            "filename": doc_data.get("filename", "unknown"),
                            "revision": doc_data.get("revision", "?"),
                            "evidence_id": f"ev-{chunk['id'][:8]}",
                            "similarity": 1.0,
                            "search_method": "error_code",
                        })
            except Exception as e:
                logger.error("Error code search failed for %s: %s", variant, e)

    return results[:top_k]


# ─── Hybrid Search (main entry point) ───────────────────────────────────────

def hybrid_search(
    query_text: str,
    machine_id: str,
    top_k: int = 10,
) -> List[Dict[str, Any]]:
    """
    Run hybrid retrieval: dense + FTS + error-code, merge with RRF.
    All queries filter machine_id AND approval_status='approved'.
    """
    logger.info("Hybrid search: machine=%s, query=%.80s...", machine_id, query_text)

    # Run all three search methods
    dense_results = dense_search(query_text, machine_id, top_k=top_k)
    keyword_results = keyword_search(query_text, machine_id, top_k=top_k)
    error_results = error_code_search(query_text, machine_id, top_k=5)

    logger.info(
        "Search results: dense=%d, keyword=%d, error_code=%d",
        len(dense_results), len(keyword_results), len(error_results),
    )

    # Merge with RRF
    merged = reciprocal_rank_fusion(dense_results, keyword_results, error_results)

    # Preserve dense similarity for abstention gate
    dense_sim_map = {r["id"]: r.get("similarity", 0) for r in dense_results}
    for item in merged:
        if "similarity" not in item or item.get("search_method") != "dense":
            item["similarity"] = dense_sim_map.get(item["id"], 0.0)

    return merged[:top_k]


def get_best_similarity(results: List[Dict[str, Any]]) -> float:
    """Get the best dense similarity score from results."""
    if not results:
        return 0.0
    return max(r.get("similarity", 0.0) for r in results)


# ─── Factory-Scoped Searches ────────────────────────────────────────────────

def dense_search_by_factory(
    query_text: str,
    factory_id: str,
    top_k: int = 10,
) -> List[Dict[str, Any]]:
    """Search using pgvector cosine similarity via the match_chunks_by_factory RPC."""
    db = get_db()
    query_vec = embed_query(query_text)

    try:
        result = db.rpc(
            "match_chunks_by_factory",
            {
                "query_embedding": query_vec,
                "match_factory_id": factory_id,
                "match_count": top_k,
                "similarity_threshold": 0.0,
            },
        ).execute()

        chunks = result.data or []
        # Add document info
        enriched = []
        for chunk in chunks:
            doc = db.table("documents").select("filename, revision").eq(
                "id", chunk["document_id"]
            ).single().execute()
            doc_data = doc.data or {}
            enriched.append({
                **chunk,
                "filename": doc_data.get("filename", "unknown"),
                "revision": doc_data.get("revision", "?"),
                "evidence_id": f"ev-{chunk['id'][:8]}",
                "search_method": "dense",
            })
        return enriched
    except Exception as e:
        logger.error("Dense search by factory failed: %s", e)
        return []


def keyword_search_by_factory(
    query_text: str,
    factory_id: str,
    top_k: int = 10,
) -> List[Dict[str, Any]]:
    """Search using Postgres full-text search with 'simple' config scoped by factory."""
    db = get_db()

    # Convert query to tsquery format (simple: just AND the terms)
    words = re.findall(r"\w+", query_text)
    if not words:
        return []
    ts_query = " & ".join(words[:10])  # Limit to 10 terms

    try:
        result = db.rpc(
            "keyword_search_chunks_by_factory",
            {
                "search_query": ts_query,
                "match_factory_id": factory_id,
                "match_count": top_k,
            },
        ).execute()

        chunks = result.data or []
        enriched = []
        for chunk in chunks:
            doc = db.table("documents").select("filename, revision").eq(
                "id", chunk["document_id"]
            ).single().execute()
            doc_data = doc.data or {}
            enriched.append({
                **chunk,
                "filename": doc_data.get("filename", "unknown"),
                "revision": doc_data.get("revision", "?"),
                "evidence_id": f"ev-{chunk['id'][:8]}",
                "search_method": "keyword",
            })
        return enriched
    except Exception as e:
        logger.error("Keyword search by factory failed: %s", e)
        return []


def error_code_search_by_factory(
    query_text: str,
    factory_id: str,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """Search for exact error codes using ILIKE on code variants scoped by factory."""
    codes = extract_error_codes(query_text)
    if not codes:
        return []

    db = get_db()
    results = []

    for code in codes[:3]:  # Max 3 codes
        variants = _error_code_variants(code)
        for variant in variants:
            try:
                res = db.table("document_chunks").select(
                    "id, document_id, chunk_type, content_text, image_storage_key, "
                    "page_number, chunk_index, revision, bbox, risk_level, section_heading"
                ).eq(
                    "factory_id", factory_id
                ).eq(
                    "approval_status", "approved"
                ).ilike(
                    "content_text", variant
                ).limit(top_k).execute()

                for chunk in (res.data or []):
                    if chunk["id"] not in {r["id"] for r in results}:
                        doc = db.table("documents").select("filename, revision").eq(
                            "id", chunk["document_id"]
                        ).single().execute()
                        doc_data = doc.data or {}
                        results.append({
                            **chunk,
                            "filename": doc_data.get("filename", "unknown"),
                            "revision": doc_data.get("revision", "?"),
                            "evidence_id": f"ev-{chunk['id'][:8]}",
                            "similarity": 1.0,
                            "search_method": "error_code",
                        })
            except Exception as e:
                logger.error("Error code search by factory failed for %s: %s", variant, e)

    return results[:top_k]


def hybrid_search_by_factory(
    query_text: str,
    factory_id: str,
    top_k: int = 10,
) -> List[Dict[str, Any]]:
    """
    Run hybrid retrieval: dense + FTS + error-code, merge with RRF, scoped by factory.
    All queries filter factory_id AND approval_status='approved'.
    """
    logger.info("Hybrid search by factory: factory=%s, query=%.80s...", factory_id, query_text)

    # Run all three search methods
    dense_results = dense_search_by_factory(query_text, factory_id, top_k=top_k)
    keyword_results = keyword_search_by_factory(query_text, factory_id, top_k=top_k)
    error_results = error_code_search_by_factory(query_text, factory_id, top_k=5)

    logger.info(
        "Search results by factory: dense=%d, keyword=%d, error_code=%d",
        len(dense_results), len(keyword_results), len(error_results),
    )

    # Merge with RRF
    merged = reciprocal_rank_fusion(dense_results, keyword_results, error_results)

    # Preserve dense similarity for abstention gate
    dense_sim_map = {r["id"]: r.get("similarity", 0) for r in dense_results}
    for item in merged:
        if "similarity" not in item or item.get("search_method") != "dense":
            item["similarity"] = dense_sim_map.get(item["id"], 0.0)

    return merged[:top_k]

