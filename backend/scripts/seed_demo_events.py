"""
IndustryMind — Seed Demo Events
Populates the DB with realistic demo data for the manager dashboard.
Run: python -m scripts.seed_demo_events
"""

from __future__ import annotations

import uuid
import random
from datetime import datetime, timedelta, timezone

# Add parent to path
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import get_db
from app.core.config import settings


def seed():
    db = get_db()
    factory_id = settings.default_factory_id
    machine_id = "c0000000-0000-0000-0000-000000000001"

    print("Seeding demo events...")

    now = datetime.now(timezone.utc)
    queries_to_insert = []

    SAMPLE_QUESTIONS = [
        ("How to change conveyor belt?", "en", "supported"),
        ("Error E-247 kya hai?", "hi", "supported"),
        ("Belt tension kitni honi chahiye?", "mixed", "supported"),
        ("What is the maintenance schedule?", "en", "supported"),
        ("Motor overheating problem", "en", "limited"),
        ("Wiring diagram dikhao", "hi", "limited"),
        ("Hydraulic pressure specification", "en", "supported"),
        ("Emergency stop reset kaise karein?", "hi", "supported"),
        ("Unknown error F-999", "en", "escalate"),
        ("Vibration analysis procedure", "en", "escalate"),
        ("How to bypass the safety interlock?", "en", "restricted"),
        ("Belt alignment check", "en", "supported"),
        ("Lubrication points kahan hain?", "hi", "supported"),
        ("Conveyor speed adjustment", "en", "supported"),
        ("Drive chain replacement steps", "en", "limited"),
    ]

    for i in range(45):
        q_text, lang, status = random.choice(SAMPLE_QUESTIONS)
        days_ago = random.randint(0, 13)
        created = now - timedelta(days=days_ago, hours=random.randint(0, 12))
        latency = random.randint(400, 2800)

        qid = str(uuid.uuid4())

        # Resolution data (only some queries)
        resolution = None
        resolved_at = None
        feedback = random.choice(["helpful", "not_helpful", "fixed", None, None])

        if status == "supported" and random.random() > 0.3:
            resolution = random.choice(["resolved", "not_resolved", "still_working"])
            if resolution == "resolved":
                resolved_at = (created + timedelta(minutes=random.randint(5, 480))).isoformat()

        queries_to_insert.append({
            "id": qid,
            "factory_id": factory_id,
            "machine_id": machine_id,
            "input_mode": random.choice(["text", "voice", "text"]),
            "query_text": q_text,
            "query_language": lang,
            "response_summary": f"Demo response for: {q_text}",
            "status": status,
            "was_escalated": status == "escalate",
            "was_refused_unsafe": status == "restricted",
            "latency_ms": latency,
            "detected_language": lang,
            "feedback": feedback,
            "resolution_status": resolution,
            "resolved_at": resolved_at,
            "created_at": created.isoformat(),
        })

    # Insert queries
    for q in queries_to_insert:
        try:
            db.table("queries").insert(q).execute()
        except Exception as e:
            print(f"  Skip query: {e}")

    # Seed some tips
    tips = [
        ("Ramesh Kumar", "When changing the belt, mark the old position with chalk first — makes alignment much faster.", "approved"),
        ("Priya Singh", "For E-247, check the ventilation duct behind the motor first — it gets clogged with dust.", "approved"),
        ("Anil Sharma", "Belt tension is easier to check with the machine warm, not cold.", "pending_review"),
        ("Deepak Verma", "Use a laser alignment tool for the pulleys — the manual method is inaccurate.", "pending_review"),
        ("Sunita Devi", "After replacing the drive chain, run it at half speed for 10 minutes before full load.", "rejected"),
    ]

    for name, text, status in tips:
        try:
            db.table("tips").insert({
                "factory_id": factory_id,
                "machine_id": machine_id,
                "submitted_by": name,
                "tip_text": text,
                "status": status,
                "reviewer": "Reviewer" if status != "pending_review" else None,
                "reviewed_at": now.isoformat() if status != "pending_review" else None,
            }).execute()
        except Exception as e:
            print(f"  Skip tip: {e}")

    # Seed safety gate events
    safety_events = [
        ("How to bypass the safety interlock?", "bypass_verb='bypass' near safety_noun='safety interlock'"),
        ("safety guard hatao", "bypass_verb='hatao' near safety_noun='safety guard'"),
        ("disable the e-stop", "bypass_verb='disable' near safety_noun='e-stop'"),
    ]

    for q_text, pattern in safety_events:
        try:
            db.table("safety_gate_events").insert({
                "factory_id": factory_id,
                "query_text": q_text,
                "matched_pattern": pattern,
                "rule_version": "1.0",
                "action_taken": "refused",
            }).execute()
        except Exception as e:
            print(f"  Skip safety event: {e}")

    print(f"Seeded: {len(queries_to_insert)} queries, {len(tips)} tips, {len(safety_events)} safety events")
    print("Done!")


if __name__ == "__main__":
    seed()
