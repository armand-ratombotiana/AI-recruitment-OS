"""Chat Assistant service — candidate-facing AI chat endpoints."""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from shared.ai.chat_assistant import CandidateChatAssistant
from shared.auth import require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.conversation import Conversation, ConversationMessage

logger = logging.getLogger("chat_assistant")

router = APIRouter()

_assistant = CandidateChatAssistant()


# ── Request / Response models ──────────────────────────────────────────────────


class ChatRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate identifier")
    message: str = Field(..., min_length=1, description="The candidate's message")
    conversation_history: list[dict[str, str]] | None = Field(
        default=None,
        description="Prior messages in [{role, content}] format",
    )
    candidate_context: dict[str, Any] | None = Field(
        default=None,
        description="Extra context: full_name, status, applied_jobs, etc.",
    )


class JobQuestionRequest(BaseModel):
    candidate_id: str
    job_id: str
    question: str = Field(..., min_length=1)
    job_context: dict[str, Any] | None = Field(default=None)


class ApplicationHelpRequest(BaseModel):
    candidate_id: str
    job_id: str
    step: str = Field(..., min_length=1, description="Application step name")
    application_context: dict[str, Any] | None = Field(default=None)


class ScheduleInterviewRequest(BaseModel):
    candidate_id: str
    interview_id: str
    interview_context: dict[str, Any] | None = Field(default=None)


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.post(
    "/candidate",
    tags=["Chat"],
    summary="Chat with AI assistant about a candidate",
)
async def chat_with_candidate(
    data: ChatRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    result = await _assistant.chat(
        candidate_id=data.candidate_id,
        message=data.message,
        conversation_history=data.conversation_history,
        tenant_id=tenant_id,
        candidate_context=data.candidate_context,
    )
    result["tenant_id"] = tenant_id
    return result


@router.post(
    "/candidate/job-questions",
    tags=["Chat"],
    summary="Answer a candidate's question about a specific job",
)
async def answer_job_question(
    data: JobQuestionRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    result = await _assistant.answer_job_question(
        candidate_id=data.candidate_id,
        job_id=data.job_id,
        question=data.question,
        tenant_id=tenant_id,
        job_context=data.job_context,
    )
    result["tenant_id"] = tenant_id
    return result


@router.post(
    "/candidate/application-help",
    tags=["Chat"],
    summary="Get guidance for an application step",
)
async def help_with_application(
    data: ApplicationHelpRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    result = await _assistant.help_with_application(
        candidate_id=data.candidate_id,
        job_id=data.job_id,
        step=data.step,
        tenant_id=tenant_id,
        application_context=data.application_context,
    )
    result["tenant_id"] = tenant_id
    return result


@router.post(
    "/candidate/schedule-interview",
    tags=["Chat"],
    summary="Confirm or reschedule an interview",
)
async def schedule_interview(
    data: ScheduleInterviewRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    result = await _assistant.schedule_interview(
        candidate_id=data.candidate_id,
        interview_id=data.interview_id,
        tenant_id=tenant_id,
        interview_context=data.interview_context,
    )
    result["tenant_id"] = tenant_id
    return result


@router.get(
    "/candidate/history",
    tags=["Chat"],
    summary="Get chat history for a candidate",
)
async def get_chat_history(
    candidate_id: str = Query(..., description="Candidate identifier"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
) -> dict[str, Any]:
    conv_title = f"candidate-chat-{candidate_id}"
    stmt = (
        select(Conversation)
        .where(
            Conversation.tenant_id == tenant_id,
            Conversation.agent_type == "candidate_chat",
            Conversation.title == conv_title,
        )
        .order_by(Conversation.updated_at.desc())
    )
    conversations = (await db.execute(stmt)).scalars().all()

    messages: list[dict[str, Any]] = []
    for conv in conversations:
        msg_stmt = (
            select(ConversationMessage)
            .where(ConversationMessage.conversation_id == conv.id)
            .order_by(ConversationMessage.created_at.asc())
        )
        conv_msgs = (await db.execute(msg_stmt)).scalars().all()
        for m in conv_msgs:
            messages.append({
                "id": m.id,
                "conversation_id": m.conversation_id,
                "role": m.role,
                "content": m.content,
                "metadata": m.meta or {},
                "created_at": m.created_at.isoformat() if m.created_at else None,
            })

    return {
        "candidate_id": candidate_id,
        "tenant_id": tenant_id,
        "messages": messages[offset: offset + limit],
        "total": len(messages),
        "limit": limit,
        "offset": offset,
    }


@router.delete(
    "/candidate/history",
    tags=["Chat"],
    summary="Clear chat history for a candidate",
)
async def clear_chat_history(
    candidate_id: str = Query(..., description="Candidate identifier"),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
) -> dict[str, Any]:
    conv_title = f"candidate-chat-{candidate_id}"
    stmt = (
        select(Conversation)
        .where(
            Conversation.tenant_id == tenant_id,
            Conversation.agent_type == "candidate_chat",
            Conversation.title == conv_title,
        )
    )
    conversations = (await db.execute(stmt)).scalars().all()

    deleted = 0
    for conv in conversations:
        msg_stmt = select(ConversationMessage).where(
            ConversationMessage.conversation_id == conv.id
        )
        msgs = (await db.execute(msg_stmt)).scalars().all()
        for m in msgs:
            await db.delete(m)
            deleted += 1
        await db.delete(conv)

    await db.commit()
    return {
        "candidate_id": candidate_id,
        "tenant_id": tenant_id,
        "deleted_messages": deleted,
        "cleared": True,
    }


__all__ = ["router"]
