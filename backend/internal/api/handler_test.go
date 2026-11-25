package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"testing/iotest"

	"fullstack-calculator/backend/internal/calculator"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestCalculate(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantBody   string
	}{
		{
			name:       "success",
			body:       `{"operation":"divide","a":10,"b":4}`,
			wantStatus: http.StatusOK,
			wantBody:   `{"operation":"divide","a":10,"b":4,"result":2.5}`,
		},
		{
			name:       "trailing whitespace is allowed",
			body:       "{\"operation\":\"add\",\"a\":1,\"b\":2}\n",
			wantStatus: http.StatusOK,
			wantBody:   `{"operation":"add","a":1,"b":2,"result":3}`,
		},
		{
			name:       "b zero is a valid operand",
			body:       `{"operation":"add","a":5,"b":0}`,
			wantStatus: http.StatusOK,
			wantBody:   `{"operation":"add","a":5,"b":0,"result":5}`,
		},
		{
			name:       "missing b",
			body:       `{"operation":"add","a":5}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"field \"b\" is required for operation \"add\""}}`,
		},
		{
			name:       "null b is treated as missing",
			body:       `{"operation":"add","a":5,"b":null}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"field \"b\" is required for operation \"add\""}}`,
		},
		{
			name:       "missing b on divide is not division by zero",
			body:       `{"operation":"divide","a":5}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"field \"b\" is required for operation \"divide\""}}`,
		},
		{
			name:       "missing a",
			body:       `{"operation":"add","b":5}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"field \"a\" is required"}}`,
		},
		{
			name:       "missing operation",
			body:       `{"a":1,"b":2}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"field \"operation\" is required"}}`,
		},
		{
			name:       "sqrt ignores b and omits it from the response",
			body:       `{"operation":"sqrt","a":16,"b":99}`,
			wantStatus: http.StatusOK,
			wantBody:   `{"operation":"sqrt","a":16,"result":4}`,
		},
		{
			name:       "sqrt without b",
			body:       `{"operation":"sqrt","a":9}`,
			wantStatus: http.StatusOK,
			wantBody:   `{"operation":"sqrt","a":9,"result":3}`,
		},
		{
			name:       "empty body",
			body:       ``,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"request body is required"}}`,
		},
		{
			name:       "malformed JSON",
			body:       `{"operation":"add","a":1,`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"request body is not valid JSON"}}`,
		},
		{
			name:       "trailing JSON object",
			body:       `{"operation":"add","a":1,"b":2}{"operation":"add","a":3,"b":4}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"request body must contain a single JSON object"}}`,
		},
		{
			name:       "trailing garbage",
			body:       `{"operation":"add","a":1,"b":2} x`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"request body must contain a single JSON object"}}`,
		},
		{
			name:       "body is not an object",
			body:       `[1,2]`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"request body must be a JSON object"}}`,
		},
		{
			name:       "unknown field",
			body:       `{"operation":"add","a":1,"b":2,"c":3}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"unknown field \"c\""}}`,
		},
		{
			name:       "string instead of number",
			body:       `{"operation":"add","a":"10","b":2}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"field \"a\" has an invalid type"}}`,
		},
		{
			name:       "out of range literal",
			body:       `{"operation":"add","a":1e400,"b":2}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"field \"a\" is out of range"}}`,
		},
		{
			name:       "body too large",
			body:       `{"operation":"add","a":1,"b":2` + strings.Repeat(" ", maxBodyBytes) + `}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"request body must not exceed 4096 bytes"}}`,
		},
		{
			name:       "body too large after a valid object",
			body:       `{"operation":"add","a":1,"b":2}` + strings.Repeat(" ", maxBodyBytes),
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"INVALID_REQUEST","message":"request body must not exceed 4096 bytes"}}`,
		},
		{
			name:       "unknown operation",
			body:       `{"operation":"modulo","a":1,"b":2}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"UNSUPPORTED_OPERATION","message":"unsupported operation: \"modulo\""}}`,
		},
		{
			name:       "uppercase operation",
			body:       `{"operation":"Divide","a":10,"b":2}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":{"code":"UNSUPPORTED_OPERATION","message":"unsupported operation: \"Divide\""}}`,
		},
		{
			name:       "division by zero",
			body:       `{"operation":"divide","a":10,"b":0}`,
			wantStatus: http.StatusUnprocessableEntity,
			wantBody:   `{"error":{"code":"DIVISION_BY_ZERO","message":"cannot divide by zero"}}`,
		},
		{
			name:       "sqrt of negative",
			body:       `{"operation":"sqrt","a":-4}`,
			wantStatus: http.StatusUnprocessableEntity,
			wantBody:   `{"error":{"code":"INVALID_OPERAND","message":"invalid operand: cannot take the square root of a negative number"}}`,
		},
		{
			name:       "result out of range",
			body:       `{"operation":"multiply","a":1e308,"b":10}`,
			wantStatus: http.StatusUnprocessableEntity,
			wantBody:   `{"error":{"code":"RESULT_OUT_OF_RANGE","message":"result out of range"}}`,
		},
	}

	handler := NewHandler(discardLogger())
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/calculate", strings.NewReader(tc.body))
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
			assertJSONResponse(t, rec, tc.wantBody)
		})
	}
}

func TestNegativeZeroOperandsAreNormalized(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		wantBody string
	}{
		{
			name:     "both operands negative zero",
			body:     `{"operation":"add","a":-0,"b":-0}`,
			wantBody: `{"operation":"add","a":0,"b":0,"result":0}`,
		},
		{
			name:     "decimal negative zero",
			body:     `{"operation":"multiply","a":-0.0,"b":5}`,
			wantBody: `{"operation":"multiply","a":0,"b":5,"result":0}`,
		},
		{
			name:     "sqrt of negative zero",
			body:     `{"operation":"sqrt","a":-0}`,
			wantBody: `{"operation":"sqrt","a":0,"result":0}`,
		},
	}

	handler := NewHandler(discardLogger())
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/calculate", strings.NewReader(tc.body)))

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
			}
			// Compared as raw text because 0 and -0 are equal once decoded.
			if got := strings.TrimSpace(rec.Body.String()); got != tc.wantBody {
				t.Errorf("body = %s, want %s", got, tc.wantBody)
			}
		})
	}
}

func TestWriteJSONEncodingFailureReturnsInternalError(t *testing.T) {
	s := &server{logger: discardLogger()}
	rec := httptest.NewRecorder()

	s.writeJSON(rec, http.StatusOK, math.NaN())

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusInternalServerError)
	}
	assertJSONResponse(t, rec, `{"error":{"code":"INTERNAL_ERROR","message":"internal server error"}}`)
}

func TestHealth(t *testing.T) {
	rec := httptest.NewRecorder()
	NewHandler(discardLogger()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	assertJSONResponse(t, rec, `{"status":"ok"}`)
}

func TestWrongMethodUsesDefaultMuxResponse(t *testing.T) {
	rec := httptest.NewRecorder()
	NewHandler(discardLogger()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/calculate", nil))

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
	if allow := rec.Header().Get("Allow"); allow != http.MethodPost {
		t.Errorf("Allow = %q, want %q", allow, http.MethodPost)
	}
}

func TestUnreadableBodyIsInvalidRequest(t *testing.T) {
	body := io.MultiReader(strings.NewReader(`{"operation":"add",`), iotest.ErrReader(errors.New("connection reset")))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/calculate", body)
	rec := httptest.NewRecorder()

	NewHandler(discardLogger()).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
	assertJSONResponse(t, rec, `{"error":{"code":"INVALID_REQUEST","message":"request body is not valid JSON"}}`)
}

func TestWriteErrorMapping(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantBody   string
	}{
		{
			name:       "wrapped calculator error keeps its code",
			err:        fmt.Errorf("%w: extra context", calculator.ErrOutOfRange),
			wantStatus: http.StatusUnprocessableEntity,
			wantBody:   `{"error":{"code":"RESULT_OUT_OF_RANGE","message":"result out of range: extra context"}}`,
		},
		{
			name:       "unknown error becomes an internal error without leaking details",
			err:        errors.New("database password is hunter2"),
			wantStatus: http.StatusInternalServerError,
			wantBody:   `{"error":{"code":"INTERNAL_ERROR","message":"internal server error"}}`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := &server{logger: discardLogger()}
			rec := httptest.NewRecorder()

			s.writeError(rec, tc.err)

			if rec.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
			assertJSONResponse(t, rec, tc.wantBody)
		})
	}
}

func TestRecoverPanicsRepanicsAbortHandler(t *testing.T) {
	s := &server{logger: discardLogger()}
	handler := s.recoverPanics(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic(http.ErrAbortHandler)
	}))

	defer func() {
		if rec := recover(); rec != http.ErrAbortHandler {
			t.Fatalf("recovered %v, want http.ErrAbortHandler to propagate", rec)
		}
	}()
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/health", nil))
}

func TestRecoverPanics(t *testing.T) {
	s := &server{logger: discardLogger()}
	handler := s.recoverPanics(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}))
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/calculate", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusInternalServerError)
	}
	assertJSONResponse(t, rec, `{"error":{"code":"INTERNAL_ERROR","message":"internal server error"}}`)
}

func assertJSONResponse(t *testing.T, rec *httptest.ResponseRecorder, want string) {
	t.Helper()

	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want %q", ct, "application/json")
	}
	var got, wantValue any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("response is not valid JSON: %v; body: %s", err, rec.Body.String())
	}
	if err := json.Unmarshal([]byte(want), &wantValue); err != nil {
		t.Fatalf("invalid expected JSON: %v", err)
	}
	if !reflect.DeepEqual(got, wantValue) {
		t.Errorf("body = %s, want %s", strings.TrimSpace(rec.Body.String()), want)
	}
}
