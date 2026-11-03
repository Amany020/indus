"""
IndustryMind — Translation Service
Pure translation orchestration for vernacular industrial workflows.
Uses Gemini through existing gemini_client configuration for translation.
Maintains safety gates, citations, and numbers verbatim.
"""

from __future__ import annotations

import re
import asyncio
import logging
from typing import Dict, List, Tuple, Optional

import warnings

with warnings.catch_warnings():
    warnings.simplefilter("ignore", category=FutureWarning)
    import google.generativeai as genai

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Language Table ──────────────────────────────────────────────────────────

LANGUAGE_TABLE: Dict[str, Dict[str, str]] = {
    "en": {
        "code": "en",
        "name": "English",
        "sarvam_code": "en-IN",
        "browser_code": "en-IN",
    },
    "hi": {
        "code": "hi",
        "name": "Hindi (हिन्दी)",
        "sarvam_code": "hi-IN",
        "browser_code": "hi-IN",
    },
    "bn": {
        "code": "bn",
        "name": "Bengali (বাংলা)",
        "sarvam_code": "bn-IN",
        "browser_code": "bn-IN",
    },
    "ta": {
        "code": "ta",
        "name": "Tamil (தமிழ்)",
        "sarvam_code": "ta-IN",
        "browser_code": "ta-IN",
    },
    "te": {
        "code": "te",
        "name": "Telugu (తెలుగు)",
        "sarvam_code": "te-IN",
        "browser_code": "te-IN",
    },
    "mr": {
        "code": "mr",
        "name": "Marathi (मराठी)",
        "sarvam_code": "mr-IN",
        "browser_code": "mr-IN",
    },
    "gu": {
        "code": "gu",
        "name": "Gujarati (ગુજરાતી)",
        "sarvam_code": "gu-IN",
        "browser_code": "gu-IN",
    },
    "kn": {
        "code": "kn",
        "name": "Kannada (ಕನ್ನಡ)",
        "sarvam_code": "kn-IN",
        "browser_code": "kn-IN",
    },
    "ml": {
        "code": "ml",
        "name": "Malayalam (മലയാളം)",
        "sarvam_code": "ml-IN",
        "browser_code": "ml-IN",
    },
    "pa": {
        "code": "pa",
        "name": "Punjabi (ਪੰਜਾਬੀ)",
        "sarvam_code": "pa-IN",
        "browser_code": "pa-IN",
    },
    "od": {
        "code": "od",
        "name": "Odia (ଓଡ଼ିଆ)",
        "sarvam_code": "od-IN",
        "browser_code": "or-IN",
    },
}


def get_supported_codes() -> List[str]:
    """Return configured enabled language codes."""
    raw = settings.supported_languages or "en,hi"
    codes = [c.strip().lower() for c in raw.split(",") if c.strip()]
    if "en" not in codes:
        codes.insert(0, "en")
    return codes


def is_language_enabled(lang_code: str) -> bool:
    """Check if given short language code is enabled."""
    code = (lang_code or "en").strip().lower()
    if code in LANGUAGE_TABLE:
        return code in get_supported_codes()
    # Check if Sarvam code like hi-IN passed
    short = code[:2]
    if short in LANGUAGE_TABLE:
        return short in get_supported_codes()
    return False


def resolve_language(lang_code: str) -> str:
    """Resolve normalized short code; falls back to 'en' if not enabled."""
    if not lang_code:
        return "en"
    clean = lang_code.strip().lower()
    short = clean[:2] if len(clean) >= 2 else clean
    if short in LANGUAGE_TABLE and is_language_enabled(short):
        return short
    if clean in LANGUAGE_TABLE and is_language_enabled(clean):
        return clean
    return "en"


def get_enabled_languages() -> List[Dict[str, str]]:
    """Return table metadata for all enabled languages."""
    enabled_codes = set(get_supported_codes())
    return [
        info for code, info in LANGUAGE_TABLE.items()
        if code in enabled_codes
    ]


# ─── Language Detection & Translation Condition ──────────────────────────────

def needs_translation_in(text: str, lang: str) -> bool:
    """
    True if lang != 'en' or text has a significant share of non-Latin characters.
    Typed English with Hindi selected still passes through translator unchanged.
    """
    if not text or not text.strip():
        return False
    clean_lang = (lang or "en").strip().lower()
    if clean_lang != "en":
        return True
    # Calculate non-Latin character share
    non_latin = len(re.findall(r"[^\x00-\x7F\s]", text))
    stripped_len = len(text.strip())
    if stripped_len > 0 and (non_latin / stripped_len) > 0.15:
        return True
    return False


