---
name: debug-fastapi-5xx
description: Debug 5xx errors in FastAPI apps. Use whenever you encounter HTTP 500/502/503 errors or server crashes.
when_to_use: |
  When debugging FastAPI applications that return 5xx status codes, encounter server crashes, or have unexplained API failures.

  Example user phrases:
  - "My FastAPI app is crashing with 500 errors"
  - "Why is my API returning 502 Bad Gateway?"
  - "I'm getting 503 Service Unavailable errors"
paths: ["**/*"]
allowed-tools: Read Bash Edit
version: "1.0.0"
---

# Debug FastAPI 5xx Errors

This skill helps you systematically diagnose and resolve server-side errors (5xx status codes) in FastAPI applications.

## When to use

Use this skill when:
- Your FastAPI application returns HTTP 500, 502, or 503 errors
- Server processes crash unexpectedly
- Error logs show unhandled exceptions
- API endpoints fail inconsistently

Do NOT use this skill for:
- Client-side 4xx errors (400, 404, etc.)
- CORS issues
- Authentication/authorization problems

## Steps

1. Read the application logs to identify the error pattern
   Check stdout/stderr, systemd logs, or container logs for stack traces.

2. Identify the exception type and location
   Match the stack trace to your codebase.

3. Check for common issues based on exception type
   - `AttributeError`: Missing dependencies or incorrect imports
   - `ConnectionError`: Database or external service unavailable
   - `TimeoutError`: Slow queries or network issues

4. Verify environment configuration
   Check that environment variables are set and database URLs are correct.

5. Test the fix locally
   Reproduce the error, apply the fix, and verify the endpoint returns 2xx status codes.

## Example

**Scenario**: A FastAPI app returns 500 errors intermittently on the `/api/users/{user_id}` endpoint.

**Walkthrough**:
1. Read the Kubernetes logs: `kubectl logs deployment/fastapi-app --tail=100`
2. Find the stack trace: `AttributeError: 'NoneType' object has no attribute 'email'`
3. Locate the code: In `users.py:45`, `user = db.query(...).first()` returns None
4. Fix the issue: Add `if user is None: raise HTTPException(404, "User not found")`
5. Test locally with `curl http://localhost:8000/api/users/999`

**Outcome**: The endpoint returns 404 for missing users instead of 500.

## Common pitfalls

- **Don't ignore None returns**: Always check for None before accessing attributes
- **Don't expose stack traces to users**: Return generic error messages in production
- **Don't forget to log errors**: Use proper logging levels for debugging
- **Don't skip testing**: Test edge cases (missing IDs, empty results, invalid input)