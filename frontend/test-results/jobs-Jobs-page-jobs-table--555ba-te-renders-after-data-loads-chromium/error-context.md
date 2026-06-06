# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: jobs.spec.ts >> Jobs page >> jobs table or empty state renders after data loads
- Location: tests\e2e\jobs.spec.ts:16:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
TimeoutError: page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "http://localhost:3000/dashboard/jobs", waiting until "load"

```

```
Tearing down "context" exceeded the test timeout of 30000ms.
```