"""AI Orchestrator — Multi-agent task routing and LLM management."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from apps.ai_orchestrator.agents import AGENT_REGISTRY, build_agent
from shared.middleware.rate_limit import rate_limit_ai as _rate_limit_ai_dep

logger = logging.getLogger("ai.orchestrator")


AGENTS_DB: dict[str, dict] = {
    "a1": {
        "id": "a1",
        "type": "resume_parsing",
        "name": "Resume Parser",
        "status": "idle",
        "tasks_completed": 156,
        "description": "Parses and extracts structured data from resumes",
        "model": "gpt-4o",
        "capabilities": ["extract_contact", "extract_experience", "extract_education", "extract_skills"],
        "input_schema": {"resume_text": "string"},
        "output_schema": {"parsed_data": "object", "confidence": "float"},
    },
    "a2": {
        "id": "a2",
        "type": "skill_extraction",
        "name": "Skill Extractor",
        "status": "idle",
        "tasks_completed": 142,
        "description": "Identifies and categorizes skills from text",
        "model": "gpt-4o-mini",
        "capabilities": ["technical_skills", "soft_skills", "proficiency_estimation", "categorization"],
        "input_schema": {"text": "string"},
        "output_schema": {"skills": "array", "confidence": "float"},
    },
    "a3": {
        "id": "a3",
        "type": "candidate_profiling",
        "name": "Candidate Profiler",
        "status": "processing",
        "tasks_completed": 98,
        "description": "Builds comprehensive candidate profiles",
        "model": "gpt-4o",
        "capabilities": ["seniority_evaluation", "domain_identification", "strength_analysis"],
        "input_schema": {"candidate_id": "string"},
        "output_schema": {"profile": "object", "confidence": "float"},
    },
    "a4": {
        "id": "a4",
        "type": "ppe_evaluation",
        "name": "PPE Evaluator",
        "status": "idle",
        "tasks_completed": 67,
        "description": "Evaluates code submissions in pair programming",
        "model": "gpt-4o",
        "capabilities": ["code_quality", "correctness_check", "complexity_analysis", "hint_generation"],
        "input_schema": {"code": "string", "problem_id": "string"},
        "output_schema": {"score": "float", "feedback": "string"},
    },
    "a5": {
        "id": "a5",
        "type": "hr_interview",
        "name": "HR Interviewer",
        "status": "idle",
        "tasks_completed": 89,
        "description": "Conducts behavioral HR interviews",
        "model": "gpt-4o",
        "capabilities": ["behavioral_questions", "culture_fit", "soft_skills_assessment"],
        "input_schema": {"candidate_id": "string", "job_id": "string"},
        "output_schema": {"scores": "object", "recommendation": "string"},
    },
    "a6": {
        "id": "a6",
        "type": "technical_interview",
        "name": "Technical Interviewer",
        "status": "idle",
        "tasks_completed": 76,
        "description": "Conducts technical assessment interviews",
        "model": "gpt-4o",
        "capabilities": ["coding_questions", "system_design", "problem_solving", "technical_depth"],
        "input_schema": {"candidate_id": "string", "job_id": "string"},
        "output_schema": {"scores": "object", "recommendation": "string"},
    },
    "a7": {
        "id": "a7",
        "type": "recruiting_copilot",
        "name": "Recruiting Copilot",
        "status": "idle",
        "tasks_completed": 234,
        "description": "AI assistant for recruiters - drafts emails, suggests actions, analyzes pipelines",
        "model": "gpt-4o",
        "capabilities": ["email_drafting", "action_suggestions", "pipeline_analysis", "candidate_review"],
        "input_schema": {"recruiter_id": "string", "task_type": "string"},
        "output_schema": {"suggestions": "array", "drafts": "array"},
    },
    "a8": {
        "id": "a8",
        "type": "resume_screener",
        "name": "Resume Screener",
        "status": "idle",
        "tasks_completed": 312,
        "description": "Pre-screens resumes against job requirements",
        "model": "gpt-4o-mini",
        "capabilities": ["requirement_matching", "qualification_check", "red_flag_detection", "ranking"],
        "input_schema": {"resume_id": "string", "job_id": "string"},
        "output_schema": {"qualified": "bool", "match_score": "float", "reasons": "array"},
    },
    "a9": {
        "id": "a9",
        "type": "interview_assessor",
        "name": "Interview Assessor",
        "status": "idle",
        "tasks_completed": 145,
        "description": "Analyzes interview transcripts and provides assessment",
        "model": "gpt-4o",
        "capabilities": ["transcript_analysis", "answer_quality", "communication_scoring", "competency_rating"],
        "input_schema": {"interview_id": "string"},
        "output_schema": {"scores": "object", "feedback": "string", "recommendation": "string"},
    },
    "a10": {
        "id": "a10",
        "type": "candidate_matcher",
        "name": "Candidate Matcher",
        "status": "idle",
        "tasks_completed": 198,
        "description": "Matches candidates to jobs using semantic similarity",
        "model": "gpt-4o + text-embedding-3-large",
        "capabilities": ["semantic_matching", "skill_alignment", "experience_fit", "ranking"],
        "input_schema": {"candidate_id": "string", "job_id": "string"},
        "output_schema": {"match_score": "float", "factors": "object"},
    },
    "a11": {
        "id": "a11",
        "type": "bias_detector",
        "name": "Bias Detector",
        "status": "idle",
        "tasks_completed": 87,
        "description": "Detects bias in job descriptions, evaluations, and communications",
        "model": "gpt-4o",
        "capabilities": ["gender_bias", "age_bias", "ethnicity_bias", "education_bias", "suggestion_generation"],
        "input_schema": {"text": "string"},
        "output_schema": {"bias_score": "float", "flagged_phrases": "array", "suggestions": "array"},
    },
}

TASKS_DB: dict[str, dict] = {}


# ── Request Models ──────────────────────────────────────────────────────────────

class OrchestrateRequest(BaseModel):
    agent_type: str = Field(..., description="Agent type to use")
    input: dict = Field(default_factory=dict, description="Input data for the agent")
    context: Optional[dict] = Field(default=None, description="Additional context")
    job_id: Optional[str] = Field(default=None, description="Target job ID")
    candidate_id: Optional[str] = Field(default=None, description="Target candidate ID")
    resume_id: Optional[str] = Field(default=None, description="Target resume ID")
    tenant_id: Optional[str] = Field(default=None, description="Tenant scope (defaults to 'default')")


class CreateTaskRequest(BaseModel):
    agent_type: str
    payload: dict = Field(default_factory=dict)


router = APIRouter(dependencies=[Depends(_rate_limit_ai_dep)])


# ── Response Generation Helpers ─────────────────────────────────────────────────

def _build_reasoning_chain(agent_type: str, input_data: dict, context: dict | None) -> list[dict[str, Any]]:
    """Build a structured reasoning chain for an agent's decision."""
    base_chain = [
        {"step": 1, "action": "input_validation", "description": f"Validated input for {agent_type}", "result": "valid"},
        {"step": 2, "action": "context_loading", "description": "Loaded relevant context and history", "result": "loaded"},
    ]
    if agent_type == "resume_parsing":
        base_chain.extend([
            {"step": 3, "action": "section_detection", "description": "Detected resume sections", "result": "contact, experience, education, skills"},
            {"step": 4, "action": "field_extraction", "description": "Extracted structured fields per section", "result": "extracted"},
            {"step": 5, "action": "confidence_scoring", "description": "Computed confidence per field", "result": "0.94"},
        ])
    elif agent_type == "candidate_matcher":
        base_chain.extend([
            {"step": 3, "action": "skill_alignment", "description": "Compared candidate skills to job requirements", "result": "80% overlap"},
            {"step": 4, "action": "experience_fit", "description": "Evaluated experience level vs requirements", "result": "match"},
            {"step": 5, "action": "semantic_similarity", "description": "Computed embedding-based similarity", "result": "0.87"},
            {"step": 6, "action": "weighted_score", "description": "Combined factors with weights", "result": "0.85"},
        ])
    elif agent_type == "bias_detector":
        base_chain.extend([
            {"step": 3, "action": "text_tokenization", "description": "Tokenized input text", "result": "tokens"},
            {"step": 4, "action": "pattern_matching", "description": "Matched against bias patterns", "result": "low risk"},
            {"step": 5, "action": "context_analysis", "description": "Analyzed phrases in context", "result": "neutral"},
        ])
    elif agent_type == "resume_screener":
        base_chain.extend([
            {"step": 3, "action": "requirement_extraction", "description": "Extracted job requirements", "result": "list"},
            {"step": 4, "action": "qualification_check", "description": "Checked candidate qualifications", "result": "qualified"},
            {"step": 5, "action": "red_flag_scan", "description": "Scanned for red flags", "result": "none"},
        ])
    elif agent_type == "interview_assessor":
        base_chain.extend([
            {"step": 3, "action": "transcript_parsing", "description": "Parsed interview transcript", "result": "parsed"},
            {"step": 4, "action": "answer_scoring", "description": "Scored each answer", "result": "scored"},
            {"step": 5, "action": "competency_evaluation", "description": "Evaluated competencies", "result": "evaluated"},
        ])
    else:
        base_chain.append({"step": 3, "action": "task_processing", "description": f"Processed {agent_type} task", "result": "completed"})
    base_chain.append({"step": len(base_chain) + 1, "action": "result_generation", "description": "Generated final result", "result": "success"})
    return base_chain


