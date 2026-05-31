from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional

from .database import engine, get_db, Base
from . import models

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic schemas ──────────────────────────────────────────────────

class SessionCreate(BaseModel):
    player_name: str = "Commander"
    subject: str     # emath | physics | amath
    difficulty: str  # G1 | G2 | G3

class AnswerSubmit(BaseModel):
    question_id: str
    syllabus_topic: str
    student_answer: Optional[float] = None
    correct: bool
    attempts: int
    hint_used: bool
    xp_awarded: int

class SessionComplete(BaseModel):
    xp_earned: int

# ── Endpoints ─────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "online", "game": "Project NOVA"}

@app.post("/session/start")
def start_session(body: SessionCreate, db: DBSession = Depends(get_db)):
    session = models.Session(
        player_name=body.player_name,
        subject=body.subject,
        difficulty=body.difficulty,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"session_id": session.id}

@app.post("/session/{session_id}/answer")
def log_answer(session_id: int, body: AnswerSubmit, db: DBSession = Depends(get_db)):
    session = db.get(models.Session, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    answer = models.Answer(
        session_id=session_id,
        question_id=body.question_id,
        syllabus_topic=body.syllabus_topic,
        student_answer=body.student_answer,
        correct=body.correct,
        attempts=body.attempts,
        hint_used=body.hint_used,
        xp_awarded=body.xp_awarded,
    )
    db.add(answer)
    db.commit()
    return {"logged": True}

@app.post("/session/{session_id}/complete")
def complete_session(session_id: int, body: SessionComplete, db: DBSession = Depends(get_db)):
    session = db.get(models.Session, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.xp_earned = body.xp_earned
    session.completed_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "complete", "xp_earned": body.xp_earned}

@app.get("/session/{session_id}/progress")
def get_progress(session_id: int, db: DBSession = Depends(get_db)):
    session = db.get(models.Session, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session.id,
        "subject": session.subject,
        "difficulty": session.difficulty,
        "xp_earned": session.xp_earned,
        "answers": [
            {
                "question_id": a.question_id,
                "syllabus_topic": a.syllabus_topic,
                "correct": a.correct,
                "attempts": a.attempts,
                "hint_used": a.hint_used,
                "xp_awarded": a.xp_awarded,
            }
            for a in session.answers
        ]
    }

@app.get("/analytics/weak-topics")
def weak_topics(db: DBSession = Depends(get_db)):
    """Aggregate wrong answers by syllabus topic across all sessions."""
    from sqlalchemy import func
    rows = (
        db.query(models.Answer.syllabus_topic, func.count().label("total"),
                 func.sum(models.Answer.correct.cast(models.Answer.correct.type)).label("correct_count"))
        .group_by(models.Answer.syllabus_topic)
        .all()
    )
    return [
        {
            "topic": r.syllabus_topic,
            "total_attempts": r.total,
            "correct": int(r.correct_count or 0),
            "error_rate": round(1 - (r.correct_count or 0) / r.total, 2),
        }
        for r in rows
    ]
