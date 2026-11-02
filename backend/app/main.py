"""
IndustryMind — FastAPI Application
Evidence-first multimodal assistant for industrial workers.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    logger.info("Starting IndustryMind backend...")
    logger.info("Factory ID: %s", settings.default_factory_id)
    logger.info("Demo cache: %s", settings.demo_cache)
    logger.info("Embed model: %s (dim=%d)", settings.embed_model, settings.embed_dim)

    # Auto-detect Gemini model
    if settings.gemini_api_key:
        try:
            from app.services.gemini_client import get_selected_model
            model = get_selected_model()
            logger.info("Gemini model: %s", model)
        except Exception as e:
            logger.warning("Gemini model detection failed: %s", e)
    else:
        logger.warning("GEMINI_API_KEY not set — LLM features disabled")

    yield

    logger.info("Shutting down IndustryMind backend.")


app = FastAPI(
    title="IndustryMind",
    description=(
        "Evidence-first multimodal assistant for industrial workers. "
        "Answers are validated against approved sources."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register Routers ─────────────────────────────────────────────────────────

from app.api.machines import router as machines_router
from app.api.documents import router as documents_router
from app.api.queries import router as queries_router
from app.api.voice import router as voice_router
from app.api.tips import router as tips_router
from app.api.escalations import router as escalations_router
from app.api.sessions import router as sessions_router
from app.api.analytics import router as analytics_router
from app.api.me import router as me_router
from app.api.sop_proposals import router as sop_proposals_router
from app.api.knowledge_graph import router as knowledge_graph_router
from app.api.change_impact import router as change_impact_router

from app.api.factories import router as factories_router
from app.api.auth import router as auth_router
from app.api.reports import router as reports_router

app.include_router(machines_router)
app.include_router(documents_router)
app.include_router(queries_router)
app.include_router(voice_router)
app.include_router(tips_router)
app.include_router(escalations_router)
app.include_router(sessions_router)
app.include_router(analytics_router)
app.include_router(me_router)
app.include_router(sop_proposals_router)
app.include_router(knowledge_graph_router)
app.include_router(change_impact_router)
app.include_router(factories_router)
app.include_router(auth_router)
app.include_router(reports_router)



@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "IndustryMind",
        "version": "0.1.0",
        "demo_cache": settings.demo_cache,
    }
