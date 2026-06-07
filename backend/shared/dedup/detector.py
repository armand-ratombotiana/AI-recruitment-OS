"""Candidate duplicate-detection utilities.

Public surface:

* :class:`DuplicateMatch` — a single pairwise suspicion.
* :class:`DuplicateGroup` — a cluster of candidates believed to be the same
  person, with a representative confidence score and reason.
* :func:`find_duplicates` — scan a tenant's candidates and return groups.
* :func:`find_duplicates_for_new` — score one new candidate against an
  existing pool and return the ranked matches.

The detector is intentionally rule-based so it is fully deterministic, easy
to audit, and runs without any external service.  Three signal families are
evaluated for every pair (lowest to highest confidence):

* **name + location** — 0.55 (``reason="name_location"``)
* **name + phone** — 0.75 (``reason="name_phone"``)
* **exact email** — 0.95 (``reason="exact_email"``)

When several signals fire for the same pair, the highest-confidence one
wins.  :func:`find_duplicates` then clusters connected candidates via
union-find so a triple of duplicates shows up as a single group containing
all three members rather than three overlapping pairs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence


__all__ = [
    "DuplicateMatch",
    "DuplicateGroup",
    "find_duplicates",
    "find_duplicates_for_new",
    "normalize_email",
    "normalize_phone",
    "normalize_name",
    "normalize_location",
    "score_pair",
]


# Confidence tiers.  Picked so the default threshold of 0.7 keeps the
# ``name + location`` rule out of the default report (it is too noisy
# to act on without manual review) while surfacing anything stronger.
CONFIDENCE_EXACT_EMAIL = 0.95
CONFIDENCE_NAME_PHONE = 0.75
CONFIDENCE_NAME_LOCATION = 0.55

REASON_EXACT_EMAIL = "exact_email"
REASON_NAME_PHONE = "name_phone"
REASON_NAME_LOCATION = "name_location"


# Honorifics and salutations we strip from a name before comparing.  Kept
# short on purpose — the goal is to ignore Mr./Ms. prefixes, not to do
# locale-aware name parsing.
_NAME_HONORIFICS = frozenset(
    {
        "dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "miss",
        "mx", "mx.", "prof", "prof.", "sir", "madam", "madame",
    }
)


# ── Normalisation helpers ───────────────────────────────────────────────────


def normalize_email(value: str | None) -> str:
    """Lowercase and strip an email address.  Returns ``""`` on falsy input."""
    if not value:
        return ""
    return str(value).strip().lower()


def normalize_phone(value: str | None) -> str:
    """Reduce a phone number to its digit-only canonical form.

    Keeps a leading ``+`` (so country codes are preserved) and strips every
    other non-digit character (spaces, dashes, parentheses, dots, etc.).
    Returns ``""`` on falsy input.
    """
    if not value:
        return ""
    raw = str(value).strip()
    if not raw:
        return ""
    has_plus = raw.startswith("+")
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        return ""
    return f"+{digits}" if has_plus else digits


def normalize_name(value: str | None) -> str:
    """Lowercase, strip honorifics, and collapse whitespace.

    Two names that only differ by a leading "Dr." or by run-together spaces
    should compare equal.
    """
    if not value:
        return ""
    cleaned = str(value).strip().lower()
    if not cleaned:
        return ""
    tokens = cleaned.split()
    filtered = [
        t
        for t in tokens
        if t not in _NAME_HONORIFICS and t.rstrip(".") not in _NAME_HONORIFICS
    ]
    return " ".join(filtered)


def normalize_location(value: str | None) -> str:
    """Lowercase and collapse whitespace.  Strips punctuation noise."""
    if not value:
        return ""
    cleaned = str(value).strip().lower()
    if not cleaned:
        return ""
    return " ".join(cleaned.split())


# ── Public data types ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class DuplicateMatch:
    """A single pairwise suspicion between two candidates."""

    candidate_a: Any
    candidate_b: Any
    confidence: float
    reason: str

    def to_pair(self) -> tuple[Any, Any, float, str]:
        """Return the canonical ``(a, b, confidence, reason)`` tuple form."""
        return (self.candidate_a, self.candidate_b, self.confidence, self.reason)


@dataclass
class DuplicateGroup:
    """A cluster of candidates believed to refer to the same person.

    ``members`` always contains at least two candidates.  ``confidence`` and
    ``reason`` are taken from the strongest individual pairwise match inside
    the cluster.
    """

    members: list[Any] = field(default_factory=list)
    matches: list[DuplicateMatch] = field(default_factory=list)
    confidence: float = 0.0
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Serialise to a JSON-friendly dict (candidates are kept as ids so
        the caller can decide how to render them)."""
        return {
            "member_ids": [_candidate_id(c) for c in self.members],
            "confidence": round(self.confidence, 4),
            "reason": self.reason,
            "pair_count": len(self.matches),
        }


