"""Candidate AI Chat Assistant — context-aware conversational helper.

Provides a high-level :class:`CandidateChatAssistant` that knows about
candidate profiles, applied jobs, application status, and interview
scheduling.  All LLM calls go through :class:`shared.ai.llm_router.LLMRouter`
with a deterministic fallback so the system works without API keys.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from shared.ai.llm_router import LLMRouter, get_llm_router

logger = logging.getLogger("ai.chat_assistant")


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Fallback knowledge base ────────────────────────────────────────────────────

_COMMON_ANSWERS: dict[str, str] = {
    "salary": "Compensation details are typically discussed during the interview process. You can ask the recruiter about the salary range for the role.",
    "location": "The job location is listed in the job description. Many roles also offer remote or hybrid work options — check the posting for details.",
    "remote": "Many positions offer remote or hybrid arrangements. Please refer to the specific job posting for the work policy.",
    "benefits": "Benefits typically include health insurance, retirement plans, PTO, and professional development. Specifics vary by role and location.",
    "process": "Our hiring process typically includes: application review, phone screen, technical interview, team interview, and offer. Timelines vary by role.",
    "timeline": "Hiring timelines vary by role, but most processes take 2-4 weeks from application to offer. You'll receive updates at each stage.",
    "status": "You can check your application status in your candidate dashboard. If you have questions, feel free to reach out.",
    "resume": "Make sure your resume highlights relevant experience, quantifiable achievements, and skills matching the job requirements.",
    "interview": "Prepare by researching the company, reviewing the job description, and preparing examples of your past work. Technical roles may include a coding exercise.",
    "feedback": "We strive to provide feedback to all candidates. You can request feedback from your recruiter or check your candidate portal.",
}


def _match_fallback(message: str) -> str | None:
    lower = message.lower()
    for key, answer in _COMMON_ANSWERS.items():
        if key in lower:
            return answer
    return None


# ── System prompt ──────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are an AI recruitment assistant for AI-ROS, a hiring platform. "
    "You help candidates with questions about jobs, applications, interviews, "
    "and the hiring process. Be professional, helpful, and concise. "
    "Never share internal company information or other candidates' data. "
    "If you don't know something, suggest the candidate contact their recruiter."
)


# ── CandidateChatAssistant ─────────────────────────────────────────────────────


class CandidateChatAssistant:
    """Context-aware chat assistant for candidates.

    Parameters
    ----------
    router
        An :class:`LLMRouter` instance.  When *None* the module-level
        singleton is used (lazy-initialised).
    """

    def __init__(self, router: LLMRouter | None = None) -> None:
        self._router = router

    @property
    def router(self) -> LLMRouter:
        if self._router is None:
            self._router = get_llm_router()
        return self._router

    # ── Public API ────────────────────────────────────────────────────────

    async def chat(
        self,
        candidate_id: str,
        message: str,
        conversation_history: list[dict[str, str]] | None = None,
        *,
        tenant_id: str = "default",
        candidate_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """General chat with a candidate, enriched with context.

        Returns a dict with ``response``, ``candidate_id``, ``model``,
        ``fallback``, ``timestamp``, and ``metadata``.
        """
        ctx = self._build_candidate_context(candidate_id, candidate_context)
        messages = self._build_messages(
            message=message,
            conversation_history=conversation_history,
            context=ctx,
        )

        fallback = _match_fallback(message)
        if fallback:
            return self._wrap(
                content=fallback,
                candidate_id=candidate_id,
                model="fallback",
                fallback=True,
                context_used=ctx,
            )

        try:
            llm_resp = await self.router.complete(
                messages,
                model="gpt-4o-mini",
                temperature=0.7,
                max_tokens=1024,
                tenant_id=tenant_id,
            )
            content = llm_resp.content
            model = llm_resp.model
            is_fallback = llm_resp.provider == "mock"
        except Exception as exc:
            logger.warning("chat.llm_failed candidate=%s err=%s", candidate_id, exc)
            content = fallback or self._generic_reply(message)
            model = "fallback"
            is_fallback = True

        return self._wrap(
            content=content,
            candidate_id=candidate_id,
            model=model,
            fallback=is_fallback,
            context_used=ctx,
        )

    async def answer_job_question(
        self,
        candidate_id: str,
        job_id: str,
        question: str,
        *,
        tenant_id: str = "default",
        job_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Answer a candidate's question about a specific job."""
        job_ctx = job_context or {}
        system = (
            f"{_SYSTEM_PROMPT}\n\n"
            f"The candidate (ID: {candidate_id}) is asking about job {job_id}.\n"
        )
        if job_ctx.get("title"):
            system += f"Job title: {job_ctx['title']}\n"
        if job_ctx.get("description"):
            system += f"Job description excerpt: {job_ctx['description'][:500]}\n"
        if job_ctx.get("location"):
            system += f"Location: {job_ctx['location']}\n"
        if job_ctx.get("salary_range"):
            system += f"Salary range: {job_ctx['salary_range']}\n"

        messages: list[dict[str, str]] = [
            {"role": "system", "content": system},
            {"role": "user", "content": question},
        ]

        fallback = _match_fallback(question)
        if fallback:
            return self._wrap(
                content=fallback,
                candidate_id=candidate_id,
                model="fallback",
                fallback=True,
                job_id=job_id,
            )

        try:
            llm_resp = await self.router.complete(
                messages,
                model="gpt-4o-mini",
                temperature=0.5,
                max_tokens=1024,
                tenant_id=tenant_id,
            )
            content = llm_resp.content
            model = llm_resp.model
            is_fallback = llm_resp.provider == "mock"
        except Exception as exc:
            logger.warning("answer_job_question.failed candidate=%s job=%s err=%s", candidate_id, job_id, exc)
            content = fallback or f"I'll help you with your question about job {job_id}. Please contact the recruiter for specific details."
            model = "fallback"
            is_fallback = True

        return self._wrap(
            content=content,
            candidate_id=candidate_id,
            model=model,
            fallback=is_fallback,
            job_id=job_id,
        )

    async def help_with_application(
        self,
        candidate_id: str,
        job_id: str,
        step: str,
        *,
        tenant_id: str = "default",
        application_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Provide guidance for a specific step in the application process."""
        app_ctx = application_context or {}
        guidance = self._get_step_guidance(step, app_ctx)

        system = (
            f"{_SYSTEM_PROMPT}\n\n"
            f"You are helping candidate {candidate_id} with their application "
            f"for job {job_id}. They are currently at step: {step}.\n"
        )
        if app_ctx.get("status"):
            system += f"Application status: {app_ctx['status']}\n"

        messages: list[dict[str, str]] = [
            {"role": "system", "content": system},
            {"role": "user", "content": f"I need help with the '{step}' step of my application."},
        ]

        try:
            llm_resp = await self.router.complete(
                messages,
                model="gpt-4o-mini",
                temperature=0.5,
                max_tokens=1024,
                tenant_id=tenant_id,
            )
            llm_text = llm_resp.content
            model = llm_resp.model
            is_fallback = llm_resp.provider == "mock"
        except Exception as exc:
            logger.warning("help_with_application.failed candidate=%s err=%s", candidate_id, exc)
            llm_text = None
            model = "fallback"
            is_fallback = True

        content = llm_text if not is_fallback else guidance

        return self._wrap(
            content=content,
            candidate_id=candidate_id,
            model=model,
            fallback=is_fallback,
            job_id=job_id,
            step=step,
            guidance=guidance,
        )

    async def schedule_interview(
        self,
        candidate_id: str,
        interview_id: str,
        *,
        tenant_id: str = "default",
        interview_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Confirm / reschedule an interview for a candidate."""
        int_ctx = interview_context or {}
        scheduled_at = int_ctx.get("scheduled_at", "TBD")
        location = int_ctx.get("location", "To be determined")
        interviewer = int_ctx.get("interviewer", "Your interviewer")

        confirmation = (
            f"Interview confirmed for candidate {candidate_id}.\n"
            f"Interview ID: {interview_id}\n"
            f"Scheduled: {scheduled_at}\n"
            f"Location: {location}\n"
            f"Interviewer: {interviewer}\n\n"
            "Please make sure to:\n"
            "1. Test your equipment (camera, microphone) beforehand\n"
            "2. Prepare questions about the role and team\n"
            "3. Have a quiet, well-lit space for the interview\n"
            "4. Arrive / log in 5 minutes early\n\n"
            "Good luck! You've got this."
        )

        return self._wrap(
            content=confirmation,
            candidate_id=candidate_id,
            model="system",
            fallback=False,
            interview_id=interview_id,
            scheduled_at=scheduled_at,
            location=location,
        )

    # ── Internals ─────────────────────────────────────────────────────────

    def _build_candidate_context(
        self,
        candidate_id: str,
        extra: dict[str, Any] | None,
    ) -> dict[str, Any]:
        ctx: dict[str, Any] = {"candidate_id": candidate_id}
        if extra:
            ctx.update(extra)
        return ctx

    def _build_messages(
        self,
        *,
        message: str,
        conversation_history: list[dict[str, str]] | None,
        context: dict[str, Any],
    ) -> list[dict[str, str]]:
        system_parts = [_SYSTEM_PROMPT]
        if context.get("full_name"):
            system_parts.append(f"Candidate name: {context['full_name']}")
        if context.get("status"):
            system_parts.append(f"Application status: {context['status']}")
        if context.get("applied_jobs"):
            jobs_str = ", ".join(str(j) for j in context["applied_jobs"])
            system_parts.append(f"Applied jobs: {jobs_str}")

        messages: list[dict[str, str]] = [
            {"role": "system", "content": "\n".join(system_parts)},
        ]

        if conversation_history:
            for msg in conversation_history[-20:]:
                role = msg.get("role", "user")
                if role in ("user", "assistant"):
                    messages.append({"role": role, "content": msg["content"]})

        messages.append({"role": "user", "content": message})
        return messages

    def _get_step_guidance(
        self,
        step: str,
        app_context: dict[str, Any],
    ) -> str:
        step_lower = step.lower().strip()
        guidance_map: dict[str, str] = {
            "resume": "Upload a clear, well-formatted resume (PDF or DOCX). Highlight relevant experience and quantify achievements where possible.",
            "cover_letter": "Write a concise cover letter (3-4 paragraphs) explaining why you're a great fit. Mention specific skills from the job description.",
            "screening": "Prepare for a 15-30 minute phone/video call. Be ready to discuss your background, motivations, and salary expectations.",
            "technical": "Review core technical concepts for the role. Practice coding problems if applicable. Prepare to walk through your thought process.",
            "interview": "Research the company and team. Prepare STAR-format answers for behavioral questions. Have questions ready for your interviewer.",
            "assessment": "Complete the assessment within the given timeframe. Read instructions carefully and ask clarifying questions if needed.",
            "reference": "Prepare 2-3 professional references. Notify them in advance so they can expect a call or email.",
            "offer": "Review the offer carefully. Consider total compensation (base, equity, benefits). Don't hesitate to negotiate — it's expected!",
        }
        for key, guidance in guidance_map.items():
            if key in step_lower:
                return guidance
        return f"For the '{step}' step, make sure to follow the instructions provided. If you have specific questions, your recruiter is here to help."

    def _generic_reply(self, message: str) -> str:
        return (
            "Thank you for your message. I'm here to help with questions about "
            "jobs, applications, interviews, and the hiring process. "
            "Could you provide more details about what you need help with?"
        )

    def _wrap(
        self,
        *,
        content: str,
        candidate_id: str,
        model: str,
        fallback: bool,
        **extra: Any,
    ) -> dict[str, Any]:
        result: dict[str, Any] = {
            "response": content,
            "candidate_id": candidate_id,
            "model": model,
            "fallback": fallback,
            "timestamp": _utcnow(),
            "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        }
        result.update(extra)
        return result


__all__ = ["CandidateChatAssistant"]
