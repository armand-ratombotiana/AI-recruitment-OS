"""Event handler registry for AI-ROS."""
from __future__ import annotations
from typing import Any, Callable
from shared.events.schemas import EventEnvelope
from shared.events.dispatcher import dispatcher

async def handle_candidate_created(event: EventEnvelope):
    print(f"Candidate created: {event.payload}")

async def handle_resume_parsed(event: EventEnvelope):
    print(f"Resume parsed: {event.payload}")

async def handle_interview_completed(event: EventEnvelope):
    print(f"Interview completed: {event.payload}")

# Register handlers
dispatcher.register("candidate.created", handle_candidate_created)
dispatcher.register("resume.parsed", handle_resume_parsed)
dispatcher.register("interview.completed", handle_interview_completed)
