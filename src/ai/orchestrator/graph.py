"""AI Orchestrator — LangGraph-based multi-agent coordination."""

from __future__ import annotations

from enum import Enum
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph


class OrchestratorState(TypedDict):
    """State shared across the orchestration graph."""

    tenant_id: str
    task_type: str
    task_data: dict[str, Any]
    agent_results: dict[str, Any]
    current_agent: str | None
    error: str | None
    completed: bool


class TaskType(str, Enum):
    RESUME_PROCESSING = "resume_processing"
    CANDIDATE_EVALUATION = "candidate_evaluation"
    INTERVIEW_ORCHESTRATION = "interview_orchestration"
    PPE_SESSION = "ppe_session"
    HIRING_RECOMMENDATION = "hiring_recommendation"
    WORKFLOW_EXECUTION = "workflow_execution"


def build_orchestration_graph(task_type: TaskType) -> StateGraph:
    """Build a LangGraph StateGraph for the given task type."""

    match task_type:
        case TaskType.RESUME_PROCESSING:
            return _build_resume_processing_graph()
        case TaskType.CANDIDATE_EVALUATION:
            return _build_candidate_evaluation_graph()
        case TaskType.INTERVIEW_ORCHESTRATION:
            return _build_interview_orchestration_graph()
        case TaskType.PPE_SESSION:
            return _build_ppe_session_graph()
        case TaskType.HIRING_RECOMMENDATION:
            return _build_hiring_recommendation_graph()
        case _:
            return _build_default_graph()


def _build_resume_processing_graph() -> StateGraph:
    graph = StateGraph(OrchestratorState)

    graph.add_node("parse_resume", _parse_resume_node)
    graph.add_node("extract_skills", _extract_skills_node)
    graph.add_node("enrich_candidate", _enrich_candidate_node)
    graph.add_node("generate_embedding", _generate_embedding_node)
    graph.add_node("rank_candidate", _rank_candidate_node)

    graph.set_entry_point("parse_resume")
    graph.add_edge("parse_resume", "extract_skills")
    graph.add_edge("extract_skills", "enrich_candidate")
    graph.add_edge("enrich_candidate", "generate_embedding")
    graph.add_edge("generate_embedding", "rank_candidate")
    graph.add_edge("rank_candidate", END)

    return graph


def _build_candidate_evaluation_graph() -> StateGraph:
    graph = StateGraph(OrchestratorState)

    graph.add_node("screen_resume", _screen_resume_node)
    graph.add_node("match_skills", _match_skills_node)
    graph.add_node("estimate_seniority", _estimate_seniority_node)
    graph.add_node("compute_score", _compute_score_node)
    graph.add_node("generate_explanation", _generate_explanation_node)

    graph.set_entry_point("screen_resume")
    graph.add_edge("screen_resume", "match_skills")
    graph.add_edge("match_skills", "estimate_seniority")
    graph.add_conditional_edges(
        "estimate_seniority",
        _should_generate_explanation,
        {"yes": "generate_explanation", "no": "compute_score"},
    )
    graph.add_edge("generate_explanation", "compute_score")
    graph.add_edge("compute_score", END)

    return graph


def _build_interview_orchestration_graph() -> StateGraph:
    graph = StateGraph(OrchestratorState)

    graph.add_node("schedule_interview", _schedule_interview_node)
    graph.add_node("prepare_questions", _prepare_questions_node)
    graph.add_node("conduct_interview", _conduct_interview_node)
    graph.add_node("analyze_responses", _analyze_responses_node)
    graph.add_node("generate_feedback", _generate_feedback_node)

    graph.set_entry_point("schedule_interview")
    graph.add_edge("schedule_interview", "prepare_questions")
    graph.add_edge("prepare_questions", "conduct_interview")
    graph.add_edge("conduct_interview", "analyze_responses")
    graph.add_edge("analyze_responses", "generate_feedback")
    graph.add_edge("generate_feedback", END)

    return graph


