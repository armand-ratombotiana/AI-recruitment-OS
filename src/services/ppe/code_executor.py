"""Code execution sandbox — Docker-based isolated code runner."""

from __future__ import annotations

import asyncio
import json
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from src.config import get_settings

settings = get_settings()


@dataclass
class ExecutionRequest:
    code: str
    language: str
    test_cases: list[dict[str, str]] = field(default_factory=list)
    timeout_seconds: int = 30
    memory_limit: str = "512m"
    cpu_limit: str = "0.5"


@dataclass
class ExecutionResponse:
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    execution_time_ms: int = 0
    memory_used_mb: float = 0.0
    test_results: list[dict[str, Any]] = field(default_factory=list)
    all_tests_passed: bool = False
    timeout_exceeded: bool = False
    total_tests: int = 0
    passed_tests: int = 0
    failed_tests: int = 0


LANGUAGE_CONFIGS = {
    "python": {
        "image": "python:3.12-slim",
        "extension": ".py",
        "run_cmd": "python {file}",
    },
    "javascript": {
        "image": "node:20-slim",
        "extension": ".js",
        "run_cmd": "node {file}",
    },
    "typescript": {
        "image": "node:20-slim",
        "extension": ".ts",
        "run_cmd": "npx tsx {file}",
    },
    "java": {
        "image": "eclipse-temurin:21-jre",
        "extension": ".java",
        "run_cmd": "javac {file} && java -cp {dir} Main",
    },
    "go": {
        "image": "golang:1.22-alpine",
        "extension": ".go",
        "run_cmd": "go run {file}",
    },
    "cpp": {
        "image": "gcc:13",
        "extension": ".cpp",
        "run_cmd": "g++ -o /tmp/program {file} && /tmp/program",
    },
}


class CodeExecutionSandbox:
    """
    Executes candidate code in isolated Docker containers.

    Security measures:
    - No network access (--network none)
    - Read-only filesystem except /tmp
    - Resource limits (CPU, memory, time)
    - No privileged operations
    - Dropped capabilities
    """

    def __init__(self) -> None:
        self.docker_image = settings.SANDBOX_DOCKER_IMAGE

    async def execute(self, request: ExecutionRequest) -> ExecutionResponse:
        lang_config = LANGUAGE_CONFIGS.get(request.language)
        if not lang_config:
            return ExecutionResponse(
                stderr=f"Unsupported language: {request.language}",
                exit_code=1,
            )

        session_id = str(uuid.uuid4())
        work_dir = Path(tempfile.mkdtemp(prefix=f"airos-sandbox-{session_id}-"))

        try:
            source_file = work_dir / f"solution{lang_config['extension']}"
            source_file.write_text(request.code, encoding="utf-8")

            run_cmd = lang_config["run_cmd"].format(
                file=source_file, dir=work_dir
            )

            result = await self._run_in_container(
                image=lang_config["image"],
                command=run_cmd,
                work_dir=str(work_dir),
                timeout=request.timeout_seconds,
                memory_limit=request.memory_limit,
                cpu_limit=request.cpu_limit,
            )

            if request.test_cases:
                test_results = await self._run_test_cases(
                    request, lang_config, work_dir
                )
                result.test_results = test_results
                result.total_tests = len(test_results)
                result.passed_tests = sum(1 for t in test_results if t.get("passed"))
                result.failed_tests = result.total_tests - result.passed_tests
                result.all_tests_passed = result.passed_tests == result.total_tests

            return result

        except asyncio.TimeoutError:
            return ExecutionResponse(
                stderr="Execution timed out",
                timeout_exceeded=True,
                exit_code=-1,
            )
        finally:
            import shutil
            shutil.rmtree(work_dir, ignore_errors=True)

    async def _run_in_container(
        self,
        image: str,
        command: str,
        work_dir: str,
        timeout: int,
        memory_limit: str,
        cpu_limit: str,
    ) -> ExecutionResponse:
        docker_cmd = [
            "docker", "run", "--rm",
            "--network", "none",
            "--read-only",
            "--tmpfs", "/tmp:size=100m",
            "--memory", memory_limit,
            "--cpus", cpu_limit,
            "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges",
            "-v", f"{work_dir}:/workspace:ro",
            "-w", "/workspace",
            image,
            "sh", "-c", command,
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *docker_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )

            return ExecutionResponse(
                stdout=stdout_bytes.decode(errors="replace"),
                stderr=stderr_bytes.decode(errors="replace"),
                exit_code=proc.returncode or 0,
                execution_time_ms=0,  # Measured externally
            )

        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            raise

    async def _run_test_cases(
        self,
        request: ExecutionRequest,
        lang_config: dict,
        work_dir: Path,
    ) -> list[dict[str, Any]]:
        results = []
        for i, test in enumerate(request.test_cases):
            test_code = self._inject_test(request.code, test, request.language)
            test_file = work_dir / f"test_{i}{lang_config['extension']}"
            test_file.write_text(test_code, encoding="utf-8")

            result = await self._run_in_container(
                image=lang_config["image"],
                command=lang_config["run_cmd"].format(file=test_file, dir=work_dir),
                work_dir=str(work_dir),
                timeout=request.timeout_seconds,
                memory_limit=request.memory_limit,
                cpu_limit=request.cpu_limit,
            )

            results.append({
                "test_index": i,
                "input": test.get("input", ""),
                "expected": test.get("expected", ""),
                "actual": result.stdout.strip(),
                "passed": result.exit_code == 0 and result.stdout.strip() == test.get("expected", "").strip(),
                "stderr": result.stderr,
            })

        return results

    def _inject_test(self, code: str, test: dict[str, str], language: str) -> str:
        if language == "python":
            return f"{code}\n\nresult = solution({test.get('input', '')})\nprint(result)\n"
        if language in ("javascript", "typescript"):
            return f"{code}\n\nconsole.log(solution({test.get('input', '')}));\n"
        return code
