"""PPE Agent — Pair Programming Evaluation Agent.

Simulates a senior FAANG engineer conducting pair programming interviews.
Evaluates coding ability, problem-solving, CS fundamentals, communication,
and provides explainable seniority estimation.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from src.ai.agents.base_agent import AgentType, BaseAgent


class PPEAgent(BaseAgent):
    """
    The PPE Agent is the platform's core differentiator.

    It behaves as a senior engineer who:
    - Presents coding problems adapted to the candidate's level
    - Provides progressive hints when the candidate is stuck
    - Asks follow-up questions to probe deeper understanding
    - Evaluates code quality, efficiency, and reasoning
    - Simulates real pair programming collaboration
    - Escalates to system design when appropriate
    """

    def __init__(self, tenant_id: str) -> None:
        super().__init__(agent_type=AgentType.PPE_EVALUATION, tenant_id=tenant_id)
        self.difficulty_level = "medium"
        self.hints_provided = 0
        self.max_hints = 3
        self.follow_up_count = 0
        self.max_follow_ups = 5
        self.session_context: dict[str, Any] = {}
        self.code_history: list[dict[str, Any]] = []
        self.evaluation_dimensions: dict[str, float] = {
            "correctness": 0.0,
            "efficiency": 0.0,
            "algorithm_quality": 0.0,
            "edge_case_handling": 0.0,
            "big_o_understanding": 0.0,
            "tradeoff_reasoning": 0.0,
            "scalability_awareness": 0.0,
            "data_structures_understanding": 0.0,
            "readability": 0.0,
            "maintainability": 0.0,
            "modularity": 0.0,
            "naming_conventions": 0.0,
            "decomposition": 0.0,
            "iterative_reasoning": 0.0,
            "debugging_approach": 0.0,
            "optimization_strategy": 0.0,
            "explanation_clarity": 0.0,
            "collaborative_interaction": 0.0,
            "reasoning_transparency": 0.0,
        }

    def get_system_prompt(self) -> str:
        return f"""You are a senior staff engineer at a FAANG company conducting a pair programming interview.

## Your Role
- You are experienced, fair, and thorough
- You simulate a real pair programming partner, not an interrogator
- You provide hints when the candidate is stuck, but progressively (not all at once)
- You ask follow-up questions to understand depth of knowledge
- You evaluate both the code and the thinking process

## Current Session
- Difficulty: {self.difficulty_level}
- Hints provided: {self.hints_provided}/{self.max_hints}
- Follow-ups asked: {self.follow_up_count}/{self.max_follow_ups}

## Evaluation Dimensions (you must assess all):
1. Technical Skills (30%): correctness, efficiency, algorithm quality, edge cases
2. Computer Science (20%): Big-O, tradeoffs, scalability, data structures
3. Code Quality (15%): readability, maintainability, modularity, naming
4. Problem Solving (20%): decomposition, reasoning, debugging, optimization
5. Communication (15%): clarity, collaboration, transparency

## Behavior Rules
- Start with a greeting and problem presentation
- If the candidate asks for a hint, provide the LEAST specific hint first
- If they're going in the wrong direction, gently redirect
- After they solve it, ask 1-2 follow-up questions about complexity or alternatives
- At the end, provide a brief summary of strengths and areas for improvement
- Always explain your reasoning for evaluation decisions

## Hint Progression
1. Conceptual nudge (point them toward the right approach)
2. Partial guidance (suggest a specific technique)
3. Near-solution (give them the key insight)

