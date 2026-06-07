"""AI-powered question generation for assessments.

The generator exposes a single public function — :func:`generate_questions` —
that produces a list of question dictionaries for a given topic, difficulty
and type.  It first tries the real LLM router and, on any failure
(network, parsing, missing API keys, etc.), falls back to a deterministic
bank of common questions so the assessment service stays functional
without external dependencies.

Public surface:

* :func:`generate_questions` — async; returns ``list[dict]`` matching the
  shape of :class:`shared.core.models.assessment.Question` (sans
  ``id`` / ``assessment_id`` / ``created_at``, which the service fills in).
* :func:`grade_answer` — auto-grade a single question / answer pair.  MCQ
  answers are compared literally; free-form and coding answers are sent
  to the LLM and graded on a 0..points scale.
* :func:`fallback_questions` — the deterministic bank, exposed for tests.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any, Iterable, Optional

logger = logging.getLogger("ai.assessments.generator")


# ── Constants ─────────────────────────────────────────────────────────────────


VALID_TYPES: tuple[str, ...] = ("mcq", "short_answer", "text", "coding", "mixed")
VALID_DIFFICULTIES: tuple[str, ...] = ("easy", "medium", "hard")

_DEFAULT_TYPE = "mcq"
_DEFAULT_DIFFICULTY = "medium"
_DEFAULT_COUNT = 5
_MAX_COUNT = 50


# ── Public API ────────────────────────────────────────────────────────────────


async def generate_questions(
    topic: str,
    count: int = _DEFAULT_COUNT,
    difficulty: str = _DEFAULT_DIFFICULTY,
    type: str = _DEFAULT_TYPE,
    *,
    tenant_id: Optional[str] = None,
) -> tuple[list[dict[str, Any]], str]:
    """Generate ``count`` questions for ``topic``.

    Returns a ``(questions, source)`` tuple where ``source`` is either
    ``"llm"`` or ``"fallback"``.  The list always has length
    ``min(count, available)`` — if the LLM is healthy we *always* trust
    the count it returns, but cap at the requested amount.
    """
    if not topic or not topic.strip():
        topic = "General Knowledge"
    topic = topic.strip()[:255]
    count = max(1, min(int(count or _DEFAULT_COUNT), _MAX_COUNT))
    difficulty = (difficulty or _DEFAULT_DIFFICULTY).strip().lower()
    if difficulty not in VALID_DIFFICULTIES:
        difficulty = _DEFAULT_DIFFICULTY
    qtype = (type or _DEFAULT_TYPE).strip().lower()
    if qtype not in VALID_TYPES:
        qtype = _DEFAULT_TYPE

    try:
        questions = await _generate_via_llm(
            topic=topic,
            count=count,
            difficulty=difficulty,
            qtype=qtype,
            tenant_id=tenant_id,
        )
        if questions:
            return _normalise(questions, default_type=qtype)[:count], "llm"
    except Exception as exc:  # pragma: no cover - depends on LLM availability
        logger.warning(
            "assessments.llm_generation_failed topic=%s err=%s", topic, exc
        )

    bank = fallback_questions(topic=topic, count=count, difficulty=difficulty, qtype=qtype)
    return bank, "fallback"


async def grade_answer(
    *,
    question: dict[str, Any],
    response: str,
    points: float,
    tenant_id: Optional[str] = None,
) -> tuple[float, str]:
    """Auto-grade a single question / response pair.

    Returns a ``(score, feedback)`` tuple.  ``score`` is bounded to
    ``0..points`` and ``feedback`` is a short human-readable string the
    UI can show next to the answer.

    The grading strategy depends on the question type:

    * ``mcq`` — exact (case-insensitive) match against the reference answer.
    * ``short_answer`` — keyword overlap plus an optional LLM judgement.
    * ``text`` / ``coding`` — delegated to the LLM with the reference
      answer as a hint.  When the LLM is unavailable, the grader uses
      lexical overlap as a rough proxy.
    """
    qtype = str(question.get("type") or _DEFAULT_TYPE).lower()
    response_text = (response or "").strip()
    if not response_text:
        return 0.0, "No answer provided."

    if qtype == "mcq":
        return _grade_mcq(question, response_text, points)
    if qtype == "short_answer":
        return await _grade_short_answer(question, response_text, points, tenant_id=tenant_id)
    if qtype in ("text", "coding"):
        return await _grade_freeform(question, response_text, points, tenant_id=tenant_id)
    # Unknown type → neutral half-credit so we never crash an assessment.
    return points * 0.5, f"Auto-graded as type='{qtype}'."


def fallback_questions(
    *,
    topic: str,
    count: int,
    difficulty: str,
    qtype: str,
) -> list[dict[str, Any]]:
    """Return a deterministic list of question dicts.

    Used both as the explicit fallback path and as the data source for
    offline tests.  The bank covers the most common knowledge / skill
    areas and is parameterised by ``topic`` so each call looks distinct.
    """
    if qtype == "mixed":
        return _mixed_bank(topic=topic, count=count, difficulty=difficulty)
    if qtype == "coding":
        return _coding_bank(topic=topic, count=count, difficulty=difficulty)
    if qtype == "text":
        return _text_bank(topic=topic, count=count, difficulty=difficulty)
    if qtype == "short_answer":
        return _short_answer_bank(topic=topic, count=count, difficulty=difficulty)
    return _mcq_bank(topic=topic, count=count, difficulty=difficulty)


# ── LLM-backed generation ─────────────────────────────────────────────────────


_SYSTEM_PROMPT = """You are an expert technical interviewer generating
assessment questions for hiring.  You MUST respond with a single JSON object —
no prose, no markdown fences, no commentary.

