"""
IndustryMind — Authentication API
User registration, login, and user management using Supabase Auth and memberships.
"""

from __future__ import annotations

from datetime import datetime, timezone
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import AuthUser, get_current_user, require_role, normalize_role
from app.core.authz import resolve_factory_id
from app.core.database import get_auth_client, get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


class RegisterFactoryRequest(BaseModel):
    email: str
    password: str
    full_name: str
    factory_name: str


class JoinFactoryRequest(BaseModel):
    email: str
    password: str
    full_name: str
    factory_id: str
    branch_id: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/register-factory")
async def register_factory(body: RegisterFactoryRequest):
    """
    Register a brand-new factory and creator account.
    The creator is assigned the 'admin' role for this factory.
    """
    db = get_db()
    email = body.email.strip()
    password = body.password
    full_name = body.full_name.strip()
    factory_name = body.factory_name.strip()

    if not email or not password or not full_name or not factory_name:
        raise HTTPException(
            status_code=400,
            detail="email, password, full_name, and factory_name are required",
        )

    user_id = None
    factory_id = None
    factory_created = False
    profile_created = False

    try:
        # Step b: Create user in Supabase Auth
        user_res = db.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        user = user_res.user
        user_id = user.id

        # Step c: Insert factory
        factory_id = str(uuid.uuid4())
        db.table("factories").insert({
            "id": factory_id,
            "name": factory_name,
        }).execute()
        factory_created = True

        # Step d: Insert profile
        db.table("profiles").insert({
            "user_id": user_id,
            "full_name": full_name,
        }).execute()
        profile_created = True

        # Step e: Insert membership (role='admin', branch_id=None)
        db.table("memberships").insert({
            "user_id": user_id,
            "factory_id": factory_id,
            "role": "admin",
            "branch_id": None,
        }).execute()

        return {
            "id": user_id,
            "email": user.email,
            "full_name": full_name,
            "factory_id": factory_id,
            "factory_name": factory_name,
            "role": "admin",
        }
    except Exception as e:
        logger.error("register-factory failed: %s", e)
        # Step f: Rollback on failure
        if profile_created and user_id:
            try:
                db.table("profiles").delete().eq("user_id", user_id).execute()
            except Exception as rb_err:
                logger.warning("Rollback profiles failed: %s", rb_err)
        if factory_created and factory_id:
            try:
                db.table("factories").delete().eq("id", factory_id).execute()
            except Exception as rb_err:
                logger.warning("Rollback factories failed: %s", rb_err)
        if user_id:
            try:
                db.auth.admin.delete_user(user_id)
            except Exception as rb_err:
                logger.warning("Rollback auth user failed: %s", rb_err)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/join-factory")