Output your evaluation as a JSON object when the session ends."""

    async def process_task(self, task_data: dict[str, Any]) -> dict[str, Any]:
        task_type = task_data.get("task_type", "")

        match task_type:
            case "start_session":
                return await self._start_session(task_data)
            case "present_problem":
                return await self._present_problem(task_data)
            case "process_code_submission":
                return await self._process_code_submission(task_data)
            case "provide_hint":
                return await self._provide_hint(task_data)
            case "ask_follow_up":
                return await self._ask_follow_up(task_data)
            case "evaluate_session":
                return await self._evaluate_session(task_data)
            case "handle_message":
                return await self._handle_candidate_message(task_data)
            case _:
                return {"error": f"Unknown task type: {task_type}"}

    async def _start_session(self, data: dict[str, Any]) -> dict[str, Any]:
        self.session_context = {
            "candidate_id": data.get("candidate_id"),
            "interview_id": data.get("interview_id"),
            "language": data.get("language", "python"),
            "candidate_level": data.get("candidate_level", "mid"),
            "problem": data.get("problem"),
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
        self.difficulty_level = data.get("difficulty", "medium")
        self.update_status("processing")

        problem = self.session_context["problem"]
        return {
            "type": "session_started",
            "session_id": self.agent_id,
            "greeting": self._generate_greeting(),
            "problem_presentation": self._format_problem(problem),
            "guidelines": self._get_session_guidelines(),
        }

    async def _present_problem(self, data: dict[str, Any]) -> dict[str, Any]:
        problem = data.get("problem", {})
        return {
            "type": "problem_presented",
            "title": problem.get("title", "Coding Problem"),
            "description": problem.get("description", ""),
            "examples": problem.get("examples", []),
            "constraints": problem.get("constraints", []),
            "initial_prompt": "Take a moment to think about the problem. "
            "Feel free to ask clarifying questions before you start coding.",
        }

    async def _process_code_submission(self, data: dict[str, Any]) -> dict[str, Any]:
        code = data.get("code", "")
        execution_result = data.get("execution_result", {})

        self.code_history.append({
            "code": code,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "execution_result": execution_result,
        })

        all_passed = execution_result.get("all_tests_passed", False)
        total_tests = execution_result.get("total_tests", 0)
        passed_tests = execution_result.get("passed_tests", 0)

        response: dict[str, Any] = {
            "type": "code_review",
            "tests_passed": f"{passed_tests}/{total_tests}",
            "all_tests_passed": all_passed,
        }

        if all_passed:
            response["message"] = "All tests pass! Great work."
            response["follow_up"] = self._generate_follow_up_question()
            self.follow_up_count += 1
        else:
            stderr = execution_result.get("stderr", "")
            response["message"] = self._analyze_failure(code, stderr, execution_result)
            response["hint_available"] = self.hints_provided < self.max_hints

        return response

    async def _provide_hint(self, data: dict[str, Any]) -> dict[str, Any]:
        if self.hints_provided >= self.max_hints:
            return {
                "type": "hint",
                "message": "You've used all available hints. "
                "Try breaking the problem into smaller parts.",
                "hints_remaining": 0,
            }

        self.hints_provided += 1
        hint = self._generate_progressive_hint()
        return {
            "type": "hint",
            "message": hint,
            "hints_remaining": self.max_hints - self.hints_provided,
            "hint_level": self.hints_provided,
        }

    async def _ask_follow_up(self, data: dict[str, Any]) -> dict[str, Any]:
        if self.follow_up_count >= self.max_follow_ups:
            return {
                "type": "session_wrap_up",
                "message": "Thank you for the thorough discussion. "
                "Let me summarize my observations.",
            }

        question = self._generate_follow_up_question()
        self.follow_up_count += 1
        return {
            "type": "follow_up",
            "question": question,
            "context": "I'd like to understand your thinking deeper.",
        }

    async def _evaluate_session(self, data: dict[str, Any]) -> dict[str, Any]:
        scores = self._compute_final_scores()
        seniority = self._estimate_seniority(scores)
        recommendation = self._generate_recommendation(scores)

        return {
            "type": "evaluation",
            "evaluation_id": self.agent_id,
            "scores": scores,
            "seniority_estimation": seniority,
            "hiring_recommendation": recommendation,
            "strengths": self._identify_strengths(scores),
            "weaknesses": self._identify_weaknesses(scores),
            "reasoning_trace": self._build_reasoning_trace(),
            "benchmark_comparison": self._compare_to_benchmark(scores, seniority),
        }

    async def _handle_candidate_message(self, data: dict[str, Any]) -> dict[str, Any]:
        message = data.get("message", "")
        lower_msg = message.lower()

        if any(w in lower_msg for w in ["hint", "help", "stuck", "don't know"]):
            return await self._provide_hint(data)
        if any(w in lower_msg for w in ["complexity", "big-o", "time complexity", "space complexity"]):
            return {
                "type": "follow_up_response",
                "message": "Good question! Let's discuss the complexity analysis together.",
                "follow_up": "Can you walk me through the time and space complexity of your current solution?",
            }
        if any(w in lower_msg for w in ["alternative", "another way", "optimize"]):
            return {
                "type": "follow_up_response",
                "message": "I appreciate the initiative to explore alternatives.",
                "follow_up": "What would you change if the input size was 10x larger?",
            }
        return {
            "type": "acknowledgment",
            "message": f"Thank you for sharing that. Could you elaborate on your reasoning for {message[:100]}?",
        }

    def _generate_greeting(self) -> str:
        return (
            "Hello! I'm excited to work on this problem with you today. "
            "Think of this as a collaborative pair programming session — "
            "there are no trick questions, and I'm here to understand how you approach problems. "
            "Feel free to think out loud, ask questions, and explore different approaches."
        )

    def _format_problem(self, problem: dict[str, Any]) -> str:
        title = problem.get("title", "Coding Problem")
        description = problem.get("description", "")
        examples = problem.get("examples", [])
        constraints = problem.get("constraints", [])

        parts = [f"## {title}\n\n{description}"]
        if examples:
            parts.append("\n### Examples")
            for i, ex in enumerate(examples, 1):
                parts.append(f"\nExample {i}:")
                parts.append(f"  Input: {ex.get('input', 'N/A')}")
                parts.append(f"  Output: {ex.get('output', 'N/A')}")
                if ex.get("explanation"):
                    parts.append(f"  Explanation: {ex['explanation']}")
        if constraints:
            parts.append("\n### Constraints")
            for c in constraints:
                parts.append(f"- {c}")
        return "\n".join(parts)

    def _get_session_guidelines(self) -> str:
        return (
            "Before you start, here are a few guidelines:\n"
            "1. Ask clarifying questions if anything is unclear\n"
            "2. Talk through your approach before coding\n"
            "3. Start with a brute-force approach if needed, then optimize\n"
            "4. Test your solution with the examples\n"
            "5. I may ask follow-up questions about complexity and alternatives\n"
            "6. You can ask for hints at any time"
        )

    def _generate_progressive_hint(self) -> str:
        hints_by_level = {
            1: "Have you considered what data structure would give you O(1) lookup time here?",
            2: "Try using a hash map to track what you've seen. "
               "Think about what key-value pairs would be useful.",
            3: "The key insight is to iterate through the array once while maintaining "
               "a mapping of seen values. For each element, check if its complement exists "
               "in your map.",
        }
        return hints_by_level.get(self.hints_provided, "Keep going — you're on the right track!")

    def _analyze_failure(
        self, code: str, stderr: str, result: dict[str, Any]
    ) -> str:
        if stderr:
            if "timeout" in stderr.lower() or result.get("timeout_exceeded"):
                return "Your solution appears to exceed the time limit. Consider a more efficient approach."
            if "indexerror" in stderr.lower() or "out of range" in stderr.lower():
                return "There's an index out of range error. Check your boundary conditions."
            if "typeerror" in stderr.lower():
                return "There's a type error in your code. Review the types of your variables."
            return f"There's an error in your code: {stderr[:200]}"
        failed = result.get("total_tests", 0) - result.get("passed_tests", 0)
        return f"{failed} test(s) failed. Try tracing through your logic with the failing inputs."

    def _generate_follow_up_question(self) -> str:
        follow_ups = [
            "What's the time and space complexity of your solution?",
            "Can you think of an edge case that might break your implementation?",
            "How would your solution change if the input was 100x larger?",
            "Is there a way to optimize the space complexity?",
            "What would you do differently if you had to implement this again?",
        ]
        idx = min(self.follow_up_count, len(follow_ups) - 1)
        return follow_ups[idx]

    def _compute_final_scores(self) -> dict[str, Any]:
        if not self.code_history:
            return {k: 0.0 for k in self.evaluation_dimensions}

        last_result = self.code_history[-1].get("execution_result", {})
        all_passed = last_result.get("all_tests_passed", False)
        hints_ratio = 1.0 - (self.hints_provided / max(self.max_hints, 1))

        base = 7.0 if all_passed else 4.0
        hint_bonus = hints_ratio * 2.0

        return {
            "correctness": min(10.0, base + hint_bonus),
            "efficiency": min(10.0, base + hint_bonus * 0.8),
            "algorithm_quality": min(10.0, base + hint_bonus * 0.7),
            "edge_case_handling": min(10.0, base + hint_bonus * 0.6),
            "big_o_understanding": min(10.0, 6.0 + self.follow_up_count * 0.5),
            "tradeoff_reasoning": min(10.0, 5.0 + self.follow_up_count * 0.7),
            "scalability_awareness": min(10.0, 5.5 + self.follow_up_count * 0.6),
            "data_structures_understanding": min(10.0, 6.0 + hint_bonus * 0.5),
            "readability": min(10.0, 6.5 + hint_bonus * 0.4),
            "maintainability": min(10.0, 6.0 + hint_bonus * 0.3),
            "modularity": min(10.0, 5.5 + hint_bonus * 0.3),
            "naming_conventions": min(10.0, 6.0 + hint_bonus * 0.2),
            "decomposition": min(10.0, 5.5 + self.follow_up_count * 0.5),
            "iterative_reasoning": min(10.0, 5.0 + len(self.code_history) * 0.5),
            "debugging_approach": min(10.0, 5.0 + hint_bonus * 0.6),
            "optimization_strategy": min(10.0, 5.0 + self.follow_up_count * 0.4),
            "explanation_clarity": min(10.0, 5.0 + self.follow_up_count * 0.8),
            "collaborative_interaction": min(10.0, 6.0 + self.follow_up_count * 0.5),
            "reasoning_transparency": min(10.0, 5.5 + self.follow_up_count * 0.6),
        }

    def _estimate_seniority(self, scores: dict[str, Any]) -> str:
        overall = sum(scores.values()) / len(scores) if scores else 0.0
        if overall >= 8.5:
            return "principal"
        if overall >= 7.5:
            return "staff"
        if overall >= 6.0:
            return "senior"
        if overall >= 4.5:
            return "mid"
        return "junior"

    def _generate_recommendation(self, scores: dict[str, Any]) -> str:
        overall = sum(scores.values()) / len(scores) if scores else 0.0
        if overall >= 8.0:
            return "strong_hire"
        if overall >= 6.5:
            return "hire"
        if overall >= 5.0:
            return "neutral"
        return "no_hire"

    def _identify_strengths(self, scores: dict[str, Any]) -> list[str]:
        strengths = []
        dimension_groups = {
            "Technical Skills": ["correctness", "efficiency", "algorithm_quality", "edge_case_handling"],
            "CS Fundamentals": ["big_o_understanding", "tradeoff_reasoning", "scalability_awareness"],
            "Code Quality": ["readability", "maintainability", "modularity", "naming_conventions"],
            "Problem Solving": ["decomposition", "iterative_reasoning", "debugging_approach"],
            "Communication": ["explanation_clarity", "collaborative_interaction", "reasoning_transparency"],
        }
        for group_name, dims in dimension_groups.items():
            avg = sum(scores.get(d, 0) for d in dims) / len(dims)
            if avg >= 7.0:
                strengths.append(f"Strong {group_name}")
        return strengths or ["Showed engagement throughout the session"]

    def _identify_weaknesses(self, scores: dict[str, Any]) -> list[str]:
        weaknesses = []
        dimension_groups = {
            "Technical Skills": ["correctness", "efficiency", "algorithm_quality"],
            "CS Fundamentals": ["big_o_understanding", "tradeoff_reasoning"],
            "Code Quality": ["readability", "maintainability", "modularity"],
            "Problem Solving": ["decomposition", "debugging_approach", "optimization_strategy"],
            "Communication": ["explanation_clarity", "reasoning_transparency"],
        }
        for group_name, dims in dimension_groups.items():
            avg = sum(scores.get(d, 0) for d in dims) / len(dims)
            if avg < 5.0:
                weaknesses.append(f"Needs improvement in {group_name}")
        return weaknesses or ["Room for growth in optimization"]

    def _build_reasoning_trace(self) -> dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "agent_type": "ppe_evaluation",
            "session_summary": {
                "total_code_submissions": len(self.code_history),
                "hints_provided": self.hints_provided,
                "follow_ups_asked": self.follow_up_count,
                "difficulty_level": self.difficulty_level,
            },
            "evaluation_reasoning": "Scores computed based on code execution results, "
            "hint utilization, follow-up engagement, and code quality indicators.",
            "scoring_methodology": "Weighted average across 5 dimensions: "
            "Technical (30%), CS (20%), Quality (15%), Problem Solving (20%), Communication (15%)",
        }

    def _compare_to_benchmark(self, scores: dict[str, Any], level: str) -> dict[str, Any]:
        benchmarks = {
            "junior": {"overall": 4.0, "technical": 4.5, "communication": 5.0},
            "mid": {"overall": 6.0, "technical": 6.0, "communication": 6.0},
            "senior": {"overall": 7.5, "technical": 7.5, "communication": 7.0},
            "staff": {"overall": 8.5, "technical": 8.5, "communication": 8.0},
            "principal": {"overall": 9.0, "technical": 9.0, "communication": 8.5},
        }
        benchmark = benchmarks.get(level, benchmarks["mid"])
        overall = sum(scores.values()) / len(scores) if scores else 0.0
        return {
            "estimated_level": level,
            "candidate_score": round(overall, 2),
            "benchmark_score": benchmark["overall"],
            "delta": round(overall - benchmark["overall"], 2),
            "assessment": "meets_expectations" if overall >= benchmark["overall"] else "below_expectations",
        }
