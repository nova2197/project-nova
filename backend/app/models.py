from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .database import Base

class Session(Base):
    __tablename__ = "sessions"
    id           = Column(Integer, primary_key=True, index=True)
    player_name  = Column(String, default="Commander")
    subject      = Column(String)          # emath | physics | amath
    difficulty   = Column(String)          # G1 | G2 | G3
    chapter      = Column(Integer, default=6)
    xp_earned    = Column(Integer, default=0)
    started_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
    answers      = relationship("Answer", back_populates="session")

class Answer(Base):
    __tablename__ = "answers"
    id             = Column(Integer, primary_key=True, index=True)
    session_id     = Column(Integer, ForeignKey("sessions.id"))
    question_id    = Column(String)        # q1 | q2 | q3 | q4 | q5
    syllabus_topic = Column(String)
    student_answer = Column(Float, nullable=True)
    correct        = Column(Boolean)
    attempts       = Column(Integer, default=1)
    hint_used      = Column(Boolean, default=False)
    xp_awarded     = Column(Integer, default=0)
    answered_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    session        = relationship("Session", back_populates="answers")