def _build_ppe_session_graph() -> StateGraph:
    graph = StateGraph(OrchestratorState)

    graph.add_node("init_session", _init_ppe_session_node)
    graph.add_node("present_problem", _present_problem_node)
    graph.add_node("process_submission", _process_submission_node)
    graph.add_node("provide_hint", _provide_hint_node)
    graph.add_node("ask_follow_up", _ask_follow_up_node)
    graph.add_node("evaluate", _evaluate_ppe_node)

    graph.set_entry_point("init_session")
    graph.add_edge("init_session", "present_problem")
    graph.add_conditional_edges(
        "process_submission",
        _ppe_submission_routing,
        {
            "all_pass": "ask_follow_up",
            "partial_pass": "process_submission",
            "needs_hint": "provide_hint",
            "complete": "evaluate",
        },
    )
    graph.add_edge("provide_hint", "process_submission")
    graph.add_edge("ask_follow_up", "process_submission")
    graph.add_edge("evaluate", END)

    return graph


def _build_hiring_recommendation_graph() -> StateGraph:
    graph = StateGraph(OrchestratorState)

    graph.add_node("aggregate_evaluations", _aggregate_evaluations_node)
    graph.add_node("compare_benchmarks", _compare_benchmarks_node)
    graph.add_node("assess_risks", _assess_risks_node)
    graph.add_node("generate_recommendation", _generate_recommendation_node)
    graph.add_node("build_report", _build_report_node)

    graph.set_entry_point("aggregate_evaluations")
    graph.add_edge("aggregate_evaluations", "compare_benchmarks")
    graph.add_edge("compare_benchmarks", "assess_risks")
    graph.add_edge("assess_risks", "generate_recommendation")
    graph.add_edge("generate_recommendation", "build_report")
    graph.add_edge("build_report", END)

    return graph


def _build_default_graph() -> StateGraph:
    graph = StateGraph(OrchestratorState)
    graph.add_node("process", _default_process_node)
    graph.set_entry_point("process")
    graph.add_edge("process", END)
    return graph


def _should_generate_explanation(state: OrchestratorState) -> str:
    score = state.get("agent_results", {}).get("overall_score", 0)
    return "yes" if score < 6.0 else "yes"  # Always generate explanations for transparency


def _ppe_submission_routing(state: OrchestratorState) -> str:
    results = state.get("agent_results", {})
    if results.get("session_complete"):
        return "complete"
    if results.get("all_tests_passed"):
        return "all_pass"
    if results.get("hints_available"):
        return "needs_hint"
    return "partial_pass"


# --- Placeholder node implementations ---
# In production, these nodes invoke the actual AI agents via the agent registry.

async def _parse_resume_node(state: OrchestratorState) -> OrchestratorState:
    state["agent_results"]["resume_parsed"] = True
    return state

async def _extract_skills_node(state: OrchestratorState) -> OrchestratorState:
    state["agent_results"]["skills_extracted"] = True
    return state

async def _enrich_candidate_node(state: OrchestratorState) -> OrchestratorState:
    state["agent_results"]["candidate_enriched"] = True
    return state

async def _generate_embedding_node(state: OrchestratorState) -> OrchestratorState:
    state["agent_results"]["embedding_generated"] = True
    return state

async def _rank_candidate_node(state: OrchestratorState) -> OrchestratorState:
    state["agent_results"]["candidate_ranked"] = True
    state["completed"] = True
    return state

async def _screen_resume_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _match_skills_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _estimate_seniority_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _compute_score_node(state: OrchestratorState) -> OrchestratorState:
    state["completed"] = True
    return state

async def _generate_explanation_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _schedule_interview_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _prepare_questions_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _conduct_interview_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _analyze_responses_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _generate_feedback_node(state: OrchestratorState) -> OrchestratorState:
    state["completed"] = True
    return state

async def _init_ppe_session_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _present_problem_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _process_submission_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _provide_hint_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _ask_follow_up_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _evaluate_ppe_node(state: OrchestratorState) -> OrchestratorState:
    state["completed"] = True
    return state

async def _aggregate_evaluations_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _compare_benchmarks_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _assess_risks_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _generate_recommendation_node(state: OrchestratorState) -> OrchestratorState:
    return state

async def _build_report_node(state: OrchestratorState) -> OrchestratorState:
    state["completed"] = True
    return state

async def _default_process_node(state: OrchestratorState) -> OrchestratorState:
    state["completed"] = True
    return state