# ─── Number Guard ─────────────────────────────────────────────────────────────

def check_number_guard(english_text: str, translated_text: str) -> bool:
    """
    Ensure every sequence of digits present in the English source text
    appears verbatim in the translated output text.
    """
    if not english_text:
        return True
    if not translated_text:
        return False
    numbers = re.findall(r"\d+", english_text)
    for num in numbers:
        if num not in translated_text:
            return False
    return True


# ─── Fixed Localized Messages ────────────────────────────────────────────────

FIXED_MESSAGES: Dict[str, Dict[str, str]] = {
    "en": {
        "refusal": (
            "This request involves bypassing or disabling a safety mechanism. "
            "IndustryMind cannot provide instructions to bypass, disable, or circumvent "
            "any safety device, interlock, guard, or emergency stop system. "
            "These protections exist to prevent injury and equipment damage. "
            "If you believe a safety device is malfunctioning, please contact your "
            "supervisor or the maintenance team immediately. "
            "Note: This safety gate is tested against a red-team set but is not "
            "claimed to be unbeatable."
        ),
        "insufficient_evidence": (
            "I could not find sufficient evidence in the approved manuals for this machine "
            "to provide a reliable answer. This question has been flagged for escalation to a supervisor."
        ),
        "insufficient_evidence_warning": "Evidence insufficient for a reliable answer",
        "safety_baseline_header": "General safety baseline (not from this machine's manual):",
        "generation_failed": "Unable to generate a validated answer. Please contact your supervisor.",
        "generation_failed_warning": "Answer generation failed after retries",
        "manual_missing_info": "Manual does not contain this information",
    },
    "hi": {
        "refusal": (
            "इस अनुरोध में सुरक्षा तंत्र को बायपास या अक्षम करने का प्रयास शामिल है। "
            "IndustryMind किसी भी सुरक्षा उपकरण, इंटरलॉक, गार्ड या आपातकालीन स्टॉप सिस्टम को बायपास या अक्षम करने के निर्देश नहीं दे सकता। "
            "ये सुरक्षा उपाय दुर्घटना और उपकरण क्षति को रोकने के लिए हैं। "
            "यदि आपको लगता है कि कोई सुरक्षा उपकरण खराब है, तो तुरंत अपने सुपरवाइजर या मेंटेनेंस टीम से संपर्क करें।"
        ),
        "insufficient_evidence": (
            "विश्वसनीय उत्तर प्रदान करने के लिए इस मशीन के स्वीकृत मैनुअल में पर्याप्त प्रमाण नहीं मिले। "
            "यह प्रश्न सुपरवाइजर को अग्रेषित (एस्केलेट) करने के लिए चिह्नित किया गया है।"
        ),
        "insufficient_evidence_warning": "विश्वसनीय उत्तर के लिए पर्याप्त प्रमाण उपलब्ध नहीं है",
        "safety_baseline_header": "सामान्य सुरक्षा दिशानिर्देश (इस मशीन के मैनुअल से नहीं):",
        "generation_failed": "सत्यापित उत्तर उत्पन्न करने में असमर्थ। कृपया अपने सुपरवाइजर से संपर्क करें।",
        "generation_failed_warning": "प्रयासों के बाद भी उत्तर निर्माण विफल रहा",
        "manual_missing_info": "मैनुअल में यह जानकारी उपलब्ध नहीं है",
    },
}


def get_fixed_message(key: str, lang: str = "en") -> str:
    """Return localized fixed message; falls back to English if missing."""
    clean_lang = (lang or "en").strip().lower()
    lang_dict = FIXED_MESSAGES.get(clean_lang) or FIXED_MESSAGES["en"]
    return lang_dict.get(key) or FIXED_MESSAGES["en"].get(key, "")


# ─── Gemini Translation Callers ──────────────────────────────────────────────

def _get_translation_model() -> str:
    """Return model configured for translation."""
    if settings.translation_model:
        return settings.translation_model
    from app.services.gemini_client import get_selected_model
    return get_selected_model()


