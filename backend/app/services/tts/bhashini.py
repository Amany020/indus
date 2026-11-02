"""
IndustryMind — Bhashini TTS Provider (R6)
Server-side TTS using Bhashini API for Hindi/regional languages.
Feature-flagged: only used when TTS_PROVIDER=bhashini.
Status: UNVERIFIED — adapter skeleton only until real API credentials available.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Bhashini API endpoint (to be verified with actual docs)
BHASHINI_TTS_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"


async def get_audio_url(text: str, language: str = "hi") -> dict:
    """
    Generate speech audio via Bhashini API.

    Args:
        text: Text to speak
        language: BCP-47 language code (hi, ta, te, etc.)

    Returns:
        dict with provider, audio_url (base64 data URI), language
    """
    if not settings.bhashini_api_key:
        logger.warning("Bhashini API key not configured")
        return {
            "provider": "bhashini",
            "text": text,
            "language": language,
            "audio_url": None,
            "error": "BHASHINI_API_KEY not set",
        }

    # Map language codes to Bhashini source language codes
    lang_map = {
        "hi": "hi",
        "en": "en",
        "ta": "ta",
        "te": "te",
        "bn": "bn",
        "mr": "mr",
        "gu": "gu",
        "kn": "kn",
        "ml": "ml",
        "pa": "pa",
    }
    source_lang = lang_map.get(language, "hi")

    try:
        headers = {
            "Authorization": settings.bhashini_api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "pipelineTasks": [
                {
                    "taskType": "tts",
                    "config": {
                        "language": {"sourceLanguage": source_lang},
                        "gender": "female",
                    },
                }
            ],
            "inputData": {
                "input": [{"source": text}],
            },
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(BHASHINI_TTS_URL, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        # Extract audio from response (structure depends on actual API)
        audio_content = None
        pipeline_output = data.get("pipelineResponse", [])
        if pipeline_output:
            output_list = pipeline_output[0].get("output", [])
            if output_list:
                audio_content = output_list[0].get("audioContent")

        if audio_content:
            audio_url = f"data:audio/wav;base64,{audio_content}"
        else:
            audio_url = None

        return {
            "provider": "bhashini",
            "text": text,
            "language": language,
            "audio_url": audio_url,
        }

    except Exception as e:
        logger.error("Bhashini TTS failed: %s", e)
        return {
            "provider": "bhashini",
            "text": text,
            "language": language,
            "audio_url": None,
            "error": str(e),
        }
