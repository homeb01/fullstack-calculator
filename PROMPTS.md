# Prompts

Prompts I used with Claude Code, in order. The design decisions behind them are documented in the [README](README.md).

## 1. Design review

```
I'm building a simple calculator: Go backend + React/TypeScript frontend. We should prioritize correctness, clarity and maintainability; it should take 2 to 4 hours. My plan is to build a mono-repo project containing the following:

Project structure:
fullstack-calculator/
  backend/
    cmd/server/main.go - server start, config and routes
    internal/calculator/ - logic, no HTTP
      calculator.go
      calculator_test.go
    internal/api/ - handlers: validate, call calculator, serialize
      handler.go
      handler_test.go
    go.mod
    Dockerfile
  frontend/ - Vite + React + TypeScript
    src/api/calculatorClient.ts - only layer that calls the backend
    src/hooks/useCalculator.ts - state: inputs, loading, result, error
    src/components/ - Calculator, OperationButtons, ResultDisplay
    src/utils/validation.ts - input format validation
    Dockerfile - build + nginx
  docker-compose.yml
  README.md

API contract:
// Endpoints
POST /api/v1/calculate
GET /health

// Request
{ "operation": "divide", "a": 10, "b": 4 }

// 200 OK
{ "operation": "divide", "a": 10, "b": 4, "result": 2.5 }

// Error
{ "error": { "code": "DIVISION_BY_ZERO", "message": "cannot divide by zero" } }

// HTTP responses:
HTTP -> Case -> Code
400 -> Wrong JSON, missing field, unknown operation -> INVALID_REQUEST / UNSUPPORTED_OPERATION
422 -> Division by zero -> DIVISION_BY_ZERO
422 -> Negative square root -> INVALID_OPERAND
422 -> Inf or NaN -> RESULT_OUT_OF_RANGE

// Operations:
add, subtract, multiply, divide, power, sqrt (just uses "a"), percentage (a% of b).

Other requirements:
- Avoid comments unless they are useful to explain business rules. They should be short.

Review this design. What edge cases, risks or over engineering do you see? Don't write code yet.
```

## 2. Design decisions

```
Decisions:

1. Use *float64 for a and b so missing fields are caught.
2. For sqrt, ignore b if sent and omit it from the response. The "needs b" rule lives in the calculator package.
3. Power: (-8)^0.5 returns INVALID_OPERAND, 0^-1 returns DIVISION_BY_ZERO, 0^0 = 1 (document and test it). Specific checks first, generic Inf/NaN check last for every operation.
4. Percentage uses (a / 100) * b.
5. Add INTERNAL_ERROR with panic recovery. 404/405 stay as Go's default plain text and will be documented.

I agree with the rest of your suggestions. Don't write the README yet, I'll do it at the end. Don't write code yet.
```

## 3. Calculator package

```
Create internal/calculator in Go. Use a map[string]operation where each operation defines its function func(a, b float64) (float64, error) and whether it requires b. Implement add, subtract, multiply, divide, power, sqrt and percentage following the decisions above. Return sentinel errors: ErrDivisionByZero, ErrInvalidOperand, ErrOutOfRange, and ErrUnsupportedOperation for unknown operations. Standard library only.

Then write table-driven tests covering normal cases, negatives, decimals, zero, division by zero, sqrt of negative, (-8)^0.5, 0^-1, 0^0, overflow to Inf and unknown operation.
```

## 4. API handler and server

```
Create internal/api with a handler for POST /api/v1/calculate following the contract and the decisions above. Decode a and b as *float64. Map calculator errors to HTTP status and codes in a single place. Reject with INVALID_REQUEST: malformed JSON, trailing data after the object, unknown fields (DisallowUnknownFields), strings instead of numbers, out-of-range literals like 1e400, and missing a, or missing b when the operation requires it. Operation names are case-sensitive, so "Divide" returns UNSUPPORTED_OPERATION. Limit the body size with http.MaxBytesReader. Add panic recovery that returns INTERNAL_ERROR in the envelope. Add GET /health. Keep the handler thin.

In cmd/server/main.go, read the port from PORT (default 8080), set server timeouts including ReadHeaderTimeout, and add graceful shutdown. Use stdlib net/http and log/slog only.

Then write handler tests with httptest for: success, missing b vs b: 0, sqrt with b ignored, malformed JSON, trailing JSON, unknown field, string instead of number, 1e400, unknown operation, uppercase operation, division by zero, and panic recovery.
```

## 5. Field-name case and handler review

_Context: the AI found that `encoding/json` matches field names case-insensitively._

```
Accept it. This is standard encoding/json behavior and rejecting it would need manual key checking, which isn't worth it for this scope. I'll document it in the README as a known behavior. Review the handler for inputs that could crash it or produce responses inconsistent with the contract.
```

## 6. Review fixes