async def translate_to_english(text: str, source_lang: str = "hi") -> Tuple[str, bool]:
    """
    Translate worker question to English using Gemini.
    Returns: (english_text, ok)
    Never raises to caller.
    """
    if not text or not text.strip():
        return text, True

    clean_source = resolve_language(source_lang)
    if clean_source == "en" and not needs_translation_in(text, "en"):
        return text, True

    prompt = (
        "Translate the following worker question to English.\n"
        "Instructions:\n"
        "- Output ONLY the translation, with no explanation or extra text.\n"
        "- Preserve numbers, units, part numbers, error codes, and tag names exactly.\n"
        "- Do not add, remove, or soften anything.\n"
        "- If the text is already English, return it unchanged.\n"
        "- Treat romanized Hindi (Hinglish) as Hindi and translate to standard English.\n\n"
        f"Input text:\n{text}"
    )

    try:
        from app.services.gemini_client import _ensure_configured
        _ensure_configured()
        model_name = _get_translation_model()
        model = genai.GenerativeModel(model_name=model_name)

        loop = asyncio.get_running_loop()
        timeout = settings.translation_timeout_seconds or 12
        response = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: model.generate_content(prompt)),
            timeout=timeout,
        )

        translated = (response.text or "").strip()
        if not translated:
            logger.warning(
                "translate_to_english empty result (source_lang=%s, len=%d)",
                clean_source,
                len(text),
            )
            return text, False

        logger.info(
            "translate_to_english ok (source_lang=%s, in_len=%d, out_len=%d)",
            clean_source,
            len(text),
            len(translated),
        )
        return translated, True
    except asyncio.TimeoutError:
        logger.warning(
            "translate_to_english timeout (source_lang=%s, len=%d, timeout=%ds)",
            clean_source,
            len(text),
            settings.translation_timeout_seconds,
        )
        return text, False
    except Exception as exc:
        logger.warning(
            "translate_to_english exception (%s, source_lang=%s, len=%d)",
            type(exc).__name__,
            clean_source,
            len(text),
        )
        return text, False


async def translate_from_english(text: str, target_lang: str) -> Tuple[str, bool]:
    """
    Translate English grounded answer text into target vernacular language using Gemini.
    Enforces number guard and preserves citations.
    Returns: (translated_text, ok)
    Never raises to caller.
    """
    if not text or not text.strip():
        return text, True

    clean_target = resolve_language(target_lang)
    if clean_target == "en":
        return text, True

    target_info = LANGUAGE_TABLE.get(clean_target) or LANGUAGE_TABLE.get("hi")
    target_name = target_info["name"]

    prompt = (
        f"Translate the following industrial technical text from English into {target_name}.\n"
        "Instructions:\n"
        "- Output ONLY the translation, with no explanation, conversational intro, or markdown preamble.\n"
        "- Preserve numbers, units, part numbers, error codes, and tag names exactly.\n"
        "- Do not add, remove, or soften anything.\n"
        "- Keep digits as Latin digits (0–9), never replace them with words or non-Latin numerals.\n"
        "- Keep citation markers like [1], [e0], [e1] unchanged.\n"
        "- Keep WARNING, DANGER, and CAUTION meaning at full strength.\n"
        "- Do not add advice or extra procedural steps.\n\n"
        f"English text:\n{text}"
    )

    try:
        from app.services.gemini_client import _ensure_configured
        _ensure_configured()
        model_name = _get_translation_model()
        model = genai.GenerativeModel(model_name=model_name)

        loop = asyncio.get_running_loop()
        timeout = settings.translation_timeout_seconds or 12
        response = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: model.generate_content(prompt)),
            timeout=timeout,
        )

        translated = (response.text or "").strip()
        if not translated:
            logger.warning(
                "translate_from_english empty result (target_lang=%s, len=%d)",
                clean_target,
                len(text),
            )
            return text, False

        # Enforce number guard
        if not check_number_guard(text, translated):
            logger.warning(
                "translate_from_english number guard violation (target_lang=%s, in_len=%d)",
                clean_target,
                len(text),
            )
            return text, False

        logger.info(
            "translate_from_english ok (target_lang=%s, in_len=%d, out_len=%d)",
            clean_target,
            len(text),
            len(translated),
        )
        return translated, True
    except asyncio.TimeoutError:
        logger.warning(
            "translate_from_english timeout (target_lang=%s, len=%d, timeout=%ds)",
            clean_target,
            len(text),
            settings.translation_timeout_seconds,
        )
        return text, False
    except Exception as exc:
        logger.warning(
            "translate_from_english exception (%s, target_lang=%s, len=%d)",
            type(exc).__name__,
            clean_target,
            len(text),
        )
        return text, False
