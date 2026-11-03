"""
IndustryMind — Voice / STT API
POST /stt — Transcribe audio using faster-whisper
Returns: transcript, language, avg_logprob, no_speech_prob, needs_review
"""

from __future__ import annotations

import io
import logging
import tempfile
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException

from app.core.auth import AuthUser, get_current_user
from app.core.config import settings
from app.models.schemas import TranscriptResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Voice"])

# Compatibility fix: PyAV removed metadata_errors which faster-whisper passes
try:
    import av
    _orig_av_open = av.open

    def _safe_av_open(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return _orig_av_open(*args, **kwargs)

    av.open = _safe_av_open
except Exception:
    pass

_whisper_model = None


def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
            logger.info("Loaded faster-whisper model: base (cpu/int8)")
        except ImportError:
            logger.error("faster-whisper not installed")
            raise HTTPException(500, "STT service not available")
        except Exception as e:
            logger.error("Failed to load whisper model: %s", e)
            raise HTTPException(500, f"STT model load failed: {e}")
    return _whisper_model


@router.post("/stt", response_model=TranscriptResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    user: AuthUser = Depends(get_current_user),
):
    """
    Transcribe audio. Returns transcript, detected language, quality metrics.
    Never auto-submits — the worker sees and edits first.
    """
    audio_bytes = await file.read()
    if len(audio_bytes) < 100:
        return TranscriptResponse(
            transcript="",
            detected_language="unknown",
            no_speech_prob=1.0,
            needs_review=True,
        )

    lang_clean = (language or "en").strip().lower()
    from app.services.translation import resolve_language, LANGUAGE_TABLE
    short_lang = resolve_language(lang_clean)
    sarvam_lang = LANGUAGE_TABLE[short_lang]["sarvam_code"]
    whisper_lang = "hi" if "hi" in short_lang else "en"

    if settings.stt_provider == "sarvam":
        from app.services.sarvam_client import transcribe as sarvam_transcribe

        result = await sarvam_transcribe(
            audio_bytes=audio_bytes,
            content_type=file.content_type or "audio/webm",
            language_code=sarvam_lang,
        )
        return TranscriptResponse(
            transcript=result["transcript"],
            detected_language=short_lang,
            avg_logprob=0.0,
            no_speech_prob=0.0,
            needs_review=False,
        )

    model = _get_whisper()

    # Write to temp file (faster-whisper needs file path)
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        segments, info = model.transcribe(
            tmp_path,
            language=whisper_lang if whisper_lang in ("en", "hi") else None,
            beam_size=5,
        )

        full_text = ""
        total_logprob = 0.0
        total_no_speech = 0.0
        seg_count = 0

        for seg in segments:
            full_text += seg.text
            total_logprob += seg.avg_logprob
            total_no_speech += seg.no_speech_prob
            seg_count += 1

        avg_logprob = total_logprob / max(seg_count, 1)
        avg_no_speech = total_no_speech / max(seg_count, 1)

        # Detect language
        detected = info.language or "en"
        if detected == "hi":
            lang = "hi"
        elif detected == "en":
            lang = "en"
        else:
            lang = "mixed"

        # Needs review if: low confidence, high no-speech prob, or short
        needs_review = (
            avg_logprob < -0.8
            or avg_no_speech > 0.5
            or len(full_text.strip()) < 5
        )

        return TranscriptResponse(
            transcript=full_text.strip(),
            detected_language=lang,
            avg_logprob=round(avg_logprob, 4),
            no_speech_prob=round(avg_no_speech, 4),
            needs_review=needs_review,
        )

    except Exception as e:
        logger.error("Transcription failed: %s", e)
        raise HTTPException(500, f"Transcription failed: {e}")

    finally:
        import os
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ── R6: TTS endpoint ────────────────────────────────────────────────────────

@router.post("/voice/tts")
async def text_to_speech(
    body: dict,
    user: AuthUser = Depends(get_current_user),
):
    """
    Convert text to speech audio.
    Accepts short code (en, hi, ta...), maps to Sarvam code, rejects disabled/unknown with 400.
    Truncates at sentence boundary when exceeding sarvam_tts_max_chars.
    """
    text = body.get("text", "").strip()
    language = body.get("language", "en")

    if not text:
        raise HTTPException(400, "text is required")

    from app.services.translation import is_language_enabled, resolve_language, LANGUAGE_TABLE
    short_lang = resolve_language(language)
    if not is_language_enabled(short_lang):
        raise HTTPException(400, f"Language '{language}' is not supported or not enabled")

    lang_entry = LANGUAGE_TABLE[short_lang]
    sarvam_lang = lang_entry["sarvam_code"]

    truncated = False
    max_chars = settings.sarvam_tts_max_chars or 500
    if len(text) > max_chars:
        cut_text = text[:max_chars]
        matches = list(re.finditer(r"[\.\?\!\।\n]\s*", cut_text))
        if matches:
            last_end = matches[-1].end()
            text = text[:last_end].strip()
        else:
            last_space = cut_text.rfind(" ")
            if last_space > 0:
                text = cut_text[:last_space].strip()
            else:
                text = cut_text.strip()
        truncated = True

    if settings.tts_provider == "sarvam":
        import base64
        from app.services.sarvam_client import synthesize as sarvam_synthesize

        wav_bytes = await sarvam_synthesize(text=text, language_code=sarvam_lang)
        b64_audio = base64.b64encode(wav_bytes).decode("utf-8")
        return {
            "provider": "sarvam",
            "text": text,
            "language": short_lang,
            "sarvam_language": sarvam_lang,
            "audio_url": f"data:audio/wav;base64,{b64_audio}",
            "truncated": truncated,
        }
    else:
        from app.services.tts.browser import get_audio_url
        res = get_audio_url(text, short_lang)
        if isinstance(res, dict):
            res["truncated"] = truncated
        return res


@router.get("/voice/languages")
async def list_languages():
    """Return enabled languages for voice I/O and Sarvam translation."""
    from app.services.translation import get_enabled_languages
    enabled = get_enabled_languages()
    return [
        {
            "code": lang["code"],
            "name": lang["name"],
            "sarvam_code": lang["sarvam_code"],
            "browser_code": lang["browser_code"],
            "tag": lang["browser_code"],
            "tts": True,
            "stt": True,
            "translate": True,
        }
        for lang in enabled
    ]

from pydantic import BaseModel

class TranslateRequest(BaseModel):
    text: str
    target_language: str = "hi"
    source_language: Optional[str] = "auto"

@router.post("/translate")
@router.post("/voice/translate")
async def translate_text(
    body: TranslateRequest,
    user: AuthUser = Depends(get_current_user),
):
    """
    Translate text using Sarvam AI exclusively across multiple Indian languages.
    Bhashini is strictly not used.
    """
    from app.services.sarvam_client import translate as sarvam_translate

    result = await sarvam_translate(
        text=body.text,
        target_language_code=body.target_language,
        source_language_code=body.source_language or "auto",
    )
    return result

