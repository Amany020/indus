"""
IndustryMind — Demo Cache
DEMO_CACHE flag serves pre-validated answers for scripted demo questions.
Always labelled in logs and UI. Never silently used in normal mode.
"""

from __future__ import annotations

import logging
from typing import Optional, Dict, Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Pre-validated demo answers ──────────────────────────────────────────────

DEMO_CACHE: Dict[str, Dict[str, Any]] = {
    "how to change conveyor belt": {
        "summary": "To change the conveyor belt on the CDU-7500X, follow these steps from the approved maintenance manual.",
        "steps": [
            {"order": 1, "instruction": "Perform Lockout/Tagout (LOTO) on the main power disconnect (Section 3.1, p.12)", "evidence_ids": ["demo-ev-1"]},
            {"order": 2, "instruction": "Release belt tension by loosening the take-up screw (10 Nm counter-clockwise) (Section 5.2, p.28)", "evidence_ids": ["demo-ev-2"]},
            {"order": 3, "instruction": "Remove the old belt by sliding it off the drive and tail pulleys (Section 5.2, p.29)", "evidence_ids": ["demo-ev-2"]},
            {"order": 4, "instruction": "Install the new belt, ensuring the chevron pattern faces the direction of travel (Section 5.3, p.30)", "evidence_ids": ["demo-ev-3"]},
            {"order": 5, "instruction": "Re-tension to 15 Nm using a torque wrench on the take-up screw (Section 5.3, p.31)", "evidence_ids": ["demo-ev-3"]},
            {"order": 6, "instruction": "Run at low speed (0.3 m/s) for 5 minutes and check tracking alignment (Section 5.4, p.32)", "evidence_ids": ["demo-ev-4"]},
        ],
        "warnings": ["Ensure LOTO is verified before starting work — risk of entanglement"],
        "status": "supported",
    },
    "error e-247": {
        "summary": "Error E-247 indicates a drive motor overtemperature fault on the CDU-7500X.",
        "steps": [
            {"order": 1, "instruction": "Stop the conveyor immediately using the E-stop button (Section 2.1, p.8)", "evidence_ids": ["demo-ev-5"]},
            {"order": 2, "instruction": "Allow the motor to cool for at least 30 minutes (Section 7.3, p.45)", "evidence_ids": ["demo-ev-6"]},
            {"order": 3, "instruction": "Check the motor cooling fan for obstruction or damage (Section 7.3, p.46)", "evidence_ids": ["demo-ev-6"]},
            {"order": 4, "instruction": "Verify the ambient temperature is below 40°C (Section 7.1, p.42)", "evidence_ids": ["demo-ev-7"]},
            {"order": 5, "instruction": "If error recurs after cooling, contact maintenance — motor may need replacement (Section 7.5, p.50)", "evidence_ids": ["demo-ev-7"]},
        ],
        "warnings": ["Motor surface temperature may exceed 80°C — do not touch without thermal gloves"],
        "status": "supported",
    },
    "maintenance schedule": {
        "summary": "The CDU-7500X preventive maintenance schedule from the approved manual (Section 8, p.55-58).",
        "steps": [
            {"order": 1, "instruction": "Daily: Visual inspection of belt condition and alignment (Section 8.1, p.55)", "evidence_ids": ["demo-ev-8"]},
            {"order": 2, "instruction": "Weekly: Check belt tension (15 Nm ± 2 Nm) and roller bearing noise (Section 8.2, p.56)", "evidence_ids": ["demo-ev-8"]},
            {"order": 3, "instruction": "Monthly: Lubricate drive chain with ISO VG 68 oil, inspect motor brushes (Section 8.3, p.57)", "evidence_ids": ["demo-ev-9"]},
            {"order": 4, "instruction": "Quarterly: Full electrical inspection, check motor insulation resistance (≥ 1 MΩ) (Section 8.4, p.58)", "evidence_ids": ["demo-ev-9"]},
        ],
        "warnings": [],
        "status": "supported",
    },
}