# ── Core scoring ────────────────────────────────────────────────────────────


def _attr(candidate: Any, *names: str) -> Any:
    """Read the first defined attribute / key from ``candidate``.

    Accepts either a duck-typed object (e.g. ``Candidate`` SQLModel) or a
    dict — both are valid inputs in the wild depending on the caller.
    """
    for name in names:
        if isinstance(candidate, dict):
            if name in candidate and candidate[name] is not None:
                return candidate[name]
        else:
            value = getattr(candidate, name, None)
            if value is not None:
                return value
    return None


def _candidate_id(candidate: Any) -> str | None:
    raw = _attr(candidate, "id")
    if raw is None:
        return None
    return str(raw)


def score_pair(a: Any, b: Any) -> DuplicateMatch | None:
    """Score a single pair of candidates.

    Returns ``None`` if no signal fires (or both candidates resolve to the
    same record).  When multiple signals fire, the highest-confidence one
    wins.
    """
    if a is b:
        return None
    aid = _candidate_id(a)
    bid = _candidate_id(b)
    if aid is not None and bid is not None and aid == bid:
        return None

    # 1) Exact email — strongest signal.
    email_a = normalize_email(_attr(a, "email"))
    email_b = normalize_email(_attr(b, "email"))
    if email_a and email_b and email_a == email_b:
        return DuplicateMatch(a, b, CONFIDENCE_EXACT_EMAIL, REASON_EXACT_EMAIL)

    # From here on we need matching names to consider the pair at all.
    name_a = normalize_name(_attr(a, "full_name", "name"))
    name_b = normalize_name(_attr(b, "full_name", "name"))
    if not name_a or not name_b or name_a != name_b:
        return None

    # 2) Name + phone — medium confidence.
    phone_a = normalize_phone(_attr(a, "phone"))
    phone_b = normalize_phone(_attr(b, "phone"))
    if phone_a and phone_b and phone_a == phone_b:
        return DuplicateMatch(a, b, CONFIDENCE_NAME_PHONE, REASON_NAME_PHONE)

    # 3) Name + location — low confidence, frequently a coincidence.
    loc_a = normalize_location(_attr(a, "location"))
    loc_b = normalize_location(_attr(b, "location"))
    if loc_a and loc_b and loc_a == loc_b:
        return DuplicateMatch(
            a, b, CONFIDENCE_NAME_LOCATION, REASON_NAME_LOCATION
        )

    return None


def _matches_above(
    matches: Iterable[DuplicateMatch], threshold: float
) -> list[DuplicateMatch]:
    return [m for m in matches if m.confidence >= threshold]


# ── Union-Find for clustering ───────────────────────────────────────────────


class _UnionFind:
    def __init__(self) -> None:
        self._parent: dict[int, int] = {}

    def add(self, x: int) -> None:
        self._parent.setdefault(x, x)

    def find(self, x: int) -> int:
        root = x
        while self._parent[root] != root:
            root = self._parent[root]
        while self._parent[x] != root:
            self._parent[x], x = root, self._parent[x]
        return root

    def union(self, x: int, y: int) -> None:
        rx, ry = self.find(x), self.find(y)
        if rx != ry:
            self._parent[ry] = rx