async def join_factory(body: JoinFactoryRequest):
    """
    Join an existing factory as a worker.
    Role is strictly hardcoded to 'worker' — self-selection of roles is disallowed.
    """
    db = get_db()
    email = body.email.strip()
    password = body.password
    full_name = body.full_name.strip()
    factory_id = body.factory_id.strip()
    branch_id = body.branch_id.strip() if body.branch_id else None

    # Step a: Validate required fields and UUID formats
    if not email or not password or not full_name or not factory_id:
        raise HTTPException(
            status_code=400,
            detail="email, password, full_name, and factory_id are required",
        )

    try:
        uuid.UUID(factory_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid factory_id UUID format")

    if branch_id:
        try:
            uuid.UUID(branch_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid branch_id UUID format")

    # Step b: Verify factory exists BEFORE creating auth user
    fact_res = db.table("factories").select("id").eq("id", factory_id).limit(1).execute()
    if not fact_res.data:
        raise HTTPException(status_code=400, detail="Factory not found")

    # Step c: Verify branch belongs to factory BEFORE creating auth user
    if branch_id:
        branch_res = (
            db.table("branches")
            .select("id")
            .eq("id", branch_id)
            .eq("factory_id", factory_id)
            .limit(1)
            .execute()
        )
        if not branch_res.data:
            raise HTTPException(
                status_code=400,
                detail="Branch does not belong to this factory",
            )

    user_id = None
    profile_created = False

    try:
        # Step d: Create user in Supabase Auth
        user_res = db.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        user = user_res.user
        user_id = user.id

        # Step e: Insert profile
        db.table("profiles").insert({
            "user_id": user_id,
            "full_name": full_name,
        }).execute()
        profile_created = True

        # Step f: Insert membership (role hardcoded to 'worker')
        db.table("memberships").insert({
            "user_id": user_id,
            "factory_id": factory_id,
            "role": "worker",
            "branch_id": branch_id,
        }).execute()

        return {
            "id": user_id,
            "email": user.email,
            "full_name": full_name,
            "factory_id": factory_id,
            "branch_id": branch_id,
            "role": "worker",
        }
    except Exception as e:
        logger.error("join-factory failed: %s", e)
        # Step g: Rollback on failure
        if profile_created and user_id:
            try:
                db.table("profiles").delete().eq("user_id", user_id).execute()
            except Exception as rb_err:
                logger.warning("Rollback profiles failed: %s", rb_err)
        if user_id:
            try:
                db.auth.admin.delete_user(user_id)
            except Exception as rb_err:
                logger.warning("Rollback auth user failed: %s", rb_err)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
async def login_user(body: LoginRequest):
    """
    Authenticate user credentials.
    Tenancy and role are strictly resolved fresh from memberships, never from JWT or user_metadata.
    """
    from app.core.database import get_auth_client

    db = get_db()
    email = body.email.strip()
    password = body.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    # Step a: Authenticate with Supabase Auth
    try:
        session = get_auth_client().auth.sign_in_with_password({
            "email": email,
            "password": password,
        })
    except Exception as e:
        logger.error("Login failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = session.user
    user_id = user.id

    # Step c: Fresh query to memberships for role, factory_id, and branch_id
    mem_res = (
        db.table("memberships")
        .select("role, factory_id, branch_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not mem_res.data:
        raise HTTPException(
            status_code=403,
            detail="No factory membership found for this account",
        )
    membership = mem_res.data[0]

    # Step d: Fresh query to profiles for full_name
    prof_res = (
        db.table("profiles")
        .select("full_name")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    full_name = prof_res.data[0]["full_name"] if prof_res.data else ""

    # Step f: Return tokens and verified tenancy/role data
    return {
        "access_token": session.session.access_token,
        "user": {
            "id": user_id,
            "email": user.email,
            "full_name": full_name,
            "role": membership["role"],
            "factory_id": membership["factory_id"],
            "branch_id": membership.get("branch_id"),
        },
    }


@router.get("/users")
async def list_users(user: AuthUser = Depends(require_role("reviewer", "admin"))):
    """
    List members in the authenticated user's factory.
    """
    db = get_db()
    factory_id = resolve_factory_id(user)
    try:
        mem_res = (
            db.table("memberships")
            .select("user_id, role, factory_id, branch_id")
            .eq("factory_id", factory_id)
            .execute()
        )
        members = mem_res.data or []
        users = []
        for row in members:
            full_name = None
            try:
                prof_res = (
                    db.table("profiles")
                    .select("full_name")
                    .eq("user_id", row["user_id"])
                    .limit(1)
                    .execute()
                )
                if prof_res.data:
                    full_name = prof_res.data[0].get("full_name")
            except Exception as prof_err:
                logger.warning("Profile lookup failed for %s: %s", row.get("user_id"), prof_err)

            users.append({
                "user_id": row["user_id"],
                "full_name": full_name,
                "role": row["role"],
                "factory_id": row["factory_id"],
                "branch_id": row.get("branch_id"),
            })
        return users
    except Exception as e:
        logger.error("Listing users failed: %s", e)
        return []


class RoleUpdateRequest(BaseModel):
    role: str


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: RoleUpdateRequest,
    user: AuthUser = Depends(require_role("reviewer", "admin")),
):
    """
    Promote or demote a user's role within the authenticated user's factory.
    Admins can assign 'worker', 'expert', or 'supervisor'.
    Reviewers can only assign 'worker' or 'expert' to targets currently 'worker' or 'expert'.
    """
    if body.role not in ("worker", "expert", "supervisor"):
        raise HTTPException(
            status_code=400,
            detail="Invalid role: must be 'worker', 'expert', or 'supervisor'",
        )

    if user_id == user.user_id:
        raise HTTPException(
            status_code=400,
            detail="You cannot change your own role",
        )

    db = get_db()
    factory_id = resolve_factory_id(user)

    target_res = (
        db.table("memberships")
        .select("id, user_id, role, factory_id, branch_id")
        .eq("user_id", user_id)
        .eq("factory_id", factory_id)
        .limit(1)
        .execute()
    )
    if not target_res.data:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    target_membership = target_res.data[0]
    target_role = target_membership.get("role")

    if target_role in ("admin", "viewer"):
        raise HTTPException(
            status_code=403,
            detail="Cannot modify users with admin or viewer roles",
        )

    caller_role = normalize_role(user.role)

    if caller_role == "reviewer":
        if target_role not in ("worker", "expert") or body.role not in ("worker", "expert"):
            raise HTTPException(
                status_code=403,
                detail="Reviewers can only promote or demote between worker and expert",
            )
    elif caller_role == "admin":
        if target_role not in ("worker", "expert", "supervisor"):
            raise HTTPException(
                status_code=403,
                detail="Cannot modify target role",
            )
    else:
        raise HTTPException(status_code=403, detail="Not authorized")

    res = (
        db.table("memberships")
        .update({
            "role": body.role,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("user_id", user_id)
        .eq("factory_id", factory_id)
        .execute()
    )

    if not res.data:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    logger.info(
        "User %s (%s) updated target %s role from %s to %s in factory %s",
        user.user_id,
        caller_role,
        user_id,
        target_role,
        body.role,
        factory_id,
    )

    full_name = None
    try:
        prof_res = (
            db.table("profiles")
            .select("full_name")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if prof_res.data:
            full_name = prof_res.data[0].get("full_name")
    except Exception as prof_err:
        logger.warning("Profile lookup failed for %s: %s", user_id, prof_err)

    updated_row = res.data[0]
    return {
        "user_id": updated_row.get("user_id", user_id),
        "full_name": full_name,
        "role": updated_row.get("role", body.role),
        "factory_id": updated_row.get("factory_id", factory_id),
        "branch_id": updated_row.get("branch_id"),
    }


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    user: AuthUser = Depends(get_current_user),
):
    """
    Change user password after verifying current password.
    """
    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 8 characters",
        )

    if not user.email:
        raise HTTPException(status_code=400, detail="User email not available")

    # Step a: Verify current password with Supabase Auth
    try:
        get_auth_client().auth.sign_in_with_password({
            "email": user.email,
            "password": body.current_password,
        })
    except Exception as e:
        logger.error("Password verification failed for user %s: %s", user.user_id, e)
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    # Step b: Update password in Supabase Auth via Admin API
    db = get_db()
    try:
        db.auth.admin.update_user_by_id(
            user.user_id,
            {"password": body.new_password},
        )
    except Exception as e:
        logger.error("Admin update password failed for user %s: %s", user.user_id, e)
        raise HTTPException(status_code=400, detail=str(e))

    return {"status": "success", "message": "Password updated successfully"}


