package calculator

import (
	"errors"
	"math"
	"testing"
)

func TestCalculate(t *testing.T) {
	tests := []struct {
		name    string
		op      string
		a, b    float64
		want    float64
		wantErr error
	}{
		{name: "add positives", op: "add", a: 2, b: 3, want: 5},
		{name: "add negatives", op: "add", a: -2, b: -3, want: -5},
		{name: "add decimals keeps IEEE 754 result", op: "add", a: 0.1, b: 0.2, want: 0.30000000000000004},
		{name: "add zero", op: "add", a: 7, b: 0, want: 7},
		{name: "add overflow", op: "add", a: math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrOutOfRange},

		{name: "subtract positives", op: "subtract", a: 5, b: 3, want: 2},
		{name: "subtract to negative", op: "subtract", a: 3, b: 5, want: -2},
		{name: "subtract decimals", op: "subtract", a: -1.5, b: 2.25, want: -3.75},
		{name: "subtract equal values", op: "subtract", a: 4.5, b: 4.5, want: 0},
		{name: "subtract overflow", op: "subtract", a: -math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrOutOfRange},

		{name: "multiply positives", op: "multiply", a: 6, b: 7, want: 42},
		{name: "multiply mixed signs", op: "multiply", a: -3, b: 4, want: -12},
		{name: "multiply decimals", op: "multiply", a: 1.5, b: -2, want: -3},
		{name: "multiply by zero normalizes negative zero", op: "multiply", a: -5, b: 0, want: 0},
		{name: "multiply overflow to +Inf", op: "multiply", a: 1e308, b: 10, wantErr: ErrOutOfRange},
		{name: "multiply overflow to -Inf", op: "multiply", a: -1e308, b: 10, wantErr: ErrOutOfRange},

		{name: "divide to decimal", op: "divide", a: 10, b: 4, want: 2.5},
		{name: "divide negatives", op: "divide", a: -9, b: 3, want: -3},
		{name: "divide repeating decimal", op: "divide", a: 1, b: 3, want: 0.3333333333333333},
		{name: "divide zero numerator", op: "divide", a: 0, b: 5, want: 0},
		{name: "divide by zero", op: "divide", a: 5, b: 0, wantErr: ErrDivisionByZero},
		{name: "divide zero by zero", op: "divide", a: 0, b: 0, wantErr: ErrDivisionByZero},
		{name: "divide by negative zero", op: "divide", a: 5, b: math.Copysign(0, -1), wantErr: ErrDivisionByZero},
		{name: "divide overflow", op: "divide", a: 1e308, b: 0.1, wantErr: ErrOutOfRange},

		{name: "power integer exponent", op: "power", a: 2, b: 10, want: 1024},
		{name: "power negative exponent", op: "power", a: 2, b: -1, want: 0.5},
		{name: "power fractional exponent", op: "power", a: 4, b: 0.5, want: 2},
		{name: "power negative base odd exponent", op: "power", a: -2, b: 3, want: -8},
		{name: "power negative base even exponent", op: "power", a: -2, b: 2, want: 4},
		{name: "power zero to zero is one", op: "power", a: 0, b: 0, want: 1},
		{name: "power zero base positive exponent", op: "power", a: 0, b: 5, want: 0},
		{name: "power negative base fractional exponent", op: "power", a: -8, b: 0.5, wantErr: ErrInvalidOperand},
		{name: "power zero base negative exponent", op: "power", a: 0, b: -1, wantErr: ErrDivisionByZero},
		{name: "power zero base negative fractional exponent", op: "power", a: 0, b: -0.5, wantErr: ErrDivisionByZero},
		{name: "power overflow", op: "power", a: 10, b: 400, wantErr: ErrOutOfRange},

		{name: "sqrt perfect square", op: "sqrt", a: 9, want: 3},
		{name: "sqrt decimal", op: "sqrt", a: 2.25, want: 1.5},
		{name: "sqrt zero", op: "sqrt", a: 0, want: 0},
		{name: "sqrt negative zero", op: "sqrt", a: math.Copysign(0, -1), want: 0},
		{name: "sqrt ignores b", op: "sqrt", a: 16, b: 99, want: 4},
		{name: "sqrt ignores non-finite b", op: "sqrt", a: 16, b: math.NaN(), want: 4},
		{name: "sqrt of negative", op: "sqrt", a: -4, wantErr: ErrInvalidOperand},

		{name: "percentage basic", op: "percentage", a: 25, b: 80, want: 20},
		{name: "percentage of negative", op: "percentage", a: 50, b: -10, want: -5},
		{name: "percentage over one hundred", op: "percentage", a: 200, b: 50, want: 100},
		{name: "percentage decimal", op: "percentage", a: 12.5, b: 80, want: 10},
		{name: "percentage zero percent", op: "percentage", a: 0, b: 100, want: 0},
		{name: "percentage avoids overflow in a*b", op: "percentage", a: math.Ldexp(100, 1000), b: math.Ldexp(1, 20), want: math.Ldexp(1, 1020)},
		{name: "percentage overflow", op: "percentage", a: 1e308, b: 1e308, wantErr: ErrOutOfRange},

		{name: "unknown operation", op: "modulo", a: 1, b: 2, wantErr: ErrUnsupportedOperation},
		{name: "empty operation", op: "", a: 1, b: 2, wantErr: ErrUnsupportedOperation},
		{name: "operation is case sensitive", op: "Add", a: 1, b: 2, wantErr: ErrUnsupportedOperation},

		{name: "NaN operand", op: "add", a: math.NaN(), b: 1, wantErr: ErrInvalidOperand},
		{name: "infinite operand", op: "multiply", a: 1, b: math.Inf(1), wantErr: ErrInvalidOperand},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Calculate(tc.op, tc.a, tc.b)

			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("Calculate(%q, %v, %v) error = %v, want %v", tc.op, tc.a, tc.b, err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("Calculate(%q, %v, %v) unexpected error: %v", tc.op, tc.a, tc.b, err)
			}
			if got != tc.want || math.Signbit(got) != math.Signbit(tc.want) {
				t.Errorf("Calculate(%q, %v, %v) = %v, want %v", tc.op, tc.a, tc.b, got, tc.want)
			}
		})
	}
}

func TestRequiresB(t *testing.T) {
	tests := []struct {
		op      string
		want    bool
		wantErr error
	}{
		{op: "add", want: true},
		{op: "subtract", want: true},
		{op: "multiply", want: true},
		{op: "divide", want: true},
		{op: "power", want: true},
		{op: "percentage", want: true},
		{op: "sqrt", want: false},
		{op: "modulo", wantErr: ErrUnsupportedOperation},
	}

	for _, tc := range tests {
		t.Run(tc.op, func(t *testing.T) {
			got, err := RequiresB(tc.op)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("RequiresB(%q) error = %v, want %v", tc.op, err, tc.wantErr)
			}
			if got != tc.want {
				t.Errorf("RequiresB(%q) = %v, want %v", tc.op, got, tc.want)
			}
		})
	}
}
