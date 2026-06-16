from __future__ import annotations

import os
import sys

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import pytest
from shared.skills.taxonomy import (
    normalize_skill,
    normalize_skills,
    get_skill_category,
    are_skills_similar,
    calculate_skill_match
)


def test_normalize_skill_aliases():
    assert normalize_skill("React.js") == "react"
    assert normalize_skill("reactjs") == "react"
    assert normalize_skill("ReactJS") == "react"
    assert normalize_skill("postgres") == "postgresql"
    assert normalize_skill("k8s") == "kubernetes"


def test_normalize_skill_unknown():
    assert normalize_skill("unknown-skill") == "unknown-skill"


def test_normalize_skills_removes_duplicates():
    skills = ["react", "React.js", "reactjs", "vue"]
    normalized = normalize_skills(skills)
    assert normalized == ["react", "vue"]


def test_get_skill_category():
    assert get_skill_category("python") == "programming_languages"
    assert get_skill_category("react") == "frontend_frameworks"
    assert get_skill_category("docker") == "devops"
    assert get_skill_category("unknown") == "other"


def test_are_skills_similar():
    assert are_skills_similar("react", "React.js") == True
    assert are_skills_similar("postgres", "postgresql") == True
    assert are_skills_similar("python", "java") == True
    assert are_skills_similar("react", "vue") == True
    assert are_skills_similar("python", "docker") == False


def test_calculate_skill_match_perfect():
    result = calculate_skill_match(
        ["python", "react", "postgresql"],
        ["python", "react", "postgresql"]
    )
    assert result["score"] == 1.0
    assert len(result["matched"]) == 3
    assert len(result["missing"]) == 0


def test_calculate_skill_match_partial():
    result = calculate_skill_match(
        ["python", "react"],
        ["python", "react", "postgresql"]
    )
    assert result["score"] == 2/3
    assert "postgresql" in result["missing"]


def test_calculate_skill_match_with_aliases():
    result = calculate_skill_match(
        ["React.js", "postgres", "k8s"],
        ["react", "postgresql", "kubernetes"]
    )
    assert result["score"] == 1.0


def test_calculate_skill_match_empty_required():
    result = calculate_skill_match(["python", "react"], [])
    assert result["score"] == 1.0
