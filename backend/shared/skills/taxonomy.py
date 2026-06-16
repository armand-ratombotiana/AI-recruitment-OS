"""Skill normalization and taxonomy."""
from typing import Dict, List, Set
import re


SKILL_ALIASES: Dict[str, str] = {
    "react": "react",
    "react.js": "react",
    "reactjs": "react",
    "vue": "vue",
    "vue.js": "vue",
    "vuejs": "vue",
    "angular": "angular",
    "angular.js": "angular",
    "angularjs": "angular",
    "angular 2+": "angular",

    "django": "django",
    "flask": "flask",
    "fastapi": "fastapi",
    "fast api": "fastapi",
    "pyramid": "pyramid",

    "python": "python",
    "python3": "python",
    "py": "python",
    "javascript": "javascript",
    "js": "javascript",
    "ecmascript": "javascript",
    "typescript": "typescript",
    "ts": "typescript",
    "java": "java",
    "c++": "cpp",
    "cpp": "cpp",
    "c#": "csharp",
    "csharp": "csharp",
    "cs": "csharp",
    "go": "go",
    "golang": "go",
    "rust": "rust",
    "ruby": "ruby",
    "php": "php",
    "swift": "swift",
    "kotlin": "kotlin",

    "postgresql": "postgresql",
    "postgres": "postgresql",
    "pg": "postgresql",
    "mysql": "mysql",
    "mongodb": "mongodb",
    "mongo": "mongodb",
    "redis": "redis",
    "elasticsearch": "elasticsearch",
    "elastic": "elasticsearch",

    "aws": "aws",
    "amazon web services": "aws",
    "azure": "azure",
    "microsoft azure": "azure",
    "gcp": "gcp",
    "google cloud": "gcp",
    "google cloud platform": "gcp",

    "docker": "docker",
    "kubernetes": "kubernetes",
    "k8s": "kubernetes",
    "jenkins": "jenkins",
    "gitlab ci": "gitlab-ci",
    "github actions": "github-actions",
    "terraform": "terraform",

    "machine learning": "machine-learning",
    "ml": "machine-learning",
    "deep learning": "deep-learning",
    "dl": "deep-learning",
    "neural networks": "neural-networks",
    "nlp": "nlp",
    "natural language processing": "nlp",
    "computer vision": "computer-vision",
    "cv": "computer-vision",
    "tensorflow": "tensorflow",
    "pytorch": "pytorch",
    "scikit-learn": "scikit-learn",
    "sklearn": "scikit-learn",

    "git": "git",
    "jira": "jira",
    "confluence": "confluence",
    "figma": "figma",
    "sketch": "sketch",
    "photoshop": "photoshop",

    "agile": "agile",
    "scrum": "scrum",
    "kanban": "kanban",
    "lean": "lean",
    "devops": "devops",
    "ci/cd": "ci-cd",
    "continuous integration": "ci-cd",
    "continuous deployment": "ci-cd",
}

SKILL_CATEGORIES: Dict[str, List[str]] = {
    "programming_languages": [
        "python", "javascript", "typescript", "java", "cpp", "csharp",
        "go", "rust", "ruby", "php", "swift", "kotlin"
    ],
    "frontend_frameworks": ["react", "vue", "angular"],
    "backend_frameworks": ["django", "flask", "fastapi", "pyramid"],
    "databases": ["postgresql", "mysql", "mongodb", "redis", "elasticsearch"],
    "cloud": ["aws", "azure", "gcp"],
    "devops": ["docker", "kubernetes", "jenkins", "gitlab-ci", "github-actions", "terraform"],
    "ml_ai": ["machine-learning", "deep-learning", "neural-networks", "nlp", "computer-vision", "tensorflow", "pytorch", "scikit-learn"],
    "tools": ["git", "jira", "confluence", "figma", "sketch", "photoshop"],
    "methodologies": ["agile", "scrum", "kanban", "lean", "devops", "ci-cd"],
}


def normalize_skill(skill: str) -> str:
    """Normalize a skill name to its canonical form."""
    skill_lower = skill.lower().strip()

    if skill_lower in SKILL_ALIASES:
        return SKILL_ALIASES[skill_lower]

    cleaned = re.sub(r'[.\-_ ]+', '', skill_lower)
    if cleaned in SKILL_ALIASES:
        return SKILL_ALIASES[cleaned]

    return skill_lower


def normalize_skills(skills: List[str]) -> List[str]:
    """Normalize a list of skills, removing duplicates."""
    normalized = set()
    for skill in skills:
        normalized.add(normalize_skill(skill))
    return sorted(normalized)


def get_skill_category(skill: str) -> str:
    """Get the category for a skill."""
    normalized = normalize_skill(skill)
    for category, skills in SKILL_CATEGORIES.items():
        if normalized in skills:
            return category
    return "other"


def are_skills_similar(skill1: str, skill2: str) -> bool:
    """Check if two skills are similar (same canonical form or in same category)."""
    norm1 = normalize_skill(skill1)
    norm2 = normalize_skill(skill2)

    if norm1 == norm2:
        return True

    cat1 = get_skill_category(skill1)
    cat2 = get_skill_category(skill2)
    if cat1 == cat2 and cat1 != "other":
        return True

    return False


def calculate_skill_match(candidate_skills: List[str], required_skills: List[str]) -> Dict:
    """Calculate skill match between candidate and job requirements."""
    candidate_normalized = set(normalize_skills(candidate_skills))
    required_normalized = set(normalize_skills(required_skills))

    if not required_normalized:
        return {
            "score": 1.0,
            "matched": [],
            "missing": [],
            "extra": list(candidate_normalized)
        }

    matched = candidate_normalized & required_normalized
    missing = required_normalized - candidate_normalized
    extra = candidate_normalized - required_normalized

    score = len(matched) / len(required_normalized)

    return {
        "score": score,
        "matched": sorted(matched),
        "missing": sorted(missing),
        "extra": sorted(extra),
        "match_percentage": round(score * 100, 1)
    }
