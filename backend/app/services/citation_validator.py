"""
IndustryMind — Citation & Number/Unit Validator
Deterministic VETO checks per DECISION #3:
(a) Every cited evidence_id must exist in the retrieved pack
(b) Every number+unit in the answer must appear in the cited evidence (normalised)
(c) Material source conflict forces escalation
"""

from __future__ import annotations

import re
import logging
from typing import List, Dict, Any, Tuple, Set

logger = logging.getLogger(__name__)

# ─── Number+Unit Extraction ─────────────────────────────────────────────────

# Pattern: number possibly followed by a unit
_NUM_UNIT_PATTERN = re.compile(
    r"(?<![A-Za-z]-)"           # exclude digits immediately preceded by "<letter>-"
                                  # (blocks H-450, E-204, CD-12 style identifiers)
    r"(\d+[\.,]?\d*)\s*"
    r"(mm|cm|km|in|ft|yd|"
    r"mg|kg|lb|oz|"
    r"ml|gal|"
    r"kPa|MPa|psi|atm|bar|Pa|"
    r"kN|N[\s·]?m|N|"
    r"kV|mV|mA|kW|MW|V|A|W|"
    r"°C|°F|"
    r"rpm|RPM|kHz|MHz|Hz|"
    r"ms|min|hr|"
    r"ft[\-\s]*lb|"
    r"μm|µm|"
    r"%|"
    r"g|l|m|h|s|K)"
    r"(?![A-Za-z])"              # exclude when immediately followed by another
                                  # letter (blocks "m" in "model", "a" in "access")
    , re.IGNORECASE,
)


def _normalise_num_unit(num: str, unit: str) -> str:
    """Normalise a number+unit pair for comparison."""
    # Remove commas, normalise decimal
    num = num.replace(",", "").strip()
    # Remove leading zeros but keep "0.x"
    try:
        num = str(float(num))
    except ValueError:
        pass

    # Normalise unit
    unit = unit.strip().lower()
    unit = unit.replace("·", "").replace(" ", "").replace("n m", "nm")
    # Normalise Nm variants
    if unit in ("nm", "n·m", "n m", "n.m"):
        unit = "nm"

    return f"{num}{unit}"


def extract_num_units(text: str) -> Set[str]:
    """Extract all normalised number+unit pairs from text."""
    results = set()
    for match in _NUM_UNIT_PATTERN.finditer(text):
        num = match.group(1)
        unit = match.group(2) or ""
        if unit:
            results.add(_normalise_num_unit(num, unit))
    return results


# ─── Validation Functions ───────────────────────────────────────────────────

def validate_evidence_ids(
    cited_ids: List[str],
    retrieved_ids: Set[str],
) -> Tuple[bool, List[str]]:
    """
    VETO (a): Every cited evidence_id must exist in the retrieved pack.
    Returns: (passed, list_of_missing_ids)
    """
    missing = [eid for eid in cited_ids if eid not in retrieved_ids]
    return len(missing) == 0, missing


def validate_numbers_in_evidence(
    answer_text: str,
    step_texts: List[str],
    evidence_texts: Dict[str, str],
    cited_evidence_ids: List[str],
) -> Tuple[bool, List[str]]:
    """
    VETO (b): Every number+unit in the answer/steps must appear in cited evidence.
    Returns: (passed, list_of_ungrounded_numbers)
    """
    # Collect all num+units from evidence
    evidence_nums: Set[str] = set()
    for eid in cited_evidence_ids:
        text = evidence_texts.get(eid, "")
        evidence_nums.update(extract_num_units(text))

    # Collect all num+units from answer + steps
    answer_nums: Set[str] = set()
    answer_nums.update(extract_num_units(answer_text))
    for step in step_texts:
        answer_nums.update(extract_num_units(step))

    # Find ungrounded numbers (in answer but not in evidence)
    # Only check numbers that have units (bare numbers like step numbers are ok)
    ungrounded = []
    for nu in answer_nums:
        # Skip bare numbers (no unit attached)
        if re.match(r"^\d+\.?\d*$", nu):
            continue
        if nu not in evidence_nums:
            ungrounded.append(nu)

    return len(ungrounded) == 0, ungrounded


