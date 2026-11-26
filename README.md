# Calculator: Go + React

A small full-stack calculator. A Go HTTP API does the arithmetic and validation, and a React + TypeScript frontend collects the input and shows the result.
It supports add, subtract, multiply, divide, power, square root and percentage, with consistent JSON errors.

## Requirements

- Go 1.22 or newer (tested with 1.27.4)
- Node.js 24 and npm
- Docker with Compose v2 (only for the Docker setup)

## How to run it

### Docker

```bash
docker compose up --build
```

Open http://localhost:3000. Set `FRONTEND_PORT` to use another port. Only the frontend is published; nginx proxies `/api/` to the backend.

```bash
docker compose down
```

### Locally

Backend (listens on `PORT`, default `8080`):

```bash
cd backend && go run ./cmd/server
```

Frontend (Vite dev server, proxies `/api` to `localhost:8080`):

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. Build for production with `npm run build`, which typechecks first.

## API

| Method | Path                | Description               |
| ------ | ------------------- | ------------------------- |
| `POST` | `/api/v1/calculate` | Runs one operation        |
| `GET`  | `/health`           | Returns `{"status":"ok"}` |

Operations: `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt` (uses only `a`), `percentage` (a% of b).

Request and responses:

```json
{ "operation": "divide", "a": 10, "b": 4 }
{ "operation": "divide", "a": 10, "b": 4, "result": 2.5 }
{ "error": { "code": "DIVISION_BY_ZERO", "message": "cannot divide by zero" } }
```

### Examples

The examples use the Docker URL. Locally, use `localhost:8080` for the backend directly or `localhost:5173` through the Vite proxy.

**200 OK**

```bash
curl -X POST localhost:3000/api/v1/calculate -H 'Content-Type: application/json' \
  -d '{"operation":"divide","a":10,"b":4}'
# {"operation":"divide","a":10,"b":4,"result":2.5}
```

**400 `INVALID_REQUEST`**: malformed JSON, trailing data, unknown field, wrong type, out-of-range literal, or a missing field

```bash
curl -X POST localhost:3000/api/v1/calculate -H 'Content-Type: application/json' \
  -d '{"operation":"add","a":5}'
# {"error":{"code":"INVALID_REQUEST","message":"field \"b\" is required for operation \"add\""}}
```

**400 `UNSUPPORTED_OPERATION`**: unknown operation; names are case-sensitive

```bash
curl -X POST localhost:3000/api/v1/calculate -H 'Content-Type: application/json' \
  -d '{"operation":"Divide","a":1,"b":2}'
# {"error":{"code":"UNSUPPORTED_OPERATION","message":"unsupported operation: \"Divide\""}}
```

**422 `DIVISION_BY_ZERO`**: also returned for a zero base with a negative exponent in `power`

```bash
curl -X POST localhost:3000/api/v1/calculate -H 'Content-Type: application/json' \
  -d '{"operation":"divide","a":1,"b":0}'
# {"error":{"code":"DIVISION_BY_ZERO","message":"cannot divide by zero"}}
```

**422 `INVALID_OPERAND`**: square root of a negative number, or a negative base with a non-integer exponent

```bash
curl -X POST localhost:3000/api/v1/calculate -H 'Content-Type: application/json' \
  -d '{"operation":"sqrt","a":-4}'
# {"error":{"code":"INVALID_OPERAND","message":"invalid operand: cannot take the square root of a negative number"}}
```

**422 `RESULT_OUT_OF_RANGE`**: the result overflows to infinity

```bash
curl -X POST localhost:3000/api/v1/calculate -H 'Content-Type: application/json' \
  -d '{"operation":"multiply","a":1e308,"b":10}'
# {"error":{"code":"RESULT_OUT_OF_RANGE","message":"result out of range"}}
```

**500 `INTERNAL_ERROR`**: returned for panics and unexpected errors. No valid request triggers it; it is covered by the handler tests.

```json
{ "error": { "code": "INTERNAL_ERROR", "message": "internal server error" } }
```

## Architecture and design decisions

