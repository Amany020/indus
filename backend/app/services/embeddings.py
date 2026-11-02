"""
IndustryMind — Embeddings Service
Wraps Google Gemini embedding calls.
Uses output_dimensionality=EMBED_DIM so the returned vector always matches
the vector(768) column in Supabase without a migration.
"""

from __future__ import annotations

import logging
import warnings
from typing import List

try:
    # Prefer the new non-deprecated SDK
    from google import genai as _genai_new  # type: ignore
    _USE_NEW_SDK = True
except ImportError:
    _USE_NEW_SDK = False

with warnings.catch_warnings():
    warnings.simplefilter("ignore", category=FutureWarning)
    import google.generativeai as genai  # fallback / type stubs

from app.core.config import settings

logger = logging.getLogger(__name__)

_configured = False
_new_client = None


def _ensure_configured() -> None:
    global _configured, _new_client
    if _configured:
        return
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY must be set in .env")
    if _USE_NEW_SDK:
        _new_client = _genai_new.Client(api_key=settings.gemini_api_key)
    else:
        genai.configure(api_key=settings.gemini_api_key)
    _configured = True


def _embed(text: str, task_type: str) -> List[float]:
    """Internal: call embed API and return a flat float list."""
    _ensure_configured()
    model_name = settings.embed_model  # e.g. gemini-embedding-2-preview
    dim = settings.embed_dim           # 768

    if _USE_NEW_SDK and _new_client is not None:
        # google-genai SDK
        response = _new_client.models.embed_content(
            model=model_name,
            contents=text,
            config=_genai_new.types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=dim,
            ),
        )
        return response.embeddings[0].values
    else:
        # Fallback: deprecated google-generativeai SDK
        kwargs = {
            "model": f"models/{model_name}",
            "content": text,
            "task_type": task_type,
        }
        # output_dimensionality supported in newer versions
        try:
            result = genai.embed_content(output_dimensionality=dim, **kwargs)  # type: ignore[call-arg]
        except TypeError:
            result = genai.embed_content(**kwargs)
        return result["embedding"]


def embed_text(text: str) -> List[float]:
    """Embed a document chunk. Returns a EMBED_DIM-dimensional vector."""
    return _embed(text, "retrieval_document")


def embed_query(text: str) -> List[float]:
    """Embed a query string. Returns a EMBED_DIM-dimensional vector."""
    return _embed(text, "retrieval_query")


def embed_batch(texts: List[str], task_type: str = "retrieval_document") -> List[List[float]]:
    """Embed a list of texts. Safe single-item loop (avoids batch-size limits)."""
    return [_embed(t, task_type) for t in texts]