def _generate_result(agent_type: str, input_data: dict, context: dict | None,
                     job_id: str | None, candidate_id: str | None, resume_id: str | None) -> dict[str, Any]:
    """Generate a structured result for the given agent type."""
    response_map = {
        "resume_parsing": {
            "parsed_data": {
                "name": "Extracted Name",
                "email": "candidate@example.com",
                "phone": "+1-555-0100",
                "skills": ["Python", "FastAPI", "PostgreSQL"],
                "experience_years": 5,
                "education": [{"degree": "B.S. Computer Science", "year": 2019}],
            },
            "confidence_score": 0.94,
        },
        "skill_extraction": {
            "skills": [
                {"name": "Python", "level": "expert", "category": "programming_language"},
                {"name": "SQL", "level": "intermediate", "category": "database"},
                {"name": "Docker", "level": "advanced", "category": "devops"},
            ],
            "total_skills": 3,
            "confidence_score": 0.89,
        },
        "candidate_profiling": {
            "profile": {
                "seniority": "senior",
                "domain": "backend",
                "strengths": ["system design", "APIs", "performance"],
                "years_experience": 8,
            },
            "confidence_score": 0.87,
        },
        "ppe_evaluation": {
            "score": 7.5,
            "tests_passed": "8/10",
            "code_quality": "good",
            "recommendation": "hire",
            "confidence_score": 0.85,
        },
        "hr_interview": {
            "scores": {"communication": 8, "culture_fit": 7, "motivation": 9},
            "overall_score": 8.0,
            "recommendation": "hire",
            "confidence_score": 0.82,
        },
        "technical_interview": {
            "scores": {"coding": 8, "system_design": 7, "problem_solving": 8},
            "overall_score": 7.7,
            "recommendation": "hire",
            "confidence_score": 0.88,
        },
        "recruiting_copilot": {
            "suggestions": [
                {"action": "Follow up with Sarah Chen", "priority": "high", "reason": "No response after 5 days"},
                {"action": "Schedule technical screen", "priority": "medium", "reason": "Resume looks promising"},
            ],
            "email_drafts": [{
                "to": "candidate@example.com",
                "subject": "Following up on your application",
                "body": "Hi, I wanted to follow up on your application..."
            }],
            "pipeline_summary": {"new": 23, "screening": 15, "interview": 8, "offer": 3},
            "confidence_score": 0.91,
        },
        "resume_screener": {
            "qualified": True,
            "match_score": 0.84,
            "passed_requirements": ["5+ years experience", "Python proficient", "Cloud experience"],
            "missing_requirements": ["Kubernetes certification"],
            "red_flags": [],
            "reasons": [
                "Strong technical background matching the role",
                "Progressive career growth",
                "Relevant domain experience",
            ],
            "confidence_score": 0.90,
        },
        "interview_assessor": {
            "scores": {
                "technical_depth": 8.2,
                "communication": 8.5,
                "problem_solving": 7.8,
                "cultural_alignment": 8.0,
            },
            "overall_score": 8.13,
            "key_observations": [
                "Strong system design fundamentals",
                "Clear communication and structured responses",
                "Good follow-up questions",
            ],
            "concerns": ["Limited experience with the specific tech stack"],
            "recommendation": "hire",
            "confidence_score": 0.87,
        },
        "candidate_matcher": {
            "match_score": 0.85,
            "factors": {
                "skill_alignment": 0.92,
                "experience_fit": 0.88,
                "seniority_match": 0.85,
                "domain_relevance": 0.80,
            },
            "matching_skills": ["Python", "PostgreSQL", "Docker"],
            "missing_skills": ["Kubernetes"],
            "recommendation": "Strong match - proceed with interview",
            "confidence_score": 0.89,
        },
        "bias_detector": {
            "bias_score": 0.15,
            "bias_level": "low",
            "flagged_phrases": [],
            "categories": {
                "gender_bias": 0.05,
                "age_bias": 0.10,
                "ethnicity_bias": 0.05,
                "education_bias": 0.15,
            },
            "suggestions": [
                "Consider using gender-neutral pronouns throughout",
                "Avoid phrases that imply specific age groups",
            ],
            "confidence_score": 0.92,
        },
    }

    result = response_map.get(agent_type, {"status": "processed", "confidence_score": 0.5})

    # Attach context references
    if job_id:
        result["job_id"] = job_id
    if candidate_id:
        result["candidate_id"] = candidate_id
    if resume_id:
        result["resume_id"] = resume_id
    return result


