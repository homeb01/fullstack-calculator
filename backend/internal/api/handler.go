package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"

	"fullstack-calculator/backend/internal/calculator"
)

const maxBodyBytes = 4 << 10

type calculateRequest struct {
	Operation string   `json:"operation"`
	A         *float64 `json:"a"`
	B         *float64 `json:"b"`
}

type calculateResponse struct {
	Operation string   `json:"operation"`
	A         float64  `json:"a"`
	B         *float64 `json:"b,omitempty"`
	Result    float64  `json:"result"`
}

type errorResponse struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type requestError struct {
	message string
}

func (e *requestError) Error() string {
	return e.message
}

func invalidRequest(format string, args ...any) error {
	return &requestError{message: fmt.Sprintf(format, args...)}
}

var calculatorErrors = []struct {
	target error
	status int
	code   string
}{
	{calculator.ErrUnsupportedOperation, http.StatusBadRequest, "UNSUPPORTED_OPERATION"},
	{calculator.ErrDivisionByZero, http.StatusUnprocessableEntity, "DIVISION_BY_ZERO"},
	{calculator.ErrInvalidOperand, http.StatusUnprocessableEntity, "INVALID_OPERAND"},
	{calculator.ErrOutOfRange, http.StatusUnprocessableEntity, "RESULT_OUT_OF_RANGE"},
}

type server struct {
	logger *slog.Logger
}

func NewHandler(logger *slog.Logger) http.Handler {
	s := &server{logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/calculate", s.handleCalculate)
	mux.HandleFunc("GET /health", s.handleHealth)
	return s.recoverPanics(mux)
}

func (s *server) handleCalculate(w http.ResponseWriter, r *http.Request) {
	req, err := decodeRequest(w, r)
	if err != nil {
		s.writeError(w, err)
		return
	}
	b, err := req.validate()
	if err != nil {
		s.writeError(w, err)
		return
	}

	a := normalizeZero(*req.A)
	var bValue float64
	if b != nil {
		bValue = normalizeZero(*b)
		b = &bValue
	}
	result, err := calculator.Calculate(req.Operation, a, bValue)
	if err != nil {
		s.writeError(w, err)
		return
	}

	s.writeJSON(w, http.StatusOK, calculateResponse{
		Operation: req.Operation,
		A:         a,
		B:         b,
		Result:    result,
	})
}

// Echoed operands follow the same rule as results: clients never receive "-0".
func normalizeZero(x float64) float64 {
	if x == 0 {
		return 0
	}
	return x
}

func (s *server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func decodeRequest(w http.ResponseWriter, r *http.Request) (calculateRequest, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var req calculateRequest
	if err := dec.Decode(&req); err != nil {
		return req, decodeError(err)
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return req, decodeError(err)
		}
		return req, invalidRequest("request body must contain a single JSON object")
	}
	return req, nil
}

func decodeError(err error) error {
	var syntaxErr *json.SyntaxError
	var typeErr *json.UnmarshalTypeError
	var maxErr *http.MaxBytesError

	switch {
	case errors.Is(err, io.EOF):
		return invalidRequest("request body is required")
	case errors.As(err, &maxErr):
		return invalidRequest("request body must not exceed %d bytes", maxErr.Limit)
	case errors.As(err, &syntaxErr), errors.Is(err, io.ErrUnexpectedEOF):
		return invalidRequest("request body is not valid JSON")
	case errors.As(err, &typeErr) && typeErr.Field == "":
		return invalidRequest("request body must be a JSON object")
	case errors.As(err, &typeErr) && strings.HasPrefix(typeErr.Value, "number"):
		return invalidRequest("field %q is out of range", typeErr.Field)
	case errors.As(err, &typeErr):
		return invalidRequest("field %q has an invalid type", typeErr.Field)
	case strings.HasPrefix(err.Error(), "json: unknown field "):
		return invalidRequest("%s", strings.TrimPrefix(err.Error(), "json: "))
	default:
		return invalidRequest("request body is not valid JSON")
	}
}

// validate returns b only when the operation uses it, so it is echoed back only then.
func (req calculateRequest) validate() (*float64, error) {
	if req.Operation == "" {
		return nil, invalidRequest("field \"operation\" is required")
	}
	needsB, err := calculator.RequiresB(req.Operation)
	if err != nil {
		return nil, fmt.Errorf("%w: %q", err, req.Operation)
	}
	if req.A == nil {
		return nil, invalidRequest("field \"a\" is required")
	}
	if !needsB {
		return nil, nil
	}
	if req.B == nil {
		return nil, invalidRequest("field \"b\" is required for operation %q", req.Operation)
	}
	return req.B, nil
}

func (s *server) writeError(w http.ResponseWriter, err error) {
	var reqErr *requestError
	if errors.As(err, &reqErr) {
		s.writeJSON(w, http.StatusBadRequest, newErrorResponse("INVALID_REQUEST", reqErr.message))
		return
	}
	for _, m := range calculatorErrors {
		if errors.Is(err, m.target) {
			s.writeJSON(w, m.status, newErrorResponse(m.code, err.Error()))
			return
		}
	}
	s.logger.Error("unexpected error", "error", err)
	s.writeInternalError(w)
}

var internalErrorResponse = newErrorResponse("INTERNAL_ERROR", "internal server error")

func (s *server) writeInternalError(w http.ResponseWriter) {
	s.writeJSON(w, http.StatusInternalServerError, internalErrorResponse)
}

func newErrorResponse(code, message string) errorResponse {
	return errorResponse{Error: errorDetail{Code: code, Message: message}}
}

func (s *server) writeJSON(w http.ResponseWriter, status int, body any) {
	data, err := json.Marshal(body)
	if err != nil {
		s.logger.Error("failed to encode response", "error", err)
		status = http.StatusInternalServerError
		data, _ = json.Marshal(internalErrorResponse)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if _, err := w.Write(append(data, '\n')); err != nil {
		s.logger.Error("failed to write response", "error", err)
	}
}

func (s *server) recoverPanics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}
			if rec == http.ErrAbortHandler {
				panic(rec)
			}
			s.logger.Error("panic recovered",
				"panic", rec,
				"method", r.Method,
				"path", r.URL.Path,
				"stack", string(debug.Stack()),
			)
			s.writeInternalError(w)
		}()
		next.ServeHTTP(w, r)
	})
}