def detect_source_conflicts(
    evidence_chunks: List[Dict[str, Any]],
) -> Tuple[bool, str]:
    """
    VETO (c): Material source conflict forces escalation.
    Checks if multiple evidence chunks from different documents
    provide contradictory information for the same topic.
    Returns: (has_conflict, description)
    """
    # Group by document
    by_doc: Dict[str, List[str]] = {}
    for chunk in evidence_chunks:
        doc_id = chunk.get("document_id", "unknown")
        text = chunk.get("content_text", "")
        by_doc.setdefault(doc_id, []).append(text)

    # If only one source, no conflict possible
    if len(by_doc) <= 1:
        return False, ""

    # Simple heuristic: check for contradictory numbers on same topic
    all_nums: Dict[str, Set[str]] = {}
    for doc_id, texts in by_doc.items():
        doc_nums: Set[str] = set()
        for t in texts:
            doc_nums.update(extract_num_units(t))
        all_nums[doc_id] = doc_nums

    # Check for same-unit different-value conflicts across docs
    doc_ids = list(all_nums.keys())
    for i in range(len(doc_ids)):
        for j in range(i + 1, len(doc_ids)):
            nums_i = all_nums[doc_ids[i]]
            nums_j = all_nums[doc_ids[j]]
            # Find pairs with same unit but different value
            for ni in nums_i:
                unit_i = re.sub(r"[\d\.]+", "", ni)
                if not unit_i:
                    continue
                for nj in nums_j:
                    unit_j = re.sub(r"[\d\.]+", "", nj)
                    if unit_i == unit_j and ni != nj:
                        return True, (
                            f"Conflicting values: {ni} (doc {doc_ids[i][:8]}...) "
                            f"vs {nj} (doc {doc_ids[j][:8]}...)"
                        )

    return False, ""


# ─── Full Validation Pipeline ───────────────────────────────────────────────

def validate_answer(
    answer_summary: str,
    steps: List[Dict[str, Any]],
    evidence_pack: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Run the full validation pipeline.
    Returns: {
        "passed": bool,
        "vetoes": [...],  # list of veto descriptions
        "should_escalate": bool,
    }
    """
    vetoes: List[str] = []

    # Build lookup sets
    retrieved_ids = {e.get("evidence_id", "") for e in evidence_pack}
    evidence_texts = {
        e.get("evidence_id", ""): e.get("content_text", "")
        for e in evidence_pack
    }

    # Collect all cited evidence IDs from steps
    all_cited: List[str] = []
    step_texts: List[str] = []
    for step in steps:
        all_cited.extend(step.get("evidence_ids", []))
        step_texts.append(step.get("instruction", ""))

    # VETO (a): evidence ID existence
    id_ok, missing = validate_evidence_ids(all_cited, retrieved_ids)
    if not id_ok:
        vetoes.append(f"Citation references non-existent evidence: {missing}")

    # VETO (b): number+unit grounding
    num_ok, ungrounded = validate_numbers_in_evidence(
        answer_summary, step_texts, evidence_texts, all_cited
    )
    if not num_ok:
        vetoes.append(f"Ungrounded numbers in answer: {ungrounded}")

    # VETO (c): source conflict
    has_conflict, conflict_desc = detect_source_conflicts(evidence_pack)
    if has_conflict:
        vetoes.append(f"Source conflict detected: {conflict_desc}")

    passed = len(vetoes) == 0
    should_escalate = has_conflict  # Conflict always forces escalation

    if not passed:
        logger.warning("Validation VETOED: %s", "; ".join(vetoes))

    return {
        "passed": passed,
        "vetoes": vetoes,
        "should_escalate": should_escalate,
    }