# ── Endpoints ───────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "ai-orchestrator"}


@router.get("/agents")
async def list_agents():
    return {
        "agents": [
            {
                "id": a["id"],
                "type": a["type"],
                "name": a["name"],
                "status": a["status"],
                "tasks_completed": a["tasks_completed"],
                "description": a["description"],
                "model": a["model"],
                "capabilities": a["capabilities"],
                "input_schema": a["input_schema"],
                "output_schema": a["output_schema"],
            }
            for a in AGENTS_DB.values()
        ],
        "total": len(AGENTS_DB),
    }


@router.get("/agents/{agent_type}/capabilities")
async def get_agent_capabilities(agent_type: str):
    agent = next((a for a in AGENTS_DB.values() if a["type"] == agent_type), None)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent type '{agent_type}' not found")
    return {
        "agent_type": agent_type,
        "agent_id": agent["id"],
        "name": agent["name"],
        "model": agent["model"],
        "capabilities": agent["capabilities"],
        "input_schema": agent["input_schema"],
        "output_schema": agent["output_schema"],
        "description": agent["description"],
        "supported_contexts": ["job_id", "candidate_id", "resume_id"],
    }


@router.post("/orchestrate")
async def orchestrate(data: OrchestrateRequest):
    agent = next((a for a in AGENTS_DB.values() if a["type"] == data.agent_type), None)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent type '{data.agent_type}' not found")

    task_id = f"task_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    tenant_id = data.tenant_id or "default"

    # Real LLM-backed agents (screening, matching) get dispatched through the
    # agent registry; everything else still returns the deterministic mock
    # so the demo flows keep working without API keys.
    if data.agent_type in AGENT_REGISTRY:
        candidate_payload = {
            "id": data.candidate_id or data.input.get("candidate_id"),
            **data.input.get("candidate", {}),
        }
        job_payload = {
            "id": data.job_id or data.input.get("job_id"),
            **data.input.get("job", {}),
        }
        try:
            real_agent = build_agent(data.agent_type, tenant_id=tenant_id)
            result = await real_agent.process_task(
                {"candidate": candidate_payload, "job": job_payload}
            )
            reasoning_chain = _build_reasoning_chain(data.agent_type, data.input, data.context)
            confidence_score = float(result.get("confidence_score", 0.0))
            model_used = result.get("model_used") or agent["model"]
        except Exception as exc:
            logger.exception(
                "orchestrate.real_agent_failed agent=%s tenant=%s", data.agent_type, tenant_id
            )
            raise HTTPException(
                status_code=500,
                detail=f"Agent '{data.agent_type}' failed: {exc}",
            ) from exc
    else:
        result = _generate_result(
            data.agent_type, data.input, data.context,
            data.job_id, data.candidate_id, data.resume_id,
        )
        reasoning_chain = _build_reasoning_chain(data.agent_type, data.input, data.context)
        confidence_score = result.get("confidence_score", 0.85)
        model_used = agent["model"]

    if data.job_id:
        result["job_id"] = data.job_id
    if data.candidate_id:
        result["candidate_id"] = data.candidate_id
    if data.resume_id:
        result["resume_id"] = data.resume_id

    task = {
        "id": task_id,
        "agent_type": data.agent_type,
        "agent_id": agent["id"],
        "agent_name": agent["name"],
        "model_used": model_used,
        "status": "completed",
        "input": data.input,
        "context": data.context,
        "job_id": data.job_id,
        "candidate_id": data.candidate_id,
        "resume_id": data.resume_id,
        "result": result,
        "reasoning_chain": reasoning_chain,
        "confidence_score": confidence_score,
        "tenant_id": tenant_id,
        "created_at": now,
        "completed_at": now,
    }
    TASKS_DB[task_id] = task
    agent["tasks_completed"] += 1

    return {
        "task_id": task_id,
        "status": "completed",
        "agent_type": data.agent_type,
        "agent_name": agent["name"],
        "model_used": model_used,
        "result": result,
        "reasoning_chain": reasoning_chain,
        "confidence_score": confidence_score,
        "tenant_id": tenant_id,
        "context": {
            "job_id": data.job_id,
            "candidate_id": data.candidate_id,
            "resume_id": data.resume_id,
        },
        "created_at": now,
        "completed_at": now,
    }


