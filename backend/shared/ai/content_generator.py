"""AI content generator — LLM-backed content creation with template fallback.

Provides :class:`ContentGenerator`, a unified interface for generating
recruitment-related content: job descriptions, emails, offer letters,
rejection letters, and LinkedIn posts.  Each method first attempts an
LLM-powered generation via :class:`~shared.ai.llm_router.LLMRouter` and
falls back to deterministic template-based output when no LLM provider
is reachable.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from shared.ai.llm_router import LLMRouter, get_llm_router

logger = logging.getLogger("ai.content_generator")


class ContentGenerator:
    """Generate recruitment content via LLM with template fallback."""

    def __init__(self, *, router: LLMRouter | None = None, tenant_id: str | None = None) -> None:
        self._router = router or get_llm_router()
        self._tenant_id = tenant_id or "default"

    async def _call_llm(self, system: str, user: str, *, temperature: float = 0.7) -> str:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        try:
            resp = await self._router.complete(
                messages,
                temperature=temperature,
                max_tokens=4096,
                tenant_id=self._tenant_id,
            )
            if resp.provider == "mock":
                parsed = json.loads(resp.content)
                if parsed.get("mock"):
                    raise ValueError("mock mode")
            return resp.content
        except Exception as exc:
            logger.info("content_generator.llm_fallback reason=%s", exc)
            return ""

    async def generate_job_description(
        self,
        job_title: str,
        requirements: list[str] | None = None,
        company_info: dict[str, Any] | None = None,
    ) -> str:
        requirements = requirements or []
        company_info = company_info or {}

        system = (
            "You are an expert technical recruiter and copywriter. "
            "Generate a compelling, inclusive job description."
        )
        user = (
            f"Job title: {job_title}\n"
            f"Requirements: {', '.join(requirements) if requirements else 'Not specified'}\n"
            f"Company: {company_info.get('name', 'Our company')}\n"
            f"Industry: {company_info.get('industry', '')}\n"
            f"Location: {company_info.get('location', '')}\n"
            f"Culture: {company_info.get('culture', '')}\n\n"
            "Write a professional job description with sections: "
            "About Us, Role Overview, Key Responsibilities, Requirements, Benefits."
        )

        result = await self._call_llm(system, user)
        if result:
            return result

        req_lines = "\n".join(f"  - {r}" for r in requirements) if requirements else "  - To be defined"
        company_name = company_info.get("name", "Our company")
        location = company_info.get("location", "Remote")
        return (
            f"# {job_title}\n\n"
            f"## About Us\n"
            f"{company_name} is looking for a talented {job_title} to join our team.\n\n"
            f"## Role Overview\n"
            f"We are seeking a {job_title} based in {location}.\n\n"
            f"## Key Responsibilities\n"
            f"  - Drive key initiatives in {job_title}\n"
            f"  - Collaborate with cross-functional teams\n"
            f"  - Deliver high-quality results\n\n"
            f"## Requirements\n"
            f"{req_lines}\n\n"
            f"## Benefits\n"
            f"  - Competitive compensation\n"
            f"  - Professional development opportunities\n"
            f"  - Inclusive work environment"
        )

    async def generate_email(
        self,
        template_type: str,
        candidate_data: dict[str, Any] | None = None,
        job_data: dict[str, Any] | None = None,
    ) -> str:
        candidate_data = candidate_data or {}
        job_data = job_data or {}

        system = (
            "You are a professional recruitment communications specialist. "
            "Write a clear, warm, and professional email."
        )
        user = (
            f"Email type: {template_type}\n"
            f"Candidate name: {candidate_data.get('name', 'Candidate')}\n"
            f"Candidate email: {candidate_data.get('email', '')}\n"
            f"Job title: {job_data.get('title', 'the position')}\n"
            f"Company: {job_data.get('company', 'our company')}\n"
            f"Additional context: {json.dumps({**candidate_data, **job_data}, default=str)}\n\n"
            f"Write a {template_type} email. Include a clear subject line and professional body."
        )

        result = await self._call_llm(system, user)
        if result:
            return result

        name = candidate_data.get("name", "Candidate")
        title = job_data.get("title", "the position")
        company = job_data.get("company", "our company")

        templates = {
            "interview_invitation": (
                f"Subject: Interview Invitation — {title} at {company}\n\n"
                f"Dear {name},\n\n"
                f"Thank you for your application for the {title} position at {company}. "
                f"We were impressed by your qualifications and would like to invite you to an interview.\n\n"
                f"Please let us know your availability for the coming week.\n\n"
                f"Best regards,\nRecruitment Team"
            ),
            "application_received": (
                f"Subject: Application Received — {title}\n\n"
                f"Dear {name},\n\n"
                f"We have received your application for the {title} position at {company}. "
                f"Our team will review it and get back to you shortly.\n\n"
                f"Best regards,\nRecruitment Team"
            ),
            "follow_up": (
                f"Subject: Following Up — {title} at {company}\n\n"
                f"Dear {name},\n\n"
                f"I hope this message finds you well. I wanted to follow up regarding "
                f"the {title} position at {company}.\n\n"
                f"Please let me know if you have any questions.\n\n"
                f"Best regards,\nRecruitment Team"
            ),
        }
        return templates.get(
            template_type,
            f"Subject: {template_type.replace('_', ' ').title()} — {title}\n\n"
            f"Dear {name},\n\n"
            f"Thank you for your interest in the {title} position at {company}.\n\n"
            f"Best regards,\nRecruitment Team",
        )

    async def generate_offer_letter(
        self,
        candidate_data: dict[str, Any] | None = None,
        job_data: dict[str, Any] | None = None,
        offer_terms: dict[str, Any] | None = None,
    ) -> str:
        candidate_data = candidate_data or {}
        job_data = job_data or {}
        offer_terms = offer_terms or {}

        system = (
            "You are an HR professional drafting formal offer letters. "
            "Write a professional, warm, and legally-appropriate offer letter."
        )
        user = (
            f"Candidate: {candidate_data.get('name', 'Candidate')}\n"
            f"Position: {job_data.get('title', 'the position')}\n"
            f"Company: {job_data.get('company', 'our company')}\n"
            f"Salary: {offer_terms.get('salary', 'Competitive')}\n"
            f"Start date: {offer_terms.get('start_date', 'TBD')}\n"
            f"Location: {offer_terms.get('location', 'TBD')}\n"
            f"Benefits: {offer_terms.get('benefits', 'Standard benefits package')}\n"
            f"Expiry: {offer_terms.get('expiry_date', 'TBD')}\n\n"
            "Write a complete offer letter with all standard sections."
        )

        result = await self._call_llm(system, user)
        if result:
            return result

        name = candidate_data.get("name", "Candidate")
        title = job_data.get("title", "the position")
        company = job_data.get("company", "our company")
        salary = offer_terms.get("salary", "Competitive")
        start_date = offer_terms.get("start_date", "to be determined")
        location = offer_terms.get("location", "to be determined")
        benefits = offer_terms.get("benefits", "our standard benefits package")
        expiry = offer_terms.get("expiry_date", "to be determined")

        return (
            f"Dear {name},\n\n"
            f"## Offer of Employment — {title}\n\n"
            f"We are pleased to offer you the position of {title} at {company}.\n\n"
            f"**Compensation:** {salary}\n"
            f"**Start Date:** {start_date}\n"
            f"**Location:** {location}\n"
            f"**Benefits:** {benefits}\n\n"
            f"This offer is valid until {expiry}. Please sign and return "
            f"this letter to confirm your acceptance.\n\n"
            f"We look forward to welcoming you to the team.\n\n"
            f"Sincerely,\n{company} Recruitment Team"
        )

    async def generate_rejection_letter(
        self,
        candidate_data: dict[str, Any] | None = None,
        job_data: dict[str, Any] | None = None,
        reason: str | None = None,
    ) -> str:
        candidate_data = candidate_data or {}
        job_data = job_data or {}

        system = (
            "You are an empathetic HR professional writing rejection letters. "
            "Be respectful, kind, and constructive while maintaining professionalism."
        )
        user = (
            f"Candidate: {candidate_data.get('name', 'Candidate')}\n"
            f"Position: {job_data.get('title', 'the position')}\n"
            f"Company: {job_data.get('company', 'our company')}\n"
            f"Reason: {reason or 'Not specified'}\n\n"
            "Write a respectful and empathetic rejection letter."
        )

        result = await self._call_llm(system, user)
        if result:
            return result

        name = candidate_data.get("name", "Candidate")
        title = job_data.get("title", "the position")
        company = job_data.get("company", "our company")

        return (
            f"Dear {name},\n\n"
            f"Thank you for your interest in the {title} position at {company} "
            f"and for taking the time to speak with us.\n\n"
            f"After careful consideration, we have decided to move forward with "
            f"other candidates whose qualifications more closely match our current needs.\n\n"
            f"We appreciate your interest in {company} and encourage you to apply "
            f"for future opportunities that match your skills and experience.\n\n"
            f"We wish you the best in your job search.\n\n"
            f"Sincerely,\n{company} Recruitment Team"
        )

    async def generate_linkedin_post(
        self,
        job_data: dict[str, Any] | None = None,
        tone: str = "professional",
    ) -> str:
        job_data = job_data or {}

        system = (
            "You are a social media expert specializing in recruitment marketing. "
            f"Write an engaging LinkedIn post in a {tone} tone."
        )
        user = (
            f"Job title: {job_data.get('title', 'Multiple positions')}\n"
            f"Company: {job_data.get('company', 'our company')}\n"
            f"Location: {job_data.get('location', '')}\n"
            f"Department: {job_data.get('department', '')}\n"
            f"Key skills: {', '.join(job_data.get('skills', []))}\n\n"
            "Write a LinkedIn post to attract top talent. Include relevant hashtags."
        )

        result = await self._call_llm(system, user)
        if result:
            return result

        title = job_data.get("title", "Multiple positions")
        company = job_data.get("company", "our company")
        location = job_data.get("location", "various locations")
        skills = job_data.get("skills", [])
        skills_text = ", ".join(skills) if skills else "various skills"

        return (
            f"We're hiring! {company} is looking for a {title} to join our team "
            f"in {location}.\n\n"
            f"Key skills we're looking for: {skills_text}\n\n"
            f"If you're passionate about making an impact and growing your career, "
            f"we'd love to hear from you!\n\n"
            f"Apply now or tag someone who might be interested.\n\n"
            f"#Hiring #Jobs #Recruitment #{company.replace(' ', '')} #Career"
        )
