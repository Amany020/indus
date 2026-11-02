"""
IndustryMind — Browser TTS Provider (R6)
No-op server-side: tells the frontend to use Web Speech API.
This is the default TTS_PROVIDER.
"""

from __future__ import annotations


def get_audio_url(text: str, language: str = "en") -> dict:
    """
    Return instructions for client-side TTS.
    No audio is generated server-side.
    """
    return {
        "provider": "browser",
        "text": text,
        "language": language,
        "audio_url": None,
        "message": "Use Web Speech API on the client",
    }
