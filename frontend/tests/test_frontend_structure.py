"""Verify all frontend files exist and have valid structure."""
import os
import re
import sys

FRONTEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGES = [
    "src/app/page.tsx",
    "src/app/(auth)/login/page.tsx",
    "src/app/(auth)/register/page.tsx",
    "src/app/(auth)/callback/page.tsx",
    "src/app/(dashboard)/layout.tsx",
    "src/app/(dashboard)/page.tsx",
    "src/app/(dashboard)/candidates/page.tsx",
    "src/app/(dashboard)/jobs/page.tsx",
    "src/app/(dashboard)/interviews/page.tsx",
    "src/app/(dashboard)/ppe/page.tsx",
    "src/app/(dashboard)/analytics/page.tsx",
    "src/app/(dashboard)/ai-copilot/page.tsx",
    "src/app/(dashboard)/workflows/page.tsx",
    "src/app/(dashboard)/settings/page.tsx",
    "src/app/(dashboard)/pipeline/page.tsx",
    "src/app/(dashboard)/matching/page.tsx",
    "src/app/(dashboard)/schedule/page.tsx",
    "src/app/(dashboard)/recruiter/page.tsx",
    "src/app/(interview)/ai-interview/page.tsx",
    "src/app/(interview)/ppe-interview/page.tsx",
]

COMPONENTS = [
    "src/components/ui/card.tsx",
    "src/components/ui/button.tsx",
    "src/components/ui/badge.tsx",
    "src/components/ui/loading.tsx",
    "src/components/ui/empty-state.tsx",
    "src/components/ui/data-table.tsx",
    "src/components/ui/progress.tsx",
    "src/components/ui/avatar.tsx",
    "src/components/ui/tabs.tsx",
    "src/components/ui/modal.tsx",
]

SUPPORT = [
    "src/stores/index.ts",
    "src/services/api/client.ts",
    "src/lib/utils.ts",
]

IMPORT_PATTERNS = [
    re.compile(r"from\s+['\"]@/(components|stores|services|lib)/"),
    re.compile(r"import\s+\{[^}]+\}\s+from\s+['\"]@/"),
]


def test_files_exist():
    all_files = PAGES + COMPONENTS + SUPPORT
    missing = []
    for f in all_files:
        full = os.path.join(FRONTEND_ROOT, f)
        if not os.path.isfile(full):
            missing.append(f)
    return missing


def test_page_imports():
    issues = []
    for page in PAGES:
        full = os.path.join(FRONTEND_ROOT, page)
        if not os.path.isfile(full):
            issues.append(f"MISSING: {page}")
            continue
        content = open(full, encoding="utf-8").read()
        has_use_client = "'use client'" in content or '"use client"' in content
        has_default_export = "export default" in content
        if not has_default_export:
            issues.append(f"NO DEFAULT EXPORT: {page}")
        # Pages with state/hooks should have 'use client'
        if ("useState" in content or "useEffect" in content) and not has_use_client:
            issues.append(f"MISSING 'use client': {page}")
    return issues


def test_component_exports():
    issues = []
    for comp in COMPONENTS:
        full = os.path.join(FRONTEND_ROOT, comp)
        if not os.path.isfile(full):
            issues.append(f"MISSING: {comp}")
            continue
        content = open(full, encoding="utf-8").read()
        if "export" not in content:
            issues.append(f"NO EXPORTS: {comp}")
    return issues


def test_stores():
    full = os.path.join(FRONTEND_ROOT, "src/stores/index.ts")
    if not os.path.isfile(full):
        return ["MISSING: src/stores/index.ts"]
    content = open(full, encoding="utf-8").read()
    required = ["useAuthStore", "useCandidateStore", "useJobStore", "useInterviewStore"]
    issues = []
    for name in required:
        if name not in content:
            issues.append(f"STORE MISSING EXPORT: {name}")
    return issues


def test_api_client():
    full = os.path.join(FRONTEND_ROOT, "src/services/api/client.ts")
    if not os.path.isfile(full):
        return ["MISSING: src/services/api/client.ts"]
    content = open(full, encoding="utf-8").read()
    required = ["login", "register", "logout", "listCandidates", "listJobs", "listInterviews"]
    issues = []
    for method in required:
        if method not in content:
            issues.append(f"API CLIENT MISSING METHOD: {method}")
    return issues


def main():
    passed = 0
    failed = 0

    tests = [
        ("File existence", test_files_exist),
        ("Page structure", test_page_imports),
        ("Component exports", test_component_exports),
        ("Stores", test_stores),
        ("API client", test_api_client),
    ]

    for name, fn in tests:
        issues = fn()
        if not issues:
            print(f"  PASS  {name}")
            passed += 1
        else:
            print(f"  FAIL  {name}")
            for issue in issues:
                print(f"        - {issue}")
            failed += 1

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed")
    if failed:
        sys.exit(1)
    print("All checks passed!")


if __name__ == "__main__":
    main()