Output schema (return exactly this shape):
{{
  "questions": [
    {{
      "type": "mcq" | "short_answer" | "text" | "coding",
      "prompt": "string — the question as it should appear to the candidate",
      "options": ["option A", "option B", "option C", "option D"],
      "correct_answer": "string — the correct option text for mcq, the canonical short answer otherwise",
      "points": number,
      "explanation": "short human-readable explanation of the correct answer"
    }},
    ...
  ]
}}

Rules:
- Generate exactly {count} questions.
- Difficulty: {difficulty}.
- Primary type: {qtype} (use 'mcq' for mixed/unknown).
- For mcq, always populate 4 options and the matching correct_answer.
- For short_answer / text / coding, leave options as [] and put a reference solution in correct_answer.
- Each question must be self-contained, answerable, and clearly related to '{topic}'.
- Avoid trick questions, ambiguity, or questions that depend on external context.
- Return ONLY the JSON object.
"""


def _user_prompt(*, topic: str, count: int, difficulty: str, qtype: str) -> str:
    return (
        f"Topic: {topic}\n"
        f"Difficulty: {difficulty}\n"
        f"Primary type: {qtype}\n"
        f"Number of questions: {count}\n"
    )


async def _generate_via_llm(
    *,
    topic: str,
    count: int,
    difficulty: str,
    qtype: str,
    tenant_id: Optional[str],
) -> list[dict[str, Any]]:
    from shared.ai.llm_router import get_llm_router

    router = get_llm_router()
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT.format(
            count=count, difficulty=difficulty, qtype=qtype, topic=topic,
        )},
        {"role": "user", "content": _user_prompt(
            topic=topic, count=count, difficulty=difficulty, qtype=qtype,
        )},
    ]
    response = await router.complete(
        messages,
        temperature=0.7,
        max_tokens=min(4000, 256 + count * 400),
        response_format={"type": "json_object"},
        tenant_id=tenant_id,
    )
    return _parse_question_payload(response.content, expected=count)


def _parse_question_payload(raw: str, *, expected: int) -> list[dict[str, Any]]:
    """Tolerantly parse the LLM's JSON envelope.

    Some models occasionally wrap the JSON in prose or a code fence.
    We try to extract the first balanced JSON object and then look for
    a ``questions`` key — falling back to a top-level list if needed.
    """
    text = (raw or "").strip()
    if not text:
        return []

    candidate = _extract_first_json_object(text)
    if candidate is None:
        return []

    try:
        data = json.loads(candidate)
    except (ValueError, TypeError):
        return []

    if isinstance(data, dict):
        items = data.get("questions") or data.get("items") or data.get("data") or []
    elif isinstance(data, list):
        items = data
    else:
        return []

    cleaned: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        prompt = str(item.get("prompt") or item.get("question") or "").strip()
        if not prompt:
            continue
        cleaned.append({
            "type": str(item.get("type") or _DEFAULT_TYPE).lower(),
            "prompt": prompt,
            "options": list(item.get("options") or []),
            "correct_answer": _coerce_str(item.get("correct_answer")),
            "points": float(item.get("points") or 1.0),
            "explanation": _coerce_str(item.get("explanation")),
        })
        if len(cleaned) >= expected:
            break
    return cleaned


def _extract_first_json_object(text: str) -> Optional[str]:
    """Return the substring of ``text`` containing the first balanced ``{…}``.

    Falls back to the whole string when no opening brace is found, so
    non-JSON outputs raise :class:`ValueError` on the downstream
    ``json.loads`` and get treated as a parse failure.
    """
    if not text:
        return None
    if text.startswith("{") and text.rstrip().endswith("}"):
        return text
    # Strip code fences
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    if start < 0:
        return text
    depth = 0
    in_string = False
    escape = False
    for idx in range(start, len(text)):
        ch = text[idx]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:idx + 1]
    return None


def _coerce_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)


# ── Auto-grading helpers ──────────────────────────────────────────────────────


def _grade_mcq(question: dict[str, Any], response: str, points: float) -> tuple[float, str]:
    correct = (question.get("correct_answer") or "").strip()
    if not correct:
        return 0.0, "Question is missing a reference answer."
    if response.strip().lower() == correct.lower():
        return float(points), "Correct."
    # Allow answering by 1-based index ("1", "2", "3", "4") as a convenience.
    options = question.get("options") or []
    if response.strip().isdigit() and options:
        idx = int(response.strip()) - 1
        if 0 <= idx < len(options) and str(options[idx]).strip().lower() == correct.lower():
            return float(points), "Correct."
    return 0.0, "Incorrect."


async def _grade_short_answer(
    question: dict[str, Any],
    response: str,
    points: float,
    *,
    tenant_id: Optional[str],
) -> tuple[float, str]:
    reference = (question.get("correct_answer") or "").strip()
    if not reference:
        return _lexical_score(response, points, fallback=0.5), "Reference answer missing — graded heuristically."

    keywords = _extract_keywords(reference)
    overlap = _keyword_overlap(response, keywords)
    if overlap >= 0.6:
        return float(points), "Matches the expected keywords."

    try:
        return await _llm_grade(question, response, points, tenant_id=tenant_id)
    except Exception as exc:  # pragma: no cover - depends on LLM availability
        logger.debug("short_answer.llm_grade_failed err=%s", exc)
        return points * overlap, "Graded by keyword overlap."


async def _grade_freeform(
    question: dict[str, Any],
    response: str,
    points: float,
    *,
    tenant_id: Optional[str],
) -> tuple[float, str]:
    """Grade a text or coding answer via the LLM with a lexical fallback."""
    try:
        return await _llm_grade(question, response, points, tenant_id=tenant_id)
    except Exception as exc:  # pragma: no cover - depends on LLM availability
        logger.debug("freeform.llm_grade_failed err=%s", exc)
        reference = (question.get("correct_answer") or "").strip()
        if not reference:
            return points * 0.5, "Auto-graded without a reference solution."
        score = _lexical_score(response, points)
        return score, "Auto-graded by keyword overlap (LLM unavailable)."


async def _llm_grade(
    question: dict[str, Any],
    response: str,
    points: float,
    *,
    tenant_id: Optional[str],
) -> tuple[float, str]:
    from shared.ai.llm_router import get_llm_router

    system = (
        "You are grading a candidate's answer to an assessment question. "
        "Return ONLY a JSON object with two fields: 'score' (0.0 to 1.0) "
        "and 'feedback' (one short sentence).  Be fair: a partially correct "
        "answer should get partial credit.  Treat the 'reference' as a "
        "guideline, not the only acceptable answer."
    )
    user = json.dumps(
        {
            "question": question.get("prompt"),
            "reference": question.get("correct_answer"),
            "response": response,
            "max_points": points,
        },
        ensure_ascii=False,
    )
    router = get_llm_router()
    completion = await router.complete(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.2,
        max_tokens=512,
        response_format={"type": "json_object"},
        tenant_id=tenant_id,
    )
    payload = _parse_grader_payload(completion.content)
    raw_score = float(payload.get("score", 0.0) or 0.0)
    score = max(0.0, min(1.0, raw_score)) * float(points)
    feedback = (payload.get("feedback") or "Auto-graded.").strip() or "Auto-graded."
    return score, feedback[:500]


def _parse_grader_payload(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        return {"score": 0.0, "feedback": "No LLM response."}
    candidate = _extract_first_json_object(text) or text
    try:
        data = json.loads(candidate)
    except (ValueError, TypeError):
        # Treat the whole response as feedback and assign zero so we
        # never raise mid-grade.
        return {"score": 0.0, "feedback": text[:200]}
    if not isinstance(data, dict):
        return {"score": 0.0, "feedback": "Invalid grader response."}
    return data


# ── Lexical helpers ───────────────────────────────────────────────────────────


_WORD_RE = re.compile(r"\b\w+\b", re.UNICODE)
_STOPWORDS: frozenset[str] = frozenset(
    {
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
        "have", "in", "is", "it", "its", "of", "on", "or", "that", "the",
        "this", "to", "was", "were", "will", "with", "you", "your", "i",
        "we", "they", "their", "he", "she", "his", "her", "them", "us", "our",
    }
)


def _extract_keywords(text: str) -> set[str]:
    return {
        w.lower()
        for w in _WORD_RE.findall(text or "")
        if w.lower() not in _STOPWORDS and len(w) > 2
    }


def _keyword_overlap(response: str, keywords: Iterable[str]) -> float:
    keywords = set(keywords)
    if not keywords:
        return 0.0
    response_words = {
        w.lower() for w in _WORD_RE.findall(response or "") if w.lower() not in _STOPWORDS
    }
    if not response_words:
        return 0.0
    return len(keywords & response_words) / max(len(keywords), 1)


def _lexical_score(response: str, points: float, *, fallback: float = 0.0) -> float:
    reference_words = len(_WORD_RE.findall(response or ""))
    if reference_words == 0:
        return points * fallback
    return points * min(1.0, reference_words / 50.0)


# ── Normalisation ─────────────────────────────────────────────────────────────


def _normalise(
    questions: list[dict[str, Any]],
    *,
    default_type: str,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for idx, q in enumerate(questions):
        qtype = str(q.get("type") or default_type).lower()
        if qtype not in ("mcq", "short_answer", "text", "coding"):
            qtype = default_type if default_type in ("mcq", "short_answer", "text", "coding") else _DEFAULT_TYPE
        options = q.get("options") or []
        if qtype != "mcq":
            options = []
        out.append({
            "id": q.get("id") or str(uuid.uuid4()),
            "type": qtype,
            "prompt": str(q.get("prompt") or "").strip(),
            "options": [str(o) for o in options] if options else [],
            "correct_answer": _coerce_str(q.get("correct_answer")),
            "points": float(q.get("points") or 1.0),
            "order": int(q.get("order", idx)),
            "explanation": _coerce_str(q.get("explanation")),
        })
    return out


# ── Question banks ────────────────────────────────────────────────────────────


def _mcq_bank(*, topic: str, count: int, difficulty: str) -> list[dict[str, Any]]:
    bank = _generic_mcq_bank(topic)
    diff = _difficulty_prefix(difficulty)
    return [dict(q, id=str(uuid.uuid4()), order=i) for i, q in enumerate(bank[:count])]


def _short_answer_bank(*, topic: str, count: int, difficulty: str) -> list[dict[str, Any]]:
    bank = _generic_short_answer_bank(topic, difficulty)
    return [dict(q, id=str(uuid.uuid4()), order=i) for i, q in enumerate(bank[:count])]


def _text_bank(*, topic: str, count: int, difficulty: str) -> list[dict[str, Any]]:
    bank = _generic_text_bank(topic, difficulty)
    return [dict(q, id=str(uuid.uuid4()), order=i) for i, q in enumerate(bank[:count])]


def _coding_bank(*, topic: str, count: int, difficulty: str) -> list[dict[str, Any]]:
    bank = _generic_coding_bank(topic, difficulty)
    return [dict(q, id=str(uuid.uuid4()), order=i) for i, q in enumerate(bank[:count])]


def _mixed_bank(*, topic: str, count: int, difficulty: str) -> list[dict[str, Any]]:
    """Round-robin MCQ + short answer + coding so the test is varied."""
    per = max(1, count // 3)
    out: list[dict[str, Any]] = []
    out.extend(_mcq_bank(topic=topic, count=per, difficulty=difficulty))
    out.extend(_short_answer_bank(topic=topic, count=per, difficulty=difficulty))
    out.extend(_coding_bank(topic=topic, count=count - len(out), difficulty=difficulty))
    return out[:count]


def _difficulty_prefix(difficulty: str) -> str:
    return {
        "easy": "At a basic level, ",
        "hard": "In depth, ",
    }.get(difficulty, "")


def _generic_mcq_bank(topic: str) -> list[dict[str, Any]]:
    return [
        {
            "type": "mcq",
            "prompt": f"Which of the following best describes a key concept in {topic}?",
            "options": [
                "An outdated technique rarely used today",
                "A foundational principle widely applied in practice",
                "A vendor-specific implementation detail",
                "An unrelated theoretical construct",
            ],
            "correct_answer": "A foundational principle widely applied in practice",
            "points": 1.0,
            "explanation": f"The fundamentals of {topic} are the most broadly applicable knowledge.",
        },
        {
            "type": "mcq",
            "prompt": f"Which tool is most commonly associated with {topic}?",
            "options": ["Hammer", "IDE", "Spreadsheet", "Word processor"],
            "correct_answer": "IDE",
            "points": 1.0,
            "explanation": "An IDE is the canonical tool for software-related topics.",
        },
        {
            "type": "mcq",
            "prompt": f"What is the first step when approaching a new {topic} problem?",
            "options": [
                "Write code immediately",
                "Understand the requirements and constraints",
                "Pick a random library",
                "Skip planning entirely",
            ],
            "correct_answer": "Understand the requirements and constraints",
            "points": 1.0,
            "explanation": "Requirement gathering is the foundation of any solution.",
        },
        {
            "type": "mcq",
            "prompt": f"Which of these is NOT a best practice in {topic}?",
            "options": [
                "Write tests for new code",
                "Ignore error handling",
                "Document non-obvious decisions",
                "Review code with peers",
            ],
            "correct_answer": "Ignore error handling",
            "points": 1.0,
            "explanation": "Robust error handling is universally considered a best practice.",
        },
        {
            "type": "mcq",
            "prompt": f"When debugging a {topic} issue, you should typically:",
            "options": [
                "Change many things at once and hope one works",
                "Reproduce the bug, isolate the cause, then fix it",
                "Restart the system without investigating",
                "Blame the framework",
            ],
            "correct_answer": "Reproduce the bug, isolate the cause, then fix it",
            "points": 1.0,
            "explanation": "A systematic debugging process beats guesswork.",
        },
        {
            "type": "mcq",
            "prompt": f"Which metric is most useful when evaluating work in {topic}?",
            "options": ["Lines of code written", "Outcome quality and correctness", "Time spent typing", "Number of files touched"],
            "correct_answer": "Outcome quality and correctness",
            "points": 1.0,
            "explanation": "Outcome quality is the universal north-star metric.",
        },
        {
            "type": "mcq",
            "prompt": f"In {topic}, a 'trade-off' usually refers to:",
            "options": [
                "A bug introduced during refactoring",
                "A conscious choice between competing concerns",
                "An unrelated side effect",
                "A type of test failure",
            ],
            "correct_answer": "A conscious choice between competing concerns",
            "points": 1.0,
            "explanation": "Trade-offs are the heart of engineering decision making.",
        },
    ]


def _generic_short_answer_bank(topic: str, difficulty: str) -> list[dict[str, Any]]:
    prefix = _difficulty_prefix(difficulty)
    return [
        {
            "type": "short_answer",
            "prompt": f"{prefix}briefly explain what {topic} is in one or two sentences.",
            "options": [],
            "correct_answer": f"{topic} is a field of practice focused on solving specific problems with established methods and tools.",
            "points": 2.0,
            "explanation": "The candidate should be able to define the field concisely.",
        },
        {
            "type": "short_answer",
            "prompt": f"{prefix}name two common tools used in {topic} and what they are used for.",
            "options": [],
            "correct_answer": "An editor/IDE for writing work and a runtime or compiler for executing it.",
            "points": 2.0,
            "explanation": "Tooling fluency is a baseline expectation.",
        },
        {
            "type": "short_answer",
            "prompt": f"{prefix}describe a real-world scenario where {topic} matters.",
            "options": [],
            "correct_answer": "Building reliable production systems where correctness and maintainability are critical.",
            "points": 2.0,
            "explanation": "Concrete examples demonstrate applied understanding.",
        },
        {
            "type": "short_answer",
            "prompt": f"{prefix}what is the most common mistake beginners make in {topic}?",
            "options": [],
            "correct_answer": "Skipping fundamentals and reaching for advanced tools too quickly.",
            "points": 2.0,
            "explanation": "Self-awareness about common pitfalls is a good signal.",
        },
    ]


def _generic_text_bank(topic: str, difficulty: str) -> list[dict[str, Any]]:
    prefix = _difficulty_prefix(difficulty)
    return [
        {
            "type": "text",
            "prompt": f"{prefix}write a short essay (3-5 sentences) describing the most important lesson you have learned about {topic}.",
            "options": [],
            "correct_answer": (
                "A strong response explains a specific lesson, why it matters, "
                "and how the candidate has applied it in practice."
            ),
            "points": 5.0,
            "explanation": "Reflective, experience-backed answers score highest.",
        },
        {
            "type": "text",
            "prompt": f"{prefix}describe a project where you used {topic}, focusing on the trade-offs you faced.",
            "options": [],
            "correct_answer": "A good answer names a project, the constraints, and 1-2 explicit trade-offs.",
            "points": 5.0,
            "explanation": "Trade-off articulation distinguishes senior candidates.",
        },
    ]


def _generic_coding_bank(topic: str, difficulty: str) -> list[dict[str, Any]]:
    suffix = "Write idiomatic, well-commented code." if difficulty != "easy" else "Write working code."
    return [
        {
            "type": "coding",
            "prompt": (
                f"Write a function in your preferred language that takes a list of integers "
                f"and returns the sum of the unique values.  {suffix}"
            ),
            "options": [],
            "correct_answer": "def sum_unique(values): return sum(set(values))",
            "points": 5.0,
            "explanation": "Uses a set to deduplicate and the built-in sum.",
        },
        {
            "type": "coding",
            "prompt": (
                f"Write a function that determines whether a string is a palindrome, "
                f"ignoring case and non-alphanumeric characters.  {suffix}"
            ),
            "options": [],
            "correct_answer": "def is_palindrome(s): cleaned = ''.join(c.lower() for c in s if c.isalnum()); return cleaned == cleaned[::-1]",
            "points": 5.0,
            "explanation": "Strips non-alphanumerics, lowercases, and compares with a reversed copy.",
        },
        {
            "type": "coding",
            "prompt": (
                f"Write a function that returns the n-th Fibonacci number using iteration.  {suffix}"
            ),
            "options": [],
            "correct_answer": "def fib(n): a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a",
            "points": 5.0,
            "explanation": "Iterative approach avoids recursion depth issues.",
        },
        {
            "type": "coding",
            "prompt": (
                f"Write a function that groups a list of strings by their length, returning a dict "
                f"of length -> list of strings.  {suffix}"
            ),
            "options": [],
            "correct_answer": "from collections import defaultdict\ndef group_by_length(items): out = defaultdict(list)\n    for s in items: out[len(s)].append(s)\n    return dict(out)",
            "points": 5.0,
            "explanation": "Uses defaultdict to keep the implementation concise.",
        },
    ]


__all__ = [
    "fallback_questions",
    "generate_questions",
    "grade_answer",
]
