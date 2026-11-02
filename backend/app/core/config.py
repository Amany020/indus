"""
IndustryMind — Core Configuration
All settings from environment variables. Never hard-code secrets.
"""

from __future__ import annotations

import os
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from .env"""

    # ── Supabase ─────────────────────────────────────────────────────────────
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""
    supabase_bucket: str = "industrymind"

    # ── Google AI ────────────────────────────────────────────────────────────
    gemini_api_key: str = ""
    gemini_model: str = ""  # Auto-detected if empty
    gemini_vision_model: Optional[str] = None  # Defaults to gemini_model

    # ── Embeddings ───────────────────────────────────────────────────────────
    embed_model: str = "gemini-embedding-2-preview"
    embed_dim: int = 768

    # ── Retrieval Thresholds ─────────────────────────────────────────────────
    min_sim: float = 0.35  # Below → escalate immediately
    high_sim: float = 0.60  # Below → status=limited ceiling

    # ── Demo ─────────────────────────────────────────────────────────────────
    demo_cache: bool = False

    # ── Factory (hackathon: single factory) ──────────────────────────────────
    default_factory_id: str = "a0000000-0000-0000-0000-000000000001"

    # ── Safety gate ──────────────────────────────────────────────────────────
    safety_rule_version: str = "1.0"

    # ── Validation ───────────────────────────────────────────────────────────
    max_validation_retries: int = 2

    # ── Feature Flags (R2-R10, all DEFAULT OFF) ──────────────────────────────
    # R2: Authentication
    auth_mode: str = "none"  # "none" | "supabase" | "header"

    # R3: Multi-factory tenancy
    tenancy_enforced: bool = False
    rls_enabled: bool = False

    # R4: Retention jobs
    retention_jobs_enabled: bool = False
    retention_query_days: int = 365
    retention_draft_days: int = 30
    retention_audio_days: int = 7

    # R5: QR scanning
    qr_scan_enabled: bool = False

    # R6: TTS
    tts_provider: str = "browser"  # "browser" | "bhashini"
    bhashini_api_key: str = ""

    # R7: SOP proposals
    sop_proposals_enabled: bool = False

    # R8: Knowledge graph
    knowledge_graph_enabled: bool = False

    # R9: Change-impact engine
    change_impact_enabled: bool = False

    # R10: Multi-agent review
    multi_agent_review: bool = False

    @property
    def effective_vision_model(self) -> str:
        return self.gemini_vision_model or self.gemini_model

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
