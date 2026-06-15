"""Code execution sandbox for coding assessments."""
from __future__ import annotations

import os
import subprocess
import tempfile
import time
from typing import Any


class CodeSandbox:
    """Execute code in a sandboxed environment."""

    SUPPORTED_LANGUAGES: dict[str, dict[str, Any]] = {
        "python": {
            "extension": ".py",
            "command": ["python3"],
            "timeout": 10,
        },
        "javascript": {
            "extension": ".js",
            "command": ["node"],
            "timeout": 10,
        },
    }

    def execute(
        self,
        code: str,
        language: str,
        test_cases: list[dict[str, Any]],
        timeout: int = 10,
    ) -> dict[str, Any]:
        if language not in self.SUPPORTED_LANGUAGES:
            return {
                "status": "error",
                "error": f"Language '{language}' not supported",
                "test_results": [],
            }

        lang_config = self.SUPPORTED_LANGUAGES[language]
        test_results: list[dict[str, Any]] = []
        all_passed = True

        for i, test_case in enumerate(test_cases):
            input_data = test_case.get("input", "")
            expected_output = test_case.get("expected", "")

            full_code = self._prepare_test_code(code, input_data, language)
            result = self._run_code(full_code, lang_config, timeout)

            passed = (
                result["status"] == "success"
                and result["output"].strip() == str(expected_output).strip()
            )

            test_results.append({
                "test_case": i + 1,
                "input": input_data,
                "expected": expected_output,
                "actual": result["output"].strip() if result["status"] == "success" else result.get("error", ""),
                "passed": passed,
                "execution_time_ms": result.get("execution_time_ms", 0),
            })

            if not passed:
                all_passed = False

        return {
            "status": "passed" if all_passed else "failed",
            "test_results": test_results,
            "total_tests": len(test_cases),
            "passed_tests": sum(1 for t in test_results if t["passed"]),
        }

    def _prepare_test_code(self, code: str, input_data: str, language: str) -> str:
        if language == "python":
            return f"""
import sys
from io import StringIO

# Candidate code
{code}

# Test input
sys.stdin = StringIO('''{input_data}''')
"""
        elif language == "javascript":
            return f"""
// Candidate code
{code}

// Test input
process.stdin = require('stream').Readable.from(`{input_data}`);
"""
        return code

    def _run_code(self, code: str, lang_config: dict[str, Any], timeout: int) -> dict[str, Any]:
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=lang_config["extension"],
            delete=False,
        ) as f:
            f.write(code)
            f.flush()
            temp_file = f.name

        try:
            start_time = time.time()

            result = subprocess.run(
                lang_config["command"] + [temp_file],
                capture_output=True,
                text=True,
                timeout=timeout,
            )

            execution_time_ms = int((time.time() - start_time) * 1000)

            if result.returncode == 0:
                return {
                    "status": "success",
                    "output": result.stdout,
                    "execution_time_ms": execution_time_ms,
                }
            else:
                return {
                    "status": "error",
                    "error": result.stderr,
                    "execution_time_ms": execution_time_ms,
                }

        except subprocess.TimeoutExpired:
            return {
                "status": "error",
                "error": f"Execution timeout ({timeout}s)",
            }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
            }
        finally:
            if os.path.exists(temp_file):
                os.unlink(temp_file)
