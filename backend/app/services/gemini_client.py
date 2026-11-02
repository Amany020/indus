"""
IndustryMind — Gemini Client
Single module wrapping all Gemini LLM calls.
Auto-detects Flash-class model, retry with backoff on 429.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional, Dict, Any, List

import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

from app.core.config import settings

logger = logging.getLogger(__name__)

_configured = False
_selected_model: Optional[str] = None


def _is_rate_limit(exc: BaseException) -> bool:
    """Check if exception is a rate limit error."""
    return "429" in str(exc) or "Resource has been exhausted" in str(exc)


def _ensure_configured() -> str:
    """Configure Gemini and auto-detect model if needed. Returns model name."""
    global _configured, _selected_model

    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY must be set in .env")

    if not _configured:
        genai.configure(api_key=settings.gemini_api_key)
        _configured = True

    if _selected_model:
        return _selected_model

    # Use gemini-flash-lite-latest as primary model with active quota
    if settings.gemini_model and "3.8" not in settings.gemini_model:
        _selected_model = settings.gemini_model
    else:
        _selected_model = "gemini-flash-lite-latest"
    logger.info("Using primary GEMINI_MODEL: %s", _selected_model)
    return _selected_model


    # Auto-detect: find a Flash-class model with image+JSON support
    logger.info("GEMINI_MODEL not set — auto-detecting best Flash-class model...")
    try:
        models = genai.list_models()
        candidates = []
        for m in models:
            name = m.name.replace("models/", "")
            methods = getattr(m, "supported_generation_methods", [])
            if "generateContent" not in methods:
                continue
            # Prefer flash models (fast + cheap)
            is_flash = "flash" in name.lower()
            # Check for vision/multimodal support
            has_vision = any(
                "image" in str(getattr(m, "supported_content_types", [])).lower()
                or "vision" in name.lower()
                or "multimodal" in str(getattr(m, "description", "")).lower()
                for _ in [1]
            )
            candidates.append({
                "name": name,
                "is_flash": is_flash,
                "has_vision": has_vision,
            })

        # Sort: prefer flash + vision
        candidates.sort(key=lambda c: (c["is_flash"], c["has_vision"]), reverse=True)

        if candidates:
            _selected_model = candidates[0]["name"]
            logger.info(
                "Auto-selected model: %s (flash=%s, vision=%s) from %d candidates",
                _selected_model,
                candidates[0]["is_flash"],
                candidates[0]["has_vision"],
                len(candidates),
            )
        else:
            _selected_model = "gemini-2.0-flash"
            logger.warning("No models found via API, falling back to: %s", _selected_model)

    except Exception as e:
        _selected_model = "gemini-2.0-flash"
        logger.warning("Model auto-detect failed (%s), falling back to: %s", e, _selected_model)

    return _selected_model


def get_selected_model() -> str:
    """Return the currently selected model name."""
    return _ensure_configured()


# ─── Structured JSON generation ──────────────────────────────────────────────

SYSTEM_PROMPT = """You are IndustryMind, an evidence-first industrial assistant.
You answer questions ONLY from the provided approved manual content.

RULES:
1. Every step MUST be grounded in the provided evidence chunks.
2. Every number and unit in your answer MUST appear in the cited evidence.
3. If evidence is insufficient, say so — never invent steps.
4. NEVER provide instructions to bypass, disable, or circumvent any safety device.
5. Cite evidence by evidence_id for each step.
6. Use the worker's language (Hindi/English/Hinglish) in your response.
7. Keep steps numbered, clear, and actionable.
8. If sources conflict, flag the conflict — do not pick one silently.
9. Cite ALL evidence chunks that contribute any numbers, facts, or instructions to your answer — not just the primary chunk. If you mention a number or fact in the summary or steps, the corresponding evidence_id MUST appear in that step's evidence_ids array.
10. Do NOT cite table-of-contents, index, or navigation-only pages as supporting evidence for factual claims, even if they mention the same section title — only cite pages containing the actual substantive data, specifications, or instructions being referenced. When a step cites multiple evidence_ids, list the single most directly relevant evidence_id FIRST in that step's evidence_ids array.

