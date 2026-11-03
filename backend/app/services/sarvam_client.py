"""
IndustryMind — Sarvam AI Client
Provides Speech-to-Text (STT) and Text-to-Speech (TTS) via the Sarvam AI API.
API credentials are read strictly from application settings and never logged or exposed.
"""

from __future__ import annotations

import base64
import io
import logging
import re
import wave
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SARVAM_BASE_URL = "https://api.sarvam.ai"
SUPPORTED_LANGUAGES = (
    "en-IN", "hi-IN", "bn-IN", "gu-IN", "kn-IN",
    "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"
)
LANGUAGE_ALIASES = {
    "en": "en-IN",
    "hi": "hi-IN",
    "bn": "bn-IN",
    "gu": "gu-IN",
    "kn": "kn-IN",
    "ml": "ml-IN",
    "mr": "mr-IN",
    "od": "od-IN",
    "or": "od-IN",
    "pa": "pa-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "as": "as-IN",
    "ur": "ur-IN",
}
REQUEST_TIMEOUT_SECONDS = 30.0


def _validate_language(language_code: str) -> str:
    """Validate and normalize language code to Sarvam BCP-47 format."""
    code = (language_code or "en-IN").strip().lower()
    if code in LANGUAGE_ALIASES:
        return LANGUAGE_ALIASES[code]
    for supported in SUPPORTED_LANGUAGES:
        if code == supported.lower():
            return supported
    return "en-IN" 


def _get_api_key() -> str:
    """Retrieve API key or raise an explicit configuration error."""
    key = settings.sarvam_api_key.strip()
    if not key:
        raise HTTPException(
            status_code=500,
            detail="Sarvam API key is not configured.",
        )
    return key


def _split_text_into_chunks(
    text: str, max_chars: int, max_chunks: int = 4
) -> Tuple[List[str], bool]:
    """
    Split long text at sentence boundaries into chunks <= max_chars.
    Caps at max_chunks (default 4) and returns (chunks, was_truncated).
    """
    text = text.strip()
    if not text:
        return [], False
    if len(text) <= max_chars:
        return [text], False

    sentences = re.split(r"(?<=[.!?।\n])\s+", text)
    chunks: List[str] = []
    current_chunk = ""
    truncated = False

    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if len(s) > max_chars:
            words = s.split()
            for w in words:
                if len(current_chunk) + len(w) + 1 <= max_chars:
                    current_chunk = f"{current_chunk} {w}".strip()
                else:
                    if current_chunk:
                        chunks.append(current_chunk)
                        if len(chunks) >= max_chunks:
                            return chunks, True
                    current_chunk = w[:max_chars]
        elif len(current_chunk) + len(s) + 1 <= max_chars:
            current_chunk = f"{current_chunk} {s}".strip()
        else:
            if current_chunk:
                chunks.append(current_chunk)
                if len(chunks) >= max_chunks:
                    return chunks, True
            current_chunk = s

    if current_chunk:
        if len(chunks) < max_chunks:
            chunks.append(current_chunk)
        else:
            truncated = True

    return chunks, truncated


def _concatenate_wav_bytes(wav_bytes_list: List[bytes]) -> bytes:
    """Concatenate multiple PCM WAV byte buffers using standard library wave module."""
    valid_wavs = [w for w in wav_bytes_list if len(w) >= 44]
    if not valid_wavs:
        return b""
    if len(valid_wavs) == 1:
        return valid_wavs[0]

    out_io = io.BytesIO()
    with wave.open(io.BytesIO(valid_wavs[0]), "rb") as first_wav:
        params = first_wav.getparams()
        frames = [first_wav.readframes(first_wav.getnframes())]

    for wb in valid_wavs[1:]:
        with wave.open(io.BytesIO(wb), "rb") as w:
            frames.append(w.readframes(w.getnframes()))

    with wave.open(out_io, "wb") as out_wav:
        out_wav.setparams(params)
        for f in frames:
            out_wav.writeframes(f)

    return out_io.getvalue()