# Demo evidence pack
DEMO_EVIDENCE = [
    {"evidence_id": "demo-ev-1", "chunk_id": "demo-chunk-1", "document_id": "demo-doc-1",
     "filename": "CDU-7500X-Manual.pdf", "revision": "3.2", "page_number": 12,
     "section_heading": "Lockout/Tagout Procedure", "content_type": "text",
     "content_text": "LOTO procedure for CDU-7500X: Disconnect main power, apply lockout device, verify zero energy state.",
     "risk_level": "hazardous", "similarity": 0.95},
    {"evidence_id": "demo-ev-2", "chunk_id": "demo-chunk-2", "document_id": "demo-doc-1",
     "filename": "CDU-7500X-Manual.pdf", "revision": "3.2", "page_number": 28,
     "section_heading": "Belt Removal", "content_type": "text",
     "content_text": "Release belt tension by loosening the take-up screw (10 Nm counter-clockwise). Slide belt off drive and tail pulleys.",
     "risk_level": "caution", "similarity": 0.92},
    {"evidence_id": "demo-ev-3", "chunk_id": "demo-chunk-3", "document_id": "demo-doc-1",
     "filename": "CDU-7500X-Manual.pdf", "revision": "3.2", "page_number": 30,
     "section_heading": "Belt Installation", "content_type": "text",
     "content_text": "Install new belt with chevron pattern facing direction of travel. Re-tension to 15 Nm using torque wrench.",
     "risk_level": "none", "similarity": 0.90},
    {"evidence_id": "demo-ev-4", "chunk_id": "demo-chunk-4", "document_id": "demo-doc-1",
     "filename": "CDU-7500X-Manual.pdf", "revision": "3.2", "page_number": 32,
     "section_heading": "Post-Installation Check", "content_type": "text",
     "content_text": "Run at low speed (0.3 m/s) for 5 minutes. Check tracking alignment and adjust if belt drifts more than 5 mm.",
     "risk_level": "none", "similarity": 0.88},
    {"evidence_id": "demo-ev-5", "chunk_id": "demo-chunk-5", "document_id": "demo-doc-1",
     "filename": "CDU-7500X-Manual.pdf", "revision": "3.2", "page_number": 8,
     "section_heading": "Emergency Stop", "content_type": "text",
     "content_text": "In any emergency, press the nearest E-stop button immediately. The conveyor will halt within 2 seconds.",
     "risk_level": "hazardous", "similarity": 0.93},
    {"evidence_id": "demo-ev-6", "chunk_id": "demo-chunk-6", "document_id": "demo-doc-1",
     "filename": "CDU-7500X-Manual.pdf", "revision": "3.2", "page_number": 45,
     "section_heading": "Error E-247: Motor Overtemperature", "content_type": "text",
     "content_text": "Error E-247: Drive motor overtemperature. Allow motor to cool for at least 30 minutes. Check cooling fan for obstruction.",
     "risk_level": "caution", "similarity": 0.96},
    {"evidence_id": "demo-ev-7", "chunk_id": "demo-chunk-7", "document_id": "demo-doc-1",
     "filename": "CDU-7500X-Manual.pdf", "revision": "3.2", "page_number": 42,
     "section_heading": "Operating Conditions", "content_type": "text",
     "content_text": "Operating temperature range: -10°C to 40°C. Motor surface temperature may exceed 80°C during operation.",
     "risk_level": "caution", "similarity": 0.85},
    {"evidence_id": "demo-ev-8", "chunk_id": "demo-chunk-8", "document_id": "demo-doc-1",
     "filename": "CDU-7500X-Manual.pdf", "revision": "3.2", "page_number": 55,
     "section_heading": "Preventive Maintenance Schedule", "content_type": "text",
     "content_text": "Daily: Visual inspection. Weekly: Belt tension check (15 Nm ± 2 Nm), roller bearing noise check.",
     "risk_level": "none", "similarity": 0.91},
    {"evidence_id": "demo-ev-9", "chunk_id": "demo-chunk-9", "document_id": "demo-doc-1",
     "filename": "CDU-7500X-Manual.pdf", "revision": "3.2", "page_number": 57,
     "section_heading": "Monthly/Quarterly Maintenance", "content_type": "text",
     "content_text": "Monthly: Lubricate drive chain (ISO VG 68). Quarterly: Electrical inspection, motor insulation ≥ 1 MΩ.",
     "risk_level": "none", "similarity": 0.89},
]


def check_demo_cache(query_text: str) -> Optional[Dict[str, Any]]:
    """
    Check if query matches a demo cached answer.
    Only active when DEMO_CACHE=true.
    Returns None if no match or cache disabled.
    """
    if not settings.demo_cache:
        return None

    query_lower = query_text.strip().lower()

    for key, cached in DEMO_CACHE.items():
        if key in query_lower:
            logger.info("[DEMO_CACHE] Serving cached answer for: %s", key)
            # Build full response
            relevant_eids = set()
            for step in cached["steps"]:
                relevant_eids.update(step.get("evidence_ids", []))

            evidence_pack = [
                e for e in DEMO_EVIDENCE
                if e["evidence_id"] in relevant_eids
            ]

            return {
                "summary": cached["summary"],
                "steps": cached["steps"],
                "warnings": cached["warnings"],
                "status": cached["status"],
                "evidence_pack": evidence_pack,
                "demo_cached": True,
            }

    return None