OUTPUT FORMAT (strict JSON):
{
  "summary": "Brief answer summary in the worker's language",
  "steps": [
    {"order": 1, "instruction": "Step text", "evidence_ids": ["eid1"]},
    ...
  ],
  "warnings": ["Any safety warnings from the evidence"],
  "status_recommendation": "supported | limited | escalate | insufficient",
  "conflict_detected": false,
  "conflict_description": null
}
"""


@retry(
    retry=retry_if_exception(_is_rate_limit),
    stop=stop_after_attempt(1),
    wait=wait_exponential(multiplier=1, min=1, max=2),
)
def generate_grounded_answer(
    query_text: str,
    evidence_chunks: List[Dict[str, Any]],
    detected_language: str = "en",
) -> Dict[str, Any]:
    """
    Generate a grounded answer from evidence chunks.
    Returns parsed JSON with steps, citations, warnings.
    """
    model_name = _ensure_configured()

    # Build evidence context
    evidence_text = ""
    for i, chunk in enumerate(evidence_chunks):
        eid = chunk.get("evidence_id", f"e{i}")
        text = chunk.get("content_text", "")
        page = chunk.get("page_number", "?")
        filename = chunk.get("filename", "document")
        risk = chunk.get("risk_level", "none")
        evidence_text += f"\n[{eid}] Source: {filename}, Page {page}, Risk: {risk}\n{text}\n"

    user_prompt = f"""Worker's question ({detected_language}): {query_text}

Available evidence from approved manuals:
{evidence_text}

Generate a grounded answer following the rules. Output ONLY valid JSON."""

    models_to_try = [model_name, "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    seen = set()
    unique_models = [m for m in models_to_try if m and not (m in seen or seen.add(m))]

    response = None
    last_err = None
    for cur_m in unique_models:
        try:
            model = genai.GenerativeModel(
                model_name=cur_m,
                system_instruction=SYSTEM_PROMPT,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                ),
            )
            response = model.generate_content(user_prompt)
            break
        except Exception as e:
            last_err = e
            logger.warning("Generation with %s failed: %s. Trying fallback model...", cur_m, e)
            continue

    if response is None:
        raise last_err or RuntimeError("All Gemini models failed")


    try:
        result = json.loads(response.text)
    except (json.JSONDecodeError, ValueError):
        # Try to extract JSON from the response
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        try:
            result = json.loads(text.strip())
        except (json.JSONDecodeError, ValueError):
            logger.error("Failed to parse Gemini response as JSON: %.200s", response.text)
            result = {
                "summary": "Unable to generate a validated answer. Please contact your supervisor.",
                "steps": [],
                "warnings": ["Answer generation failed — response was not valid JSON"],
                "status_recommendation": "escalate",
                "conflict_detected": False,
            }

    return result


@retry(
    retry=retry_if_exception(_is_rate_limit),
    stop=stop_after_attempt(1),
    wait=wait_exponential(multiplier=1, min=1, max=2),
)
def generate_grounded_answer_with_image(
    query_text: str,
    image_bytes: bytes,
    image_mime_type: str,
    evidence_chunks: List[Dict[str, Any]],
    detected_language: str = "en",
) -> Dict[str, Any]:
    """
    Generate a grounded answer from evidence chunks with supplementary image context.
    The image assists with visual grounding (identifying parts/symptoms), but all
    factual numbers and steps must originate from the evidence chunks.
    Returns parsed JSON with steps, citations, warnings.
    """
    model_name = _ensure_configured()

    # Build evidence context
    evidence_text = ""
    for i, chunk in enumerate(evidence_chunks):
        eid = chunk.get("evidence_id", f"e{i}")
        text = chunk.get("content_text", "")
        page = chunk.get("page_number", "?")
        filename = chunk.get("filename", "document")
        risk = chunk.get("risk_level", "none")
        evidence_text += f"\n[{eid}] Source: {filename}, Page {page}, Risk: {risk}\n{text}\n"

    user_prompt = f"""Worker's question ({detected_language}): {query_text}

Available evidence from approved manuals:
{evidence_text}

The worker has also attached a photo related to their question. Use the image to better understand what they are asking about (e.g. identify the part, symptom, or component shown), but your answer's facts, numbers, and instructions must still come ONLY from the evidence chunks above — the image is context, not a source of factual grounding.

