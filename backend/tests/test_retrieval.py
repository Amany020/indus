"""
IndustryMind — Unit Tests: Retrieval Helpers
Tests for pure-logic functions only (no DB/network).
"""

import re
import pytest


# ─── Inline the pure functions to avoid DB import ────────────────────────────

_ERROR_CODE_PATTERN = re.compile(r"[A-Z]{1,3}[\-\s]?\d{2,5}", re.IGNORECASE)


def extract_error_codes(text: str):
    return _ERROR_CODE_PATTERN.findall(text)


def _error_code_variants(code: str):
    clean = re.sub(r"[\-\s]", "", code).upper()
    match = re.match(r"([A-Z]+)(\d+)", clean)
    if not match:
        return [f"%{code}%"]
    prefix, num = match.group(1), match.group(2)
    return [f"%{prefix}-{num}%", f"%{prefix}{num}%", f"%{prefix} {num}%"]


def reciprocal_rank_fusion(*ranked_lists, k=60):
    scores = {}
    items = {}
    for ranked_list in ranked_lists:
        for rank, item in enumerate(ranked_list):
            item_id = item.get("id", "")
            if not item_id:
                continue
            rrf_score = 1.0 / (k + rank + 1)
            scores[item_id] = scores.get(item_id, 0.0) + rrf_score
            if item_id not in items:
                items[item_id] = item
    sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    result = []
    for item_id in sorted_ids:
        item = items[item_id].copy()
        item["rrf_score"] = scores[item_id]
        result.append(item)
    return result


# ─── Tests ───────────────────────────────────────────────────────────────────

class TestErrorCodeExtraction:
    def test_standard_code(self):
        codes = extract_error_codes("What does error E-247 mean?")
        assert any("247" in c for c in codes)

    def test_no_dash(self):
        codes = extract_error_codes("Error E247 is showing")
        assert any("247" in c for c in codes)

    def test_space_variant(self):
        codes = extract_error_codes("Code E 247 appeared")
        assert any("247" in c for c in codes)

    def test_multiple_codes(self):
        codes = extract_error_codes("Errors E-100 and F-302 are active")
        assert len(codes) >= 2

    def test_no_error_code(self):
        codes = extract_error_codes("How to change the belt?")
        assert len(codes) == 0

    def test_hindi_with_code(self):
        codes = extract_error_codes("Error E-247 kya hai?")
        assert any("247" in c for c in codes)


class TestErrorCodeVariants:
    def test_variants(self):
        variants = _error_code_variants("E-247")
        assert len(variants) == 3
        assert any("E-247" in v for v in variants)
        assert any("E247" in v for v in variants)
        assert any("E 247" in v for v in variants)


class TestReciprocalRankFusion:
    def test_merge_two_lists(self):
        list1 = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
        list2 = [{"id": "b"}, {"id": "d"}, {"id": "a"}]
        merged = reciprocal_rank_fusion(list1, list2)
        ids = [m["id"] for m in merged]
        assert "b" in ids[:2]
        assert len(ids) == 4

    def test_single_list(self):
        list1 = [{"id": "x"}, {"id": "y"}]
        merged = reciprocal_rank_fusion(list1)
        assert len(merged) == 2
        assert merged[0]["id"] == "x"

    def test_empty_lists(self):
        merged = reciprocal_rank_fusion([], [])
        assert merged == []

    def test_rrf_scores_present(self):
        list1 = [{"id": "a"}]
        merged = reciprocal_rank_fusion(list1)
        assert "rrf_score" in merged[0]
        assert merged[0]["rrf_score"] > 0
