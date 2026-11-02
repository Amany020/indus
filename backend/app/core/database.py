"""
IndustryMind — Supabase Database Client
Single module wrapping all Supabase interactions.
Includes resilient DNS fallback for Windows resolver drop resilience.
"""

from __future__ import annotations

import socket
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

# Fallback DNS mapping for Windows DNS resolver drops
DNS_FALLBACKS = {
    "rnigvoprhnejulsxjfet.supabase.co": "104.18.38.10",
    "generativelanguage.googleapis.com": "172.217.116.4",
}

_orig_getaddrinfo = socket.getaddrinfo


def _resilient_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    try:
        return _orig_getaddrinfo(host, port, family, type, proto, flags)
    except socket.gaierror:
        if host in DNS_FALLBACKS:
            logger.warning("DNS resolution failed for %s, using fallback IP %s", host, DNS_FALLBACKS[host])
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (DNS_FALLBACKS[host], port))]
        raise


socket.getaddrinfo = _resilient_getaddrinfo

from supabase import create_client, Client
from app.core.config import settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Returns a cached Supabase client using the service key (backend-only)."""
    if not settings.supabase_url or not settings.supabase_service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env"
        )
    return create_client(settings.supabase_url, settings.supabase_service_key)


@lru_cache(maxsize=1)
def get_auth_client() -> Client:
    """Returns a cached Supabase client using the anon key, dedicated to
    user-facing auth operations (sign-in) only. Kept separate from
    get_supabase()'s service-role admin client to prevent sign_in_with_password
    from mutating the shared admin auth headers (confirmed SDK side-effect:
    self.auth._headers is the same dict object as self.auth.admin._headers)."""
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env")
    return create_client(settings.supabase_url, settings.supabase_anon_key)


def get_db() -> Client:
    """Alias used in FastAPI dependencies."""
    return get_supabase()