Generate a grounded answer following the rules. Output ONLY valid JSON."""

    models_to_try = [model_name, "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    seen = set()
    unique_models = [m for m in models_to_try if m and not (m in seen or seen.add(m))]

    response = None
    last_err = None
    for cur_m in unique_models:
        try:
            model = genai.GenerativeModel(
                model_name=cur_m,
                system_instruction=SYSTEM_PROMPT,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                ),
            )
            image_part = {"mime_type": image_mime_type, "data": image_bytes}
            response = model.generate_content([user_prompt, image_part])
            break
        except Exception as e:
            last_err = e
            logger.warning("Generation with %s failed: %s. Trying fallback model...", cur_m, e)
            continue

    if response is None:
        raise last_err or RuntimeError("All Gemini models failed")

    try:
        result = json.loads(response.text)
    except (json.JSONDecodeError, ValueError):
        # Try to extract JSON from the response
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        try:
            result = json.loads(text.strip())
        except (json.JSONDecodeError, ValueError):
            logger.error("Failed to parse Gemini response as JSON: %.200s", response.text)
            result = {
                "summary": "Unable to generate a validated answer. Please contact your supervisor.",
                "steps": [],
                "warnings": ["Answer generation failed — response was not valid JSON"],
                "status_recommendation": "escalate",
                "conflict_detected": False,
            }

    return result


@retry(
    retry=retry_if_exception(_is_rate_limit),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=30),
)
def generate_escalation_brief(
    query_text: str,
    evidence_chunks: List[Dict[str, Any]],
    observations: Optional[List[str]] = None,
) -> str:
    """
    Generate an AI-drafted escalation brief. Labelled as DRAFT.
    """
    model_name = _ensure_configured()

    evidence_summary = ""
    for chunk in evidence_chunks[:5]:
        evidence_summary += f"- {chunk.get('filename', '?')} p.{chunk.get('page_number', '?')}: {chunk.get('content_text', '')[:200]}...\n"

    obs_text = ""
    if observations:
        obs_text = "\nWorker observations:\n" + "\n".join(f"- {o}" for o in observations)

    prompt = f"""Generate a concise escalation brief for this unresolved question.

Question: {query_text}
{obs_text}

Retrieved evidence (insufficient or conflicting):
{evidence_summary}

Format the brief as:
ESCALATION BRIEF (AI-DRAFTED — requires expert review before sending)
- Question: ...
- Documents consulted: ...
- Evidence status: ...
- Recommended next steps: ...

Keep it factual. Do NOT include confidence numbers."""

    model = genai.GenerativeModel(
        model_name=model_name,
        generation_config=genai.GenerationConfig(temperature=0.2),
    )
    response = model.generate_content(prompt)
    return response.text


@retry(
    retry=retry_if_exception(_is_rate_limit),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=30),
)
def generate_troubleshooting_step(
    symptom: str,
    previous_steps: List[Dict[str, Any]],
    evidence_chunks: List[Dict[str, Any]],
    detected_language: str = "en",
) -> Dict[str, Any]:
    """
    Generate the NEXT troubleshooting step based on evidence and previous observations.
    Returns: {"step_text": str, "ledger_category": str, "evidence_ids": [...], "should_escalate": bool}
    """
    model_name = _ensure_configured()

    prev_text = ""
    for s in previous_steps:
        status = s.get("worker_confirmation", "pending")
        prev_text += f"Step {s.get('step_order')}: {s.get('step_text')} → {status}\n"

    evidence_text = ""
    for chunk in evidence_chunks[:5]:
        eid = chunk.get("evidence_id", "?")
        evidence_text += f"[{eid}] {chunk.get('content_text', '')[:300]}\n"

    prompt = f"""You are guiding troubleshooting for: {symptom}

Previous steps and outcomes:
{prev_text if prev_text else "(none yet)"}

Available approved evidence:
{evidence_text}

Generate the NEXT single step. Output JSON:
{{
  "step_text": "The specific instruction for the worker",
  "ledger_category": "source_backed | inferred | unknown",
  "evidence_ids": ["eid1"],
  "should_escalate": false,
  "escalation_reason": null
}}

Rules:
- ONE step only
- "inferred" steps must be phrased as possibilities, not instructions
- If evidence is insufficient, set should_escalate=true
- NEVER bypass safety devices
- Use {detected_language} language"""

    model = genai.GenerativeModel(
        model_name=model_name,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )
    response = model.generate_content(prompt)

    try:
        return json.loads(response.text)
    except (json.JSONDecodeError, ValueError):
        return {
            "step_text": "Unable to determine next step. Escalating to supervisor.",
            "ledger_category": "unknown",
            "evidence_ids": [],
            "should_escalate": True,
            "escalation_reason": "Failed to generate valid troubleshooting step",
        }
