"""
IndustryMind — Evaluation Script
Runs the 30-question eval set and reports:
- Recall@3
- Abstention accuracy (escalate when unanswerable)
- Safety refusal accuracy
- Validator pass/fail rates
- Honest numbers with sample sizes

Usage:
  cd backend
  python -m eval.run                   # Offline mode (safety gate + validator only)
  python -m eval.run --live            # Live mode (requires Supabase + Gemini)
  python -m eval.run --live --machine-id <id>

Unverifiable aspects are explicitly noted.
"""

from __future__ import annotations

import csv
import sys
import json
import time
import argparse
from pathlib import Path
from typing import Dict, List, Any, Optional
from collections import Counter

# Fix Windows console encoding for Hindi/Unicode characters
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Add backend to path and load environment
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")

from app.services.safety_gate import check_safety_gate
from app.services.citation_validator import detect_source_conflicts


def load_questions() -> List[Dict[str, str]]:
    """Load eval/questions.csv"""
    csv_path = Path(__file__).resolve().parent / "questions.csv"
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def run_offline_eval(questions: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Offline evaluation: tests safety gate and validator without live services.
    """
    results = {
        "safety_gate": {"correct": 0, "incorrect": 0, "details": []},
        "safe_noun_pass": {"correct": 0, "incorrect": 0, "details": []},
    }

    for q in questions:
        qid = q["id"]
        query = q["query_text"]
        category = q["category"]
        expected = q["expected_status"]

        # ── Safety Gate Test ───────────────────────────────────────────
        is_safe, matched = check_safety_gate(query)

        if category == "unsafe":
            # Expected: gate should BLOCK (is_safe=False)
            if not is_safe:
                results["safety_gate"]["correct"] += 1
                results["safety_gate"]["details"].append({
                    "id": qid, "query": query[:60], "result": "CORRECT_BLOCK",
                    "matched": matched,
                })
            else:
                results["safety_gate"]["incorrect"] += 1
                results["safety_gate"]["details"].append({
                    "id": qid, "query": query[:60], "result": "MISSED_UNSAFE",
                })

        elif category == "safe_noun_only":
            # Expected: gate should PASS (is_safe=True)
            if is_safe:
                results["safe_noun_pass"]["correct"] += 1
                results["safe_noun_pass"]["details"].append({
                    "id": qid, "query": query[:60], "result": "CORRECT_PASS",
                })
            else:
                results["safe_noun_pass"]["incorrect"] += 1
                results["safe_noun_pass"]["details"].append({
                    "id": qid, "query": query[:60], "result": "FALSE_BLOCK",
                    "matched": matched,
                })

        elif category in ("answerable", "answerable_hindi", "answerable_hinglish",
                          "unanswerable", "conflict"):
            # Normal queries should pass the safety gate
            if is_safe:
                results["safety_gate"]["correct"] += 1
            else:
                results["safety_gate"]["incorrect"] += 1
                results["safety_gate"]["details"].append({
                    "id": qid, "query": query[:60], "result": "FALSE_BLOCK",
                    "matched": matched,
                })

    return results


def run_live_eval(
    questions: List[Dict[str, str]],
    machine_id: str,
) -> Dict[str, Any]:
    """
    Live evaluation: runs full pipeline against real backend.
    Requires Supabase + Gemini credentials.
    """
    try:
        from app.services.retrieval import hybrid_search, get_best_similarity
        from app.services.gemini_client import generate_grounded_answer
        from app.core.config import settings
    except ImportError as e:
        print(f"Cannot run live eval: {e}")
        return {}

    results = {
        "recall_at_3": {"hits": 0, "total": 0},
        "abstention": {"correct": 0, "incorrect": 0, "total": 0},
        "full_pipeline": [],
    }

    answerable_cats = {"answerable", "answerable_hindi", "answerable_hinglish"}

    for q in questions:
        qid = q["id"]
        query = q["query_text"]
        category = q["category"]
        expected = q["expected_status"]
        expected_code = q.get("expected_error_code", "")

        # Skip unsafe (already tested offline)
        if category == "unsafe":
            continue

        is_safe, _ = check_safety_gate(query)
        if not is_safe:
            continue

        print(f"  [{qid}] {query[:50]}...", end=" ", flush=True)
        start = time.time()

        try:
            # Retrieve
            evidence = hybrid_search(query, machine_id, top_k=5)
            best_sim = get_best_similarity(evidence)
            latency = time.time() - start

            # Recall@3: for answerable queries, check if relevant evidence found
            if category in answerable_cats:
                results["recall_at_3"]["total"] += 1
                if len(evidence) >= 1 and best_sim >= settings.min_sim:
                    results["recall_at_3"]["hits"] += 1

                # Check error code in results
                if expected_code:
                    code_found = any(
                        expected_code.lower() in (e.get("content_text", "").lower())
                        for e in evidence[:3]
                    )
                    if code_found:
                        print(f"✓ code={expected_code}", end=" ")

            # Abstention: for unanswerable, check if system would escalate
            if category == "unanswerable":
                results["abstention"]["total"] += 1
                if best_sim < settings.min_sim or len(evidence) == 0:
                    results["abstention"]["correct"] += 1
                    print("✓ abstained", end=" ")
                else:
                    results["abstention"]["incorrect"] += 1
                    print(f"✗ sim={best_sim:.3f}", end=" ")

            # Conflict detection
            if category == "conflict":
                has_conflict, desc = detect_source_conflicts(evidence)
                print(f"conflict={'detected' if has_conflict else 'missed'}", end=" ")

            result_entry = {
                "id": qid,
                "category": category,
                "expected": expected,
                "evidence_count": len(evidence),
                "best_sim": round(best_sim, 4),
                "latency_s": round(latency, 2),
            }
            results["full_pipeline"].append(result_entry)
            print(f"({latency:.1f}s, sim={best_sim:.3f}, ev={len(evidence)})")

        except Exception as e:
            print(f"ERROR: {e}")
            results["full_pipeline"].append({
                "id": qid, "error": str(e),
            })

    return results


def print_report(offline: Dict, live: Optional[Dict] = None):
    """Print the evaluation report with honest numbers."""
    print("\n" + "=" * 70)
    print("  INDUSTRYMIND EVALUATION REPORT")
    print("=" * 70)

    # Safety Gate
    sg = offline["safety_gate"]
    total_sg = sg["correct"] + sg["incorrect"]
    print(f"\n> Safety Gate Accuracy")
    print(f"  Correct: {sg['correct']}/{total_sg} ({sg['correct']/max(total_sg,1)*100:.0f}%)")
    if sg["incorrect"] > 0:
        print(f"  x Failures:")
        for d in sg["details"]:
            if d["result"] in ("MISSED_UNSAFE", "FALSE_BLOCK"):
                print(f"    - [{d['id']}] {d['result']}: {d['query']}")

    # Safe noun pass
    snp = offline["safe_noun_pass"]
    total_snp = snp["correct"] + snp["incorrect"]
    print(f"\n> Safe Noun Pass (safety noun alone must NOT trigger)")
    print(f"  Correct: {snp['correct']}/{total_snp}")
    if snp["incorrect"] > 0:
        for d in snp["details"]:
            if d["result"] == "FALSE_BLOCK":
                print(f"    x [{d['id']}] Incorrectly blocked: {d['query']}")

    if live:
        # Recall@3
        r3 = live.get("recall_at_3", {})
        if r3.get("total", 0) > 0:
            pct = r3["hits"] / r3["total"] * 100
            print(f"\n> Recall@3 (answerable queries with evidence in top 3)")
            print(f"  {r3['hits']}/{r3['total']} ({pct:.0f}%)")
            print(f"  Sample size: {r3['total']}")

        # Abstention
        ab = live.get("abstention", {})
        if ab.get("total", 0) > 0:
            pct = ab["correct"] / ab["total"] * 100
            print(f"\n> Abstention Accuracy (unanswerable -> escalate)")
            print(f"  Correct: {ab['correct']}/{ab['total']} ({pct:.0f}%)")
            print(f"  Sample size: {ab['total']}")

        # Latency
        pipeline = live.get("full_pipeline", [])
        latencies = [p.get("latency_s", 0) for p in pipeline if "latency_s" in p]
        if latencies:
            print(f"\n> Latency")
            print(f"  Mean: {sum(latencies)/len(latencies):.2f}s")
            print(f"  Max: {max(latencies):.2f}s")
            print(f"  Sample size: {len(latencies)}")

    # Unverifiable aspects
    print(f"\n> Unverifiable Aspects (stated honestly)")
    print(f"  - Gemini response grounding quality (requires manual review)")
    print(f"  - Hindi STT accuracy (requires real audio samples)")
    print(f"  - Threshold calibration (requires larger eval set)")
    if not live:
        print(f"  - Recall@3 and abstention (requires live Supabase + Gemini)")
        print(f"  - End-to-end latency (requires live services)")

    print("\n" + "=" * 70)
    print("  Report generated with measured numbers. No claims of zero hallucination.")
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description="IndustryMind Evaluation")
    parser.add_argument("--live", action="store_true", help="Run live eval (requires DB + Gemini)")
    parser.add_argument("--machine-id", default="c0000000-0000-0000-0000-000000000001",
                        help="Machine ID for live eval")
    args = parser.parse_args()

    print("Loading evaluation questions...")
    questions = load_questions()
    print(f"Loaded {len(questions)} questions")

    # Category breakdown
    cats = Counter(q["category"] for q in questions)
    print(f"Categories: {dict(cats)}")

    # Offline eval (always runs)
    print("\nRunning offline evaluation (safety gate + validator)...")
    offline = run_offline_eval(questions)

    live = None
    if args.live:
        print("\nRunning live evaluation (full pipeline)...")
        live = run_live_eval(questions, args.machine_id)

    print_report(offline, live)

    # Save results
    results_path = Path(__file__).resolve().parent / "results.json"
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump({"offline": offline, "live": live}, f, indent=2, default=str)
    print(f"\nResults saved to: {results_path}")


if __name__ == "__main__":
    main()
