"""
IndustryMind — Response Contract Tests
Validate the exact shape of every public endpoint response.
These tests run against the app (via TestClient) and ensure
that no future change silently alters the API contract.
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.core.auth import AuthUser, get_current_user

client = TestClient(app)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _mock_supabase():
    """Create a mock supabase client that returns sensible defaults."""
    mock = MagicMock()
    # Default: return empty list for any .select().execute()
    mock.table.return_value.select.return_value.execute.return_value.data = []
    mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mock.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    mock.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    mock.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    mock.table.return_value.insert.return_value.execute.return_value.data = [{"id": "test-id"}]
    mock.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{"id": "test-id"}]
    mock.rpc.return_value.execute.return_value.data = []
    return mock


# ─── GET /health ─────────────────────────────────────────────────────────────

class TestHealthContract:
    def test_health_shape(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        required = {"status", "service", "version", "demo_cache"}
        assert required.issubset(body.keys()), f"Missing keys: {required - body.keys()}"
        assert body["service"] == "IndustryMind"


# ─── GET /machines/ ──────────────────────────────────────────────────────────

class TestMachinesContract:
    @patch("app.api.machines.get_db")
    def test_machines_list_shape(self, mock_get_db):
        db = _mock_supabase()
        db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"id": "c0000000-0000-0000-0000-000000000001", "name": "Test Machine",
             "workcell": "A1", "model_number": "TM-100", "qr_code_value": "QR001"}
        ]
        mock_get_db.return_value = db
        resp = client.get("/machines/")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        if body:
            item = body[0]
            assert "id" in item
            assert "name" in item


# ─── POST /query/ ────────────────────────────────────────────────────────────

class TestQueryContract:
    """Test the response shape — not the content quality."""

    @patch("app.api.queries.get_db")
    @patch("app.api.queries.check_demo_cache")
    def test_query_cached_shape(self, mock_cache, mock_get_db):
        """Demo-cached query returns full response shape."""
        app.dependency_overrides[get_current_user] = lambda: AuthUser(
            user_id="test-user", role="worker", factory_id="a0000000-0000-0000-0000-000000000001"
        )
        try:
            db = _mock_supabase()
            mock_get_db.return_value = db
            mock_cache.return_value = {
                "summary": "Test summary",
                "steps": [{"order": 1, "instruction": "Do X", "evidence_ids": ["ev-1"]}],
                "evidence_pack": [{
                    "evidence_id": "ev-1", "chunk_id": "chunk-1",
                    "document_id": "doc-1", "filename": "test.pdf",
                    "revision": "1.0", "page_number": 1,
                    "section_heading": None, "content_type": "text",
                    "content_text": "Content", "image_path": None,
                    "bbox": None, "risk_level": "none", "similarity": 0.9
                }],
                "status": "supported",
                "warnings": [],
            }
            resp = client.post("/query/", json={
                "machine_id": "c0000000-0000-0000-0000-000000000001",
                "query_text": "how to change conveyor belt",
            })
            assert resp.status_code == 200
            body = resp.json()
            required = {"query_id", "status", "summary", "steps", "warnings",
                         "citations", "evidence_pack", "latency_ms"}
            assert required.issubset(body.keys()), f"Missing: {required - body.keys()}"
            assert body["status"] in {"supported", "limited", "escalate", "restricted"}
        finally:
            app.dependency_overrides.pop(get_current_user, None)


# ─── GET /escalations/ ──────────────────────────────────────────────────────

class TestEscalationsContract:
    @patch("app.api.escalations.get_db")
    def test_escalations_list_shape(self, mock_get_db):
        db = _mock_supabase()
        mock_get_db.return_value = db
        resp = client.get("/escalations/")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)


# ─── GET /analytics/summary ─────────────────────────────────────────────────

class TestAnalyticsContract:
    @patch("app.api.analytics.get_db")
    def test_analytics_summary_shape(self, mock_get_db):
        db = _mock_supabase()
        # Mock the count queries
        count_result = MagicMock()
        count_result.count = 0
        db.table.return_value.select.return_value.eq.return_value.execute.return_value = count_result
        db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        db.table.return_value.select.return_value.eq.return_value.execute.return_value.count = 0
        mock_get_db.return_value = db
        resp = client.get("/analytics/summary")
        assert resp.status_code == 200
        body = resp.json()
        assert "total_queries" in body or "error" not in body


# ─── GET /documents/ ─────────────────────────────────────────────────────────

class TestDocumentsContract:
    @patch("app.api.documents.get_db")
    def test_documents_list_shape(self, mock_get_db):
        db = _mock_supabase()
        mock_get_db.return_value = db
        resp = client.get("/documents/")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)


# ─── GET /tips/ ──────────────────────────────────────────────────────────────

class TestTipsContract:
    @patch("app.api.tips.get_db")
    def test_tips_list_shape(self, mock_get_db):
        db = _mock_supabase()
        mock_get_db.return_value = db
        resp = client.get("/tips/")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)


# ─── POST /sessions/ ─────────────────────────────────────────────────────────

class TestSessionsContract:
    @patch("app.api.sessions.get_db")
    def test_create_session_shape(self, mock_get_db):
        app.dependency_overrides[get_current_user] = lambda: AuthUser(
            user_id="test-user", role="worker", factory_id="a0000000-0000-0000-0000-000000000001"
        )
        try:
            db = _mock_supabase()
            db.table.return_value.insert.return_value.execute.return_value.data = [{
                "id": "sess-1", "machine_id": "c0000000-0000-0000-0000-000000000001",
                "status": "active",
            }]
            mock_get_db.return_value = db
            resp = client.post("/sessions/", json={
                "machine_id": "c0000000-0000-0000-0000-000000000001",
                "symptom_text": "conveyor belt slipping",
            })
            assert resp.status_code == 200
            body = resp.json()
            assert "id" in body or "session_id" in body
        finally:
            app.dependency_overrides.pop(get_current_user, None)


# ─── Voice endpoints ─────────────────────────────────────────────────────────

class TestVoiceContract:
    def test_voice_languages_shape(self):
        resp = client.get("/voice/languages")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        if body:
            assert "code" in body[0]
            assert "name" in body[0]