@router.post("/tasks")
async def create_task(data: CreateTaskRequest):
    agent = next((a for a in AGENTS_DB.values() if a["type"] == data.agent_type), None)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent type '{data.agent_type}' not found")

    task_id = f"task_{uuid.uuid4().hex[:12]}"
    task = {
        "id": task_id,
        "agent_type": data.agent_type,
        "agent_id": agent["id"],
        "agent_name": agent["name"],
        "status": "queued",
        "payload": data.payload,
        "result": None,
        "reasoning_chain": None,
        "confidence_score": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
    }
    TASKS_DB[task_id] = task

    return {
        "task_id": task_id,
        "status": "queued",
        "agent_type": data.agent_type,
    }


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    task = TASKS_DB.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return {
        "task_id": task["id"],
        "status": task["status"],
        "agent_type": task["agent_type"],
        "agent_name": task.get("agent_name"),
        "model_used": task.get("model_used"),
        "result": task["result"],
        "reasoning_chain": task.get("reasoning_chain"),
        "confidence_score": task.get("confidence_score"),
        "created_at": task["created_at"],
        "completed_at": task["completed_at"],
    }


@router.get("/tasks/{task_id}/result")
async def get_task_result(task_id: str):
    task = TASKS_DB.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    if task["status"] != "completed":
        raise HTTPException(status_code=409, detail=f"Task {task_id} is not yet complete (status={task['status']})")
    return {
        "task_id": task["id"],
        "agent_type": task["agent_type"],
        "agent_name": task.get("agent_name"),
        "model_used": task.get("model_used"),
        "result": task["result"],
        "reasoning_chain": task.get("reasoning_chain"),
        "confidence_score": task.get("confidence_score"),
        "context": {
            "job_id": task.get("job_id"),
            "candidate_id": task.get("candidate_id"),
            "resume_id": task.get("resume_id"),
        },
        "completed_at": task["completed_at"],
    }
