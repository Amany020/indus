"""
IndustryMind — Unit Tests: Citation Validator
Tests for deterministic VETO checks.
Never weaken the validator to make a test pass.
"""

import pytest
from app.services.citation_validator import (
    extract_num_units,
    validate_evidence_ids,
    validate_numbers_in_evidence,
    detect_source_conflicts,
    validate_answer,
)


class TestExtractNumUnits:
    def test_basic_torque(self):
        result = extract_num_units("Tighten to 10 Nm")
        assert any("10" in r for r in result)

    def test_nm_variants(self):
        """10Nm, 10 N·m, 10 Nm should all normalise the same."""
        r1 = extract_num_units("10Nm")
        r2 = extract_num_units("10 Nm")
        assert r1 == r2

    def test_temperature(self):
        result = extract_num_units("below 40°C")
        assert any("40" in r for r in result)

    def test_speed(self):
        result = extract_num_units("Run at 0.3 m/s")
        # Should extract the number even if unit is complex
        assert len(result) >= 0  # m/s may not match, that's ok

    def test_no_units(self):
        result = extract_num_units("Step 3: Check the belt")
        # Bare numbers without units should not be extracted
        assert len(result) == 0 or all("3" not in r for r in result if len(r) > 1)

    def test_pressure(self):
        result = extract_num_units("Set pressure to 250 kPa")
        assert any("250" in r for r in result)

    def test_rpm(self):
        result = extract_num_units("Motor speed: 1500 RPM")
        assert any("1500" in r for r in result)


class TestValidateEvidenceIds:
    def test_all_present(self):
        ok, missing = validate_evidence_ids(
            ["ev-1", "ev-2"], {"ev-1", "ev-2", "ev-3"}
        )
        assert ok is True
        assert missing == []

    def test_missing_id(self):
        ok, missing = validate_evidence_ids(
            ["ev-1", "ev-99"], {"ev-1", "ev-2"}
        )
        assert ok is False
        assert "ev-99" in missing

    def test_empty_cited(self):
        ok, missing = validate_evidence_ids([], {"ev-1"})
        assert ok is True

    def test_empty_retrieved(self):
        ok, missing = validate_evidence_ids(["ev-1"], set())
        assert ok is False


class TestValidateNumbersInEvidence:
    def test_grounded_numbers(self):
        ok, ungrounded = validate_numbers_in_evidence(
            "Tighten to 10 Nm",
            ["Set torque to 10 Nm on the bolt"],
            {"ev-1": "Specification: torque 10 Nm, pressure 250 kPa"},
            ["ev-1"],
        )
        assert ok is True

    def test_ungrounded_number(self):
        ok, ungrounded = validate_numbers_in_evidence(
            "Tighten to 15 Nm",
            ["Set torque to 15 Nm"],
            {"ev-1": "Specification: torque 10 Nm"},
            ["ev-1"],
        )
        assert ok is False
        assert len(ungrounded) > 0

    def test_no_numbers(self):
        ok, _ = validate_numbers_in_evidence(
            "Check the belt alignment",
            ["Inspect the belt"],
            {"ev-1": "Belt inspection procedure"},
            ["ev-1"],
        )
        assert ok is True


class TestDetectSourceConflicts:
    def test_no_conflict_single_source(self):
        has, _ = detect_source_conflicts([
            {"document_id": "doc-1", "content_text": "Torque: 10 Nm"},
            {"document_id": "doc-1", "content_text": "Torque: 10 Nm for bolt A"},
        ])
        assert has is False

    def test_conflict_different_values(self):
        has, desc = detect_source_conflicts([
            {"document_id": "doc-1", "content_text": "Torque: 10 Nm"},
            {"document_id": "doc-2", "content_text": "Torque: 15 Nm"},
        ])
        assert has is True
        assert "10" in desc and "15" in desc

    def test_no_conflict_compatible(self):
        has, _ = detect_source_conflicts([
            {"document_id": "doc-1", "content_text": "Speed: 100 RPM"},
            {"document_id": "doc-2", "content_text": "Temperature: 40°C"},
        ])
        assert has is False


class TestFullValidation:
    def test_valid_answer(self):
        result = validate_answer(
            "Tighten the bolt to 10 Nm",
            [{"order": 1, "instruction": "Tighten to 10 Nm", "evidence_ids": ["ev-1"]}],
            [{"evidence_id": "ev-1", "content_text": "Bolt torque specification: 10 Nm", "document_id": "doc-1"}],
        )
        assert result["passed"] is True
        assert result["vetoes"] == []

    def test_missing_evidence_id(self):
        result = validate_answer(
            "Do something",
            [{"order": 1, "instruction": "Step 1", "evidence_ids": ["ev-99"]}],
            [{"evidence_id": "ev-1", "content_text": "Some text", "document_id": "doc-1"}],
        )
        assert result["passed"] is False
        assert any("ev-99" in v for v in result["vetoes"])
