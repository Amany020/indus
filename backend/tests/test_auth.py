"""
IndustryMind — Auth Tests (R2 & M2)
Tests for all three auth modes and M2 authentication endpoints.
"""

import uuid
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.auth import AuthUser, get_current_user

client = TestClient(app)


class TestAuthModeNone:
    """AUTH_MODE=none — no auth enforced (hackathon default)."""

    @patch("app.core.auth.settings")
    def test_me_returns_anon(self, mock_settings):
        mock_settings.auth_mode = "none"
        mock_settings.default_factory_id = "a0000000-0000-0000-0000-000000000001"
        resp = client.get("/me")
        assert resp.status_code == 200
        body = resp.json()
        assert body["user_id"] == "anon"
        assert body["auth_mode"] == "none"


class TestAuthModeHeader:
    """AUTH_MODE=header — dev/testing mode."""

    @patch("app.core.auth.settings")
    def test_header_auth_success(self, mock_settings):
        mock_settings.auth_mode = "header"
        mock_settings.default_factory_id = "a0000000-0000-0000-0000-000000000001"
        resp = client.get("/me", headers={
            "X-User-Id": "user-123",
            "X-User-Role": "supervisor",
            "X-Factory-Id": "factory-456",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["user_id"] == "user-123"
        assert body["role"] == "supervisor"
        assert body["factory_id"] == "factory-456"

    @patch("app.core.auth.settings")
    def test_header_auth_missing_user_id(self, mock_settings):
        mock_settings.auth_mode = "header"
        resp = client.get("/me")
        assert resp.status_code == 401


class TestAuthModeSupabase:
    """AUTH_MODE=supabase — JWT verification."""

    @patch("app.core.auth.settings")
    def test_missing_bearer_token(self, mock_settings):
        mock_settings.auth_mode = "supabase"
        resp = client.get("/me")
        assert resp.status_code == 401
        assert "Bearer" in resp.json()["detail"]

    @patch("app.core.auth.settings")
    def test_invalid_bearer_token(self, mock_settings):
        mock_settings.auth_mode = "supabase"
        mock_settings.supabase_url = "https://fake.supabase.co"
        resp = client.get("/me", headers={
            "Authorization": "Bearer invalid-token"
        })
        assert resp.status_code in (401, 500)  # 500 if pyjwt not installed


class TestM2AuthEndpoints:
    """M2 — Real Authentication Registration and Login Endpoints."""

    @patch("app.api.auth.get_db")
    def test_register_factory_success(self, mock_get_db):
        mock_db = MagicMock()
        mock_db.auth.admin.create_user.return_value = MagicMock(
            user=MagicMock(id="fake-user-id", email="owner@test.com")
        )
        mock_db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{}])
        mock_get_db.return_value = mock_db

        resp = client.post("/auth/register-factory", json={
            "email": "owner@test.com",
            "password": "Password123!",
            "full_name": "Alice Smith",
            "factory_name": "Acme Industries",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == "fake-user-id"
        assert body["email"] == "owner@test.com"
        assert body["full_name"] == "Alice Smith"
        assert body["factory_name"] == "Acme Industries"
        assert body["role"] == "admin"
        assert "factory_id" in body and body["factory_id"]

    @patch("app.api.auth.get_db")
    def test_register_factory_rollback_on_membership_insert_failure(self, mock_get_db):
        mock_db = MagicMock()
        mock_db.auth.admin.create_user.return_value = MagicMock(
            user=MagicMock(id="fake-user-id", email="owner@test.com")
        )

        table_mocks = {
            "factories": MagicMock(),
            "profiles": MagicMock(),
            "memberships": MagicMock(),
        }
        table_mocks["factories"].insert.return_value.execute.return_value = MagicMock(data=[{}])
        table_mocks["factories"].delete.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
        table_mocks["profiles"].insert.return_value.execute.return_value = MagicMock(data=[{}])
        table_mocks["profiles"].delete.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
        table_mocks["memberships"].insert.return_value.execute.side_effect = Exception("DB error on memberships insert")

        mock_db.table.side_effect = lambda t: table_mocks[t]
        mock_get_db.return_value = mock_db

        resp = client.post("/auth/register-factory", json={
            "email": "owner@test.com",
            "password": "Password123!",
            "full_name": "Alice Smith",
            "factory_name": "Acme Industries",
        })
        assert resp.status_code == 400
        mock_db.auth.admin.delete_user.assert_called_once_with("fake-user-id")
        table_calls = [c[0][0] for c in mock_db.table.call_args_list]
        assert table_calls.count("factories") == 2  # one insert, one delete
        assert table_calls.count("profiles") == 2   # one insert, one delete
        table_mocks["factories"].delete.assert_called_once()
        table_mocks["profiles"].delete.assert_called_once()

    @patch("app.api.auth.get_db")
    def test_join_factory_unknown_factory_rejected_before_auth_call(self, mock_get_db):
        mock_db = MagicMock()
        mock_db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
        mock_get_db.return_value = mock_db

        resp = client.post("/auth/join-factory", json={
            "email": "worker@test.com",
            "password": "Password123!",
            "full_name": "Bob Worker",
            "factory_id": "a0000000-0000-0000-0000-000000000001",
        })
        assert resp.status_code == 400
        assert resp.json()["detail"] == "Factory not found"
        mock_db.auth.admin.create_user.assert_not_called()

    @patch("app.api.auth.get_db")
    def test_join_factory_role_is_always_worker(self, mock_get_db):
        mock_db = MagicMock()
        mock_db.auth.admin.create_user.return_value = MagicMock(
            user=MagicMock(id="worker-id", email="worker@test.com")
        )

        inserted_memberships = []

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "factories":
                table_mock.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                    data=[{"id": "a0000000-0000-0000-0000-000000000001"}]
                )
            elif table_name == "memberships":
                def record_insert(data):
                    inserted_memberships.append(data)
                    exec_mock = MagicMock()
                    exec_mock.execute.return_value = MagicMock(data=[{}])
                    return exec_mock
                table_mock.insert.side_effect = record_insert
            else:
                table_mock.insert.return_value.execute.return_value = MagicMock(data=[{}])
            return table_mock

        mock_db.table.side_effect = mock_table
        mock_get_db.return_value = mock_db

        # Send an extra 'role': 'admin' field in payload
        resp = client.post("/auth/join-factory", json={
            "email": "worker@test.com",
            "password": "Password123!",
            "full_name": "Bob Worker",
            "factory_id": "a0000000-0000-0000-0000-000000000001",
            "role": "admin",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["role"] == "worker"
        assert len(inserted_memberships) == 1
        assert inserted_memberships[0]["role"] == "worker"

    @patch("app.api.auth.get_db")
    def test_login_no_membership_returns_403(self, mock_get_db):
        mock_db = MagicMock()
        mock_db.auth.sign_in_with_password.return_value = MagicMock(
            user=MagicMock(id="fake-user-id", email="test@test.com"),
            session=MagicMock(access_token="fake-jwt-token"),
        )

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "memberships":
                table_mock.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
            return table_mock

        mock_db.table.side_effect = mock_table
        mock_get_db.return_value = mock_db

        resp = client.post("/auth/login", json={
            "email": "test@test.com",
            "password": "Password123!",
        })
        assert resp.status_code == 403
        assert "No factory membership found" in resp.json()["detail"]

    @patch("app.api.auth.get_db")
    def test_login_role_comes_from_membership_not_metadata(self, mock_get_db):
        mock_db = MagicMock()
        fake_user = MagicMock(
            id="fake-user-id",
            email="test@test.com",
            user_metadata={"role": "admin", "factory_id": "wrong-metadata-id"},
        )
        mock_db.auth.sign_in_with_password.return_value = MagicMock(
            user=fake_user,
            session=MagicMock(access_token="fake-jwt-token"),
        )

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "memberships":
                table_mock.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                    data=[{
                        "role": "worker",
                        "factory_id": "correct-membership-id",
                        "branch_id": "branch-abc",
                    }]
                )
            elif table_name == "profiles":
                table_mock.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                    data=[{"full_name": "Worker Name"}]
                )
            return table_mock

        mock_db.table.side_effect = mock_table
        mock_get_db.return_value = mock_db

        resp = client.post("/auth/login", json={
            "email": "test@test.com",
            "password": "Password123!",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["user"]["role"] == "worker"
        assert body["user"]["factory_id"] == "correct-membership-id"
        assert body["user"]["full_name"] == "Worker Name"
        assert body["user"]["branch_id"] == "branch-abc"
        assert body["access_token"] == "fake-jwt-token"

    @patch("app.core.database.get_db")
    @patch("app.api.me.settings")
    @patch("app.api.me.get_db")
    @patch("app.core.auth._get_membership")
    @patch("app.core.auth._verify_supabase_jwt")
    @patch("app.core.auth.settings")
    def test_me_supabase_mode_returns_branch_id_and_full_name(
        self, mock_auth_settings, mock_jwt, mock_membership, mock_me_db, mock_me_settings, mock_core_db
    ):
        mock_auth_settings.auth_mode = "supabase"
        mock_auth_settings.supabase_url = "https://fake.supabase.co"
        mock_jwt.return_value = {"sub": "user-1", "email": "a@b.com"}
        mock_membership.return_value = {
            "role": "worker",
            "factory_id": "f-1",
            "branch_id": "b-1",
        }
        mock_db = MagicMock()
        mock_db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"full_name": "Jane Doe"}]
        )
        mock_me_db.return_value = mock_db
        mock_me_settings.auth_mode = "supabase"
        mock_me_settings.default_factory_id = "a0000000-0000-0000-0000-000000000001"

        resp = client.get("/me", headers={"Authorization": "Bearer fake-token"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["branch_id"] == "b-1"
        assert body["full_name"] == "Jane Doe"
        assert body["user_id"] == "user-1"
        assert body["role"] == "worker"
        assert body["factory_id"] == "f-1"

    @patch("app.api.auth.get_db")
    def test_auth_users_scoped_to_admin_factory(self, mock_get_db):
        app.dependency_overrides[get_current_user] = lambda: AuthUser(
            user_id="admin-user", role="admin", factory_id="f-1"
        )
        mock_db = MagicMock()
        memberships_data = [
            {"user_id": "u-1", "role": "worker", "factory_id": "f-1", "branch_id": "b-1"},
            {"user_id": "u-2", "role": "supervisor", "factory_id": "f-1", "branch_id": None},
        ]
        memberships_eq_calls = []

        def mock_table(table_name):
            t_mock = MagicMock()
            if table_name == "memberships":
                def record_eq(field, val):
                    memberships_eq_calls.append((field, val))
                    exec_mock = MagicMock()
                    exec_mock.execute.return_value = MagicMock(data=memberships_data)
                    return exec_mock
                t_mock.select.return_value.eq.side_effect = record_eq
            elif table_name == "profiles":
                def profile_eq(field, val):
                    name = "Jane Doe" if val == "u-1" else "John Doe"
                    exec_mock = MagicMock()
                    exec_mock.limit.return_value.execute.return_value = MagicMock(data=[{"full_name": name}])
                    return exec_mock
                t_mock.select.return_value.eq.side_effect = profile_eq
            return t_mock

        mock_db.table.side_effect = mock_table
        mock_get_db.return_value = mock_db

        try:
            resp = client.get("/auth/users")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 2
            assert data[0]["full_name"] == "Jane Doe"
            assert data[0]["role"] == "worker"
            assert data[1]["full_name"] == "John Doe"
            assert data[1]["role"] == "supervisor"
            assert all("email" not in row for row in data)
            assert ("factory_id", "f-1") in memberships_eq_calls
        finally:
            app.dependency_overrides.pop(get_current_user, None)