async def transcribe(
    audio_bytes: bytes,
    content_type: str = "audio/webm",
    language_code: str = "en-IN",
) -> Dict[str, str]:
    """
    Transcribe speech audio using Sarvam AI /speech-to-text.
    Returns: {"transcript": str, "language_code": str}
    """
    valid_lang = _validate_language(language_code)
    api_key = _get_api_key()

    if len(audio_bytes) < 100:
        return {"transcript": "", "language_code": valid_lang}

    filename = (
        "audio.webm"
        if "webm" in content_type
        else "audio.wav"
        if "wav" in content_type
        else "audio.mp3"
    )

    files = {
        "file": (filename, audio_bytes, content_type or "audio/webm"),
    }
    data = {
        "model": settings.sarvam_stt_model,
        "language_code": valid_lang,
    }
    headers = {
        "api-subscription-key": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                f"{SARVAM_BASE_URL}/speech-to-text",
                files=files,
                data=data,
                headers=headers,
            )
            resp.raise_for_status()
            res_data = resp.json()

        transcript_text = res_data.get("transcript", "").strip()
        resp_lang = res_data.get("language_code", valid_lang)
        return {
            "transcript": transcript_text,
            "language_code": resp_lang,
        }

    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        logger.error("Sarvam STT failed with HTTP %s", status)
        msg = e.response.text[:120] if e.response.text else "API error"
        raise HTTPException(
            status_code=502 if status >= 500 else 400,
            detail=f"Sarvam STT error ({status}): {msg}",
        )
    except httpx.RequestError as e:
        logger.error("Sarvam STT request error: %s", type(e).__name__)
        raise HTTPException(
            status_code=503,
            detail="Sarvam STT service unreachable.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Sarvam STT unexpected error: %s", type(e).__name__)
        raise HTTPException(status_code=500, detail=f"STT processing failed: {e}")


async def synthesize(text: str, language_code: str = "en-IN") -> bytes:
    """
    Convert text into speech audio WAV bytes via Sarvam AI /text-to-speech.
    Splits long text into chunks <= sarvam_tts_max_chars (max 4 chunks)
    and stitches the resulting WAV streams.
    """
    valid_lang = _validate_language(language_code)
    api_key = _get_api_key()

    clean_text = text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="text is required")

    chunks, was_truncated = _split_text_into_chunks(
        clean_text,
        max_chars=settings.sarvam_tts_max_chars,
        max_chunks=4,
    )
    if was_truncated:
        logger.warning(
            "TTS input exceeded maximum chunk capacity (4 chunks); text was truncated."
        )

    headers = {
        "api-subscription-key": api_key,
        "Content-Type": "application/json",
    }

    wav_chunks: List[bytes] = []

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            for chunk in chunks:
                payload = {
                    "inputs": [chunk],
                    "target_language_code": valid_lang,
                    "speaker": settings.sarvam_tts_speaker,
                    "model": settings.sarvam_tts_model,
                }
                resp = await client.post(
                    f"{SARVAM_BASE_URL}/text-to-speech",
                    json=payload,
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()
                audios = data.get("audios", [])
                if not audios:
                    logger.warning("Sarvam TTS returned empty audio list for chunk")
                    continue
                b64_str = audios[0]
                wav_bytes = base64.b64decode(b64_str)
                wav_chunks.append(wav_bytes)

        if not wav_chunks:
            raise HTTPException(
                status_code=502, detail="Sarvam TTS returned no audio data."
            )

        return _concatenate_wav_bytes(wav_chunks)

    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        logger.error("Sarvam TTS failed with HTTP %s", status)
        msg = e.response.text[:120] if e.response.text else "API error"
        raise HTTPException(
            status_code=502 if status >= 500 else 400,
            detail=f"Sarvam TTS error ({status}): {msg}",
        )
    except httpx.RequestError as e:
        logger.error("Sarvam TTS request error: %s", type(e).__name__)
        raise HTTPException(
            status_code=503,
            detail="Sarvam TTS service unreachable.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Sarvam TTS unexpected error: %s", type(e).__name__)
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {e}")

async def translate(
    text: str,
    target_language_code: str,
    source_language_code: str = "auto",
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Translate text using Sarvam AI /translate endpoint.
    Supports English and 10+ major Indian languages without Bhashini.
    """
    text = text.strip()
    if not text:
        return {
            "translated_text": "",
            "source_language_code": source_language_code,
            "target_language_code": target_language_code,
            "provider": "sarvam",
        }

    api_key = _get_api_key()
    norm_target = _validate_language(target_language_code)

    norm_source = "auto"
    if source_language_code and source_language_code.lower() != "auto":
        norm_source = _validate_language(source_language_code)

    payload = {
        "input": text,
        "source_language_code": norm_source,
        "target_language_code": norm_target,
        "model": model or getattr(settings, "sarvam_translate_model", "mayura:v1"),
    }

    headers = {
        "api-subscription-key": api_key,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{SARVAM_BASE_URL}/translate",
                json=payload,
                headers=headers,
            )
            if response.status_code != 200:
                logger.error("Sarvam Translation failed with HTTP %s: %s", response.status_code, response.text)
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Sarvam Translation error: {response.text}",
                )
            data = response.json()
            return {
                "translated_text": data.get("translated_text", ""),
                "source_language_code": data.get("source_language_code", norm_source),
                "target_language_code": norm_target,
                "provider": "sarvam",
            }
    except httpx.RequestError as e:
        logger.error("Sarvam Translation request error: %s", type(e).__name__)
        raise HTTPException(status_code=503, detail="Sarvam Translation service unreachable.")