- Separated layers. In the backend, `calculator` only handles the logic and `api` contains the handlers that manage requests. In the frontend, `calculatorClient` is the only module that communicates with the backend, while `useCalculator` manages the state used by the components. This separation makes testing easier, keeps each part independent and keeps the code maintainable.
- No over-engineering, since the app is not complex: no Redux, no UI libraries, no frameworks, only the Go standard library. Simplicity was prioritized for correctness, clarity and maintainability.
- A single endpoint, `POST /api/v1/calculate`, instead of one endpoint per operation, so validation stays in one place and is not repeated.
- HTTP 400 vs 422: 400 is used when the request is malformed, and 422 when the request is well formed but mathematically invalid.
- All error mapping is centralized in one place, with a single error format `{error: {code, message}}`.
- `*float64` for operands, to distinguish a missing field from zero. Otherwise, a divide request without `b` would return `DIVISION_BY_ZERO` instead of `INVALID_REQUEST`.
- Specific errors are checked before the generic Inf/NaN check, so cases like `0^-1` return a specific error instead of `RESULT_OUT_OF_RANGE`.
- Percentage is defined as `(a / 100) * b`, `sqrt` ignores `b`, and `0^0 = 1`.
- The frontend only validates the number format; the backend is the source of truth for mathematical rules.
- The result is cleared when an input is edited, and late responses are ignored.
- A "Use result" button lets users chain calculations, as a simple alternative to an expression parser that could be added in the future.
- Same origin through a proxy (Vite in development, nginx in Docker), so neither CORS nor API URL variables are needed.

## Edge cases and known limitations

| Case                     | Behavior                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Missing `b` vs `b: 0`    | Missing or `null` returns `INVALID_REQUEST`; `0` is a valid operand                                                            |
| `sqrt` with `b`          | `b` is ignored and left out of the response, but a `b` with the wrong type or out of range is still rejected                   |
| `0^0`                    | Returns `1`                                                                                                                    |
| `0^-1`                   | Returns `DIVISION_BY_ZERO`                                                                                                     |
| `(-8)^0.5`, `(-8)^(1/3)` | Returns `INVALID_OPERAND`: a negative base needs an integer exponent, even when a real root exists                             |
| Percentage               | Computed as `(a / 100) * b` to lower the risk of overflow                                                                      |
| `-0`                     | Normalized to `0` in the result and in the echoed operands                                                                     |
| Floating point           | IEEE 754 doubles: `0.1 + 0.2` is `0.30000000000000004` in the API and shown as `0.3` (12 significant digits)                   |
| Underflow (`1e-400`)     | Read as `0` without an error, so dividing by it returns `DIVISION_BY_ZERO`. The UI rejects such input; direct API calls do not |
| Integers above 2^53      | Lose precision and are echoed rounded (`9007199254740993` comes back as `9007199254740992`)                                    |
| Duplicate JSON keys      | The last value wins                                                                                                            |
| Field-name case          | `"A"` or `"Operation"` are accepted (standard `encoding/json` behavior)                                                        |
| Body over 4 KiB          | Returns `400 INVALID_REQUEST`, not 413, to stay within the contract's status codes                                             |
| 404 and 405              | Go's default plain-text responses, not the JSON envelope; 405 includes `Allow: POST`                                           |
| Decimal comma (`2,5`)    | Rejected by the UI with a message to use a dot                                                                                 |
| Mobile keyboard          | Inputs use the full keyboard, because the iOS decimal keypad has no minus sign or `e`                                          |
| nginx and backend IP     | nginx resolves `backend` once at startup; if the container is recreated with a new IP, nginx returns 502 until it is restarted |

## Tests and coverage

Backend:

```bash
cd backend && go vet ./... && go test ./...
```

Frontend:

```bash
cd frontend && npm run typecheck && npm test
```

```bash
cd frontend && npm run test:coverage
```

- Backend: table-driven tests for the calculator, and `httptest` tests for every contract case, panic recovery and error mapping.
- Frontend (94 tests): the number parser, the API client with mocked `fetch`, and the `Calculator` component tested through the UI with Testing Library, mocking only `fetch`.

Current coverage, saved in [`coverage/`](coverage/COVERAGE.md) with the commands to regenerate it:

| Area                  | Coverage                                 |
| --------------------- | ---------------------------------------- |
| Backend total         | 78.9% of statements                      |
| `internal/calculator` | 100%                                     |
| `internal/api`        | 97.9%                                    |
| `cmd/server`          | 0% (startup and shutdown, no unit tests) |
| Frontend              | 95.45% of statements, 93.04% of branches |

## AI use

I used Claude Code to implement this solution. I defined the architecture, the API contract and the edge cases to handle, and I reviewed each prompt technically and grammatically before sending it. The AI implemented each step and reviewed the code, and I decided which suggestions to accept, change or reject. All prompts, along with the responses that required a decision, are in [PROMPTS.md](PROMPTS.md).

## Future improvements

- An expression parser to evaluate compound operations such as `(2 + 3) * 4`
- An on-screen numeric keypad that includes minus and exponent
- CI running vet, tests, coverage and image builds
- End-to-end browser tests
- JSON responses for 404 and 405
- nginx re-resolving the backend address through Docker's DNS