_Context: the review found `-0` echoed in the operands, silent underflow and the status written before encoding._

```
Yes, fix the -0 echo and the write order now, with a test for each. Don't touch the README and don't commit anything; I'll handle both myself. Just list the items I should document: underflow (1e-400), duplicate keys and field-name case.
```

## 7. Frontend setup, validation and API client

```
Set up the frontend with Vite + React + TypeScript (strict mode) in frontend/. Configure the Vite dev proxy so /api goes to http://localhost:8080; no CORS and no API URL env var.

Create src/utils/validation.ts with a strict number parser. Accept -12, 2.5, .5, 5. and exponent notation like 1e3. Reject empty or whitespace-only input, hex, Infinity, partial numbers like 12abc, and decimal commas (2,5) with a clear message explaining that a dot must be used.

Create src/api/calculatorClient.ts, typed against the API contract. Return a discriminated union { ok: true, result } | { ok: false, code, message }. Map network failures, timeouts and non-JSON responses (e.g. nginx HTML on 502) to a generic error instead of crashing. Add a request timeout.
```

## 8. Hook and components

```
Create the useCalculator hook with the inputs, operation, loading, result and error state, calling the client. Disable the operation buttons while a request is loading, and clear the result when any input changes so a result is never shown next to inputs it doesn't match.

Build the components: Calculator, OperationButtons and ResultDisplay. Disable input b for sqrt. Label percentage clearly as "a % of b". Add a "Use result" button that copies the last result into input a to chain operations. Format the displayed number with toPrecision(12), removing trailing zeros and showing very large or small numbers in exponent notation deliberately. Mobile-first CSS that looks good at 375px. No UI or state libraries.
```

## 9. Responsive review

```
Review the frontend layout at 320px, 375px, 768px and 1280px. On small screens, check that nothing overflows horizontally, touch targets are at least 44px, and the numeric inputs open a numeric keyboard on mobile (inputMode="decimal"). On large screens, keep the calculator centered with a max width instead of stretching. Fix only what is broken; keep the CSS simple, with no new libraries.
```

## 10. Frontend tests

```
Add Vitest, React Testing Library and @vitest/coverage-v8 to the frontend, with an npm run test:coverage script. Write tests for:

- validation.ts: every accepted and rejected format we defined, including .5, 5., exponents, empty input, hex, Infinity, 12abc and the decimal comma message.
- calculatorClient.ts with mocked fetch: success, API error with code, network failure, timeout and a non-JSON response.
- The Calculator component: happy path, validation error shown, API error shown, buttons disabled while loading, result cleared when an input changes, input b disabled for sqrt, and "Use result" copying the result into a.

Test behavior from the user's point of view, not implementation details. Run the tests and the coverage and report the results.
```

## 11. Stale-response test

_Context: the stale-response path was the one important behavior left untested._

```
Yes, add a test for that path: edit an input while a request is loading, resolve the old request, and assert the stale result is not shown.
```

## 12. Docker and coverage reports

```
Create a multi stage Dockerfile for the backend: build with the official Go image using CGO_ENABLED=0, and run the binary on gcr.io/distroless/static as a non-root user. Create a multi-stage Dockerfile for the frontend: build with Node, then serve the static files with nginx, proxying /api to the backend service and falling back to index.html for unknown routes. Add .dockerignore files for both.

Add a docker-compose.yml at the root that runs both services, exposing only the frontend port. Skip the compose healthcheck, since distroless has no curl; use a plain depends_on.

Then generate the coverage reports: run go test ./... -coverprofile with go tool cover -func for the backend and the Vitest text summary for the frontend, and save both summaries in a coverage/ folder at the root, with a short coverage/COVERAGE.md listing the commands to regenerate them.

Finally run docker compose up --build, verify a real calculation through the frontend URL with curl, and report the results.
```

## 13. Backend coverage review

_Context: the AI suggested making nginx re-resolve the backend IP, and backend coverage was 75.8%._

```
No, skip the nginx re-resolve; I'll note it as a known limitation. Instead, show me the backend coverage per package and function. If the gap is mostly in cmd/server/main.go, that's fine. If internal/calculator or internal/api have untested branches, add tests for the meaningful ones.
```

## 14. README draft

```
Write a draft README.md using this structure:

1. Brief description (2 to 3 lines)
2. Requirements
3. How to run it (Docker and locally)
4. API: endpoint, operations and examples with curl (one from Ok and one for each error code)
5. Architecture and design decisions
6. Edge cases and known limitations (table)
7. Tests and coverage
8. AI use
9. Future improvements

Fill in sections 1 to 4, 6 and 7 from the outline you gave me, keeping them concise. Use a table for edge cases. For sections 5 (architecture and design decisions), 8 (AI usage) and 9 (future improvements), leave only the headings with a TODO; I'll write those myself.
```
