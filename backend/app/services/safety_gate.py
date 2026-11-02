"""
IndustryMind — Deterministic Safety Gate
Runs BEFORE retrieval and generation. No LLM calls.

Rules: bypass-style VERB near a safety NOUN → block.
A safety noun ALONE ("what is the lockout procedure") → PASS.
Supports English, Hindi (Devanagari), and Hinglish.

Never claim this is unbeatable. It is tested against a red-team set.
"""

from __future__ import annotations

import re
import logging
from typing import Optional, Tuple

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Pattern Lists ───────────────────────────────────────────────────────────

# Bypass-intent verbs (English)
BYPASS_VERBS_EN = [
    r"bypass", r"disable", r"override", r"skip", r"turn\s*off",
    r"deactivate", r"remove", r"disconnect", r"circumvent",
    r"defeat", r"ignore", r"shut\s*off", r"switch\s*off",
    r"get\s*around", r"work\s*around", r"avoid", r"trick",
    r"fool", r"cheat", r"hack", r"break", r"force\s*open",
    r"force\s*start", r"jump", r"jumper", r"short\s*circuit",
    r"hot\s*wire", r"hotwire",
]

# Bypass-intent verbs (Hindi / Hinglish)
BYPASS_VERBS_HI = [
    r"band\s*karo", r"band\s*kar\s*do", r"hatao", r"hata\s*do",
    r"निकालो", r"बंद\s*करो", r"बंद\s*कर\s*दो", r"हटाओ", r"हटा\s*दो",
    r"छोड़\s*दो", r"तोड़\s*दो", r"bypass\s*करो", r"bypass\s*कर\s*दो",
    r"disable\s*करो", r"disable\s*कर\s*दो", r"override\s*करो",
    r"skip\s*करो", r"skip\s*कर\s*दो",
    r"बायपास", r"डिसेबल", r"ओवरराइड",
]

# Safety nouns (English)
SAFETY_NOUNS_EN = [
    r"safety", r"interlock", r"guard", r"lockout", r"tagout",
    r"loto", r"e[\-\s]?stop", r"emergency\s*stop",
    r"light\s*curtain", r"safety\s*sensor", r"safety\s*switch",
    r"safety\s*relay", r"safety\s*valve", r"pressure\s*relief",
    r"safety\s*lock", r"safety\s*door", r"safety\s*gate",
    r"protective\s*cover", r"shield", r"barrier",
    r"ground\s*fault", r"gfci", r"rcd",
    r"fire\s*suppression", r"alarm",
]

# Safety nouns (Hindi / Hinglish)
SAFETY_NOUNS_HI = [
    r"सेफ्टी", r"इंटरलॉक", r"गार्ड", r"लॉकआउट", r"टैगआउट",
    r"इमरजेंसी\s*स्टॉप", r"सेफ्टी\s*सेंसर", r"सेफ्टी\s*स्विच",
    r"safety\s*sensor", r"safety\s*switch", r"safety\s*guard",
    r"safety\s*interlock", r"safety\s*lock",
    r"suraksha", r"सुरक्षा",
]

# ─── Compile Patterns ────────────────────────────────────────────────────────

_ALL_BYPASS = BYPASS_VERBS_EN + BYPASS_VERBS_HI
_ALL_SAFETY = SAFETY_NOUNS_EN + SAFETY_NOUNS_HI

_BYPASS_PATTERN = re.compile(
    r"(?:" + "|".join(_ALL_BYPASS) + r")",
    re.IGNORECASE | re.UNICODE,
)

_SAFETY_PATTERN = re.compile(
    r"(?:" + "|".join(_ALL_SAFETY) + r")",
    re.IGNORECASE | re.UNICODE,
)

# ─── Fixed refusal message ──────────────────────────────────────────────────

SAFETY_REFUSAL_MESSAGE = (
    "This request involves bypassing or disabling a safety mechanism. "
    "IndustryMind cannot provide instructions to bypass, disable, or circumvent "
    "any safety device, interlock, guard, or emergency stop system. "
    "These protections exist to prevent injury and equipment damage. "
    "If you believe a safety device is malfunctioning, please contact your "
    "supervisor or the maintenance team immediately. "
    "Note: This safety gate is tested against a red-team set but is not "
    "claimed to be unbeatable."
)


# ─── Public API ──────────────────────────────────────────────────────────────

def check_safety_gate(query_text: str) -> Tuple[bool, Optional[str]]:
    """
    Check if query contains a bypass-intent verb NEAR a safety noun.

    Returns:
        (is_safe, matched_pattern)
        - is_safe=True  → query may proceed
        - is_safe=False → query is blocked; matched_pattern describes why
    """
    if not query_text or not query_text.strip():
        return True, None

    text = query_text.strip()

    # Find all bypass verbs and safety nouns
    bypass_matches = list(_BYPASS_PATTERN.finditer(text))
    safety_matches = list(_SAFETY_PATTERN.finditer(text))

    # Rule: bypass verb NEAR safety noun → BLOCK
    # "near" = within 80 characters of each other
    PROXIMITY = 80

    for bm in bypass_matches:
        for sm in safety_matches:
            b_start, b_end = bm.start(), bm.end()
            s_start, s_end = sm.start(), sm.end()

            # Distance between the two matches
            if b_end <= s_start:
                distance = s_start - b_end
            elif s_end <= b_start:
                distance = b_start - s_end
            else:
                distance = 0  # overlapping

            if distance <= PROXIMITY:
                matched = f"bypass_verb='{bm.group()}' near safety_noun='{sm.group()}'"
                logger.warning(
                    "Safety gate BLOCKED: %s | query: %.100s...",
                    matched,
                    text,
                )
                return False, matched

    # Safety noun alone ("what is the lockout procedure") → PASS
    # Bypass verb alone without safety noun → PASS (could be general question)
    return True, None


def get_refusal_message() -> str:
    """Return the fixed, reviewed refusal message."""
    return SAFETY_REFUSAL_MESSAGE


def get_rule_version() -> str:
    """Return the current safety rule version."""
    return settings.safety_rule_version
