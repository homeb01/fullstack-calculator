package calculator

import (
	"errors"
	"fmt"
	"math"
)

var (
	ErrDivisionByZero       = errors.New("cannot divide by zero")
	ErrInvalidOperand       = errors.New("invalid operand")
	ErrOutOfRange           = errors.New("result out of range")
	ErrUnsupportedOperation = errors.New("unsupported operation")
)

type operation struct {
	fn        func(a, b float64) (float64, error)
	requiresB bool
}

var operations = map[string]operation{
	"add":        {fn: add, requiresB: true},
	"subtract":   {fn: subtract, requiresB: true},
	"multiply":   {fn: multiply, requiresB: true},
	"divide":     {fn: divide, requiresB: true},
	"power":      {fn: power, requiresB: true},
	"sqrt":       {fn: sqrt, requiresB: false},
	"percentage": {fn: percentage, requiresB: true},
}

func RequiresB(op string) (bool, error) {
	o, ok := operations[op]
	if !ok {
		return false, ErrUnsupportedOperation
	}
	return o.requiresB, nil
}

// Calculate ignores b for operations that do not require it.
func Calculate(op string, a, b float64) (float64, error) {
	o, ok := operations[op]
	if !ok {
		return 0, ErrUnsupportedOperation
	}
	if !isFinite(a) || (o.requiresB && !isFinite(b)) {
		return 0, fmt.Errorf("%w: operands must be finite numbers", ErrInvalidOperand)
	}

	result, err := o.fn(a, b)
	if err != nil {
		return 0, err
	}
	if !isFinite(result) {
		return 0, ErrOutOfRange
	}
	// Normalize -0 so clients never receive "-0".
	if result == 0 {
		return 0, nil
	}
	return result, nil
}

func isFinite(x float64) bool {
	return !math.IsInf(x, 0) && !math.IsNaN(x)
}

func add(a, b float64) (float64, error) {
	return a + b, nil
}

func subtract(a, b float64) (float64, error) {
	return a - b, nil
}

func multiply(a, b float64) (float64, error) {
	return a * b, nil
}

func divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, ErrDivisionByZero
	}
	return a / b, nil
}

// 0^0 is defined as 1. A zero base with a negative exponent is a division by zero.
// A negative base needs an integer exponent, since the result would otherwise be complex.
func power(a, b float64) (float64, error) {
	if a == 0 && b < 0 {
		return 0, ErrDivisionByZero
	}
	if a < 0 && b != math.Trunc(b) {
		return 0, fmt.Errorf("%w: negative base requires an integer exponent", ErrInvalidOperand)
	}
	return math.Pow(a, b), nil
}

func sqrt(a, _ float64) (float64, error) {
	if a < 0 {
		return 0, fmt.Errorf("%w: cannot take the square root of a negative number", ErrInvalidOperand)
	}
	return math.Sqrt(a), nil
}

// Returns a% of b. Dividing first lowers the risk of overflow in a*b.
func percentage(a, b float64) (float64, error) {
	return (a / 100) * b, nil
}
