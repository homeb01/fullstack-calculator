# Coverage

| Area | File | Total |
|---|---|---|
| Backend (Go) | [backend.txt](backend.txt) | 75.8% of statements |
| Frontend (Vitest, v8) | [frontend.txt](frontend.txt) | 95.45% of statements, 93.04% of branches |

The backend total includes `cmd/server` (startup and shutdown), which has no unit tests. `internal/calculator` is at 100% and `internal/api` at 92.7%.

## Regenerate

Run from the repository root.

Backend:

```bash
cd backend && go test ./... -coverprofile=../coverage/backend.out && go tool cover -func=../coverage/backend.out > ../coverage/backend.txt
```

Frontend:

```bash
cd frontend && NO_COLOR=1 npx vitest run --coverage 2>&1 | sed -n '/% Coverage report/,$p' > ../coverage/frontend.txt
```

`backend.out` is the raw Go profile; open it in a browser with `go tool cover -html=coverage/backend.out`. The frontend command also writes an HTML report to `frontend/coverage/`.