def _cluster(
    candidates: Sequence[Any], matches: Sequence[DuplicateMatch]
) -> list[DuplicateGroup]:
    """Cluster candidates connected by ``matches`` into groups.

    Each input candidate is assigned an index.  Every match unions its two
    indices, so a triple (A,B,C) with matches A↔B and B↔C collapses into
    one group containing all three.  Candidates that never participate in
    a match are silently dropped.
    """
    index_by_id: dict[str, int] = {}
    for c in candidates:
        cid = _candidate_id(c)
        if cid is None:
            continue
        if cid not in index_by_id:
            index_by_id[cid] = len(index_by_id)

    uf = _UnionFind()
    for idx in index_by_id.values():
        uf.add(idx)

    relevant_matches: list[DuplicateMatch] = []
    for m in matches:
        aid = _candidate_id(m.candidate_a)
        bid = _candidate_id(m.candidate_b)
        if aid is None or bid is None:
            continue
        if aid not in index_by_id or bid not in index_by_id:
            continue
        uf.union(index_by_id[aid], index_by_id[bid])
        relevant_matches.append(m)

    if not relevant_matches:
        return []

    candidates_by_idx = {idx: cid for cid, idx in index_by_id.items()}
    cand_lookup = {
        _candidate_id(c): c
        for c in candidates
        if _candidate_id(c) is not None
    }

    groups: dict[int, DuplicateGroup] = {}
    for m in relevant_matches:
        aid = _candidate_id(m.candidate_a)
        bid = _candidate_id(m.candidate_b)
        root = uf.find(index_by_id[aid])
        group = groups.setdefault(
            root,
            DuplicateGroup(members=[], matches=[], confidence=0.0, reason=""),
        )
        group.matches.append(m)
        if m.confidence > group.confidence:
            group.confidence = m.confidence
            group.reason = m.reason

    for root, group in groups.items():
        member_idxs = sorted(
            i for i in index_by_id.values() if uf.find(i) == root
        )
        group.members = [cand_lookup[candidates_by_idx[i]] for i in member_idxs]

    out = list(groups.values())
    out.sort(
        key=lambda g: (
            -g.confidence,
            _candidate_id(g.members[0]) or "",
        )
    )
    return out


# ── Public entry points ─────────────────────────────────────────────────────


def find_duplicates(
    candidates: Sequence[Any],
    threshold: float = 0.7,
) -> list[DuplicateGroup]:
    """Return every duplicate group found in ``candidates`` above ``threshold``.

    The pairwise comparison is O(n²); for the typical tenant size (low
    thousands) this is well under a second on commodity hardware.  If the
    pool grows past that, the same algorithm is trivially indexable by
    (email, normalised-name+phone, normalised-name+location).
    """
    if not candidates or len(candidates) < 2:
        return []

    raw_matches: list[DuplicateMatch] = []
    n = len(candidates)
    for i in range(n):
        a = candidates[i]
        for j in range(i + 1, n):
            b = candidates[j]
            m = score_pair(a, b)
            if m is not None:
                raw_matches.append(m)

    filtered = _matches_above(raw_matches, threshold)
    return _cluster(candidates, filtered)


def find_duplicates_for_new(
    candidate: Any,
    existing: Sequence[Any],
    threshold: float = 0.7,
) -> list[DuplicateMatch]:
    """Compare one new candidate against an existing pool.

    Returns a list of :class:`DuplicateMatch` sorted from highest to lowest
    confidence, with weak matches pre-filtered out by ``threshold``.  Each
    match has ``candidate_a == candidate`` so the caller can render the
    relationship in a UI without re-ordering.
    """
    if not existing:
        return []

    matches: list[DuplicateMatch] = []
    cid = _candidate_id(candidate)
    for other in existing:
        if cid is not None and _candidate_id(other) == cid:
            continue
        m = score_pair(candidate, other)
        if m is None:
            continue
        if m.confidence < threshold:
            continue
        # Always put the new candidate on side ``a`` for predictable ordering.
        if m.candidate_a is not candidate:
            m = DuplicateMatch(candidate, m.candidate_b, m.confidence, m.reason)
        matches.append(m)

    matches.sort(
        key=lambda m: (-m.confidence, _candidate_id(m.candidate_b) or "")
    )
    return matches
