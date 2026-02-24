package errors

import (
	"encoding/json"
	"fmt"
)

// Error codes
const (
	AuthRequired  = "AUTH_REQUIRED"
	InvalidAPIKey = "INVALID_API_KEY"
	NetworkError  = "NETWORK_ERROR"
	RPCError      = "RPC_ERROR"
	InvalidArgs   = "INVALID_ARGS"
	NotFound      = "NOT_FOUND"
	RateLimited   = "RATE_LIMITED"
	InternalError = "INTERNAL_ERROR"
)

// CLIError represents a structured error with code, message, and optional hint.
type CLIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Hint    string `json:"hint,omitempty"`
}

func (e *CLIError) Error() string {
	if e.Hint != "" {
		return fmt.Sprintf("%s: %s\nHint: %s", e.Code, e.Message, e.Hint)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// JSON returns the structured JSON representation of the error.
func (e *CLIError) JSON() []byte {
	wrapper := struct {
		Error *CLIError `json:"error"`
	}{Error: e}
	b, _ := json.MarshalIndent(wrapper, "", "  ")
	return b
}

// New creates a new CLIError.
func New(code, message, hint string) *CLIError {
	return &CLIError{Code: code, Message: message, Hint: hint}
}

// Convenience constructors

func ErrAuthRequired() *CLIError {
	return New(AuthRequired,
		"Not authenticated. Set ALCHEMY_API_KEY or run 'alchemy config set api-key <key>'.",
		"alchemy config set api-key <your-key>")
}

func ErrInvalidAPIKey() *CLIError {
	return New(InvalidAPIKey,
		"Invalid API key. Check your key and try again.",
		"alchemy config set api-key <your-key>")
}

func ErrNetwork(detail string) *CLIError {
	return New(NetworkError,
		fmt.Sprintf("Network error: %s", detail),
		"Check your internet connection and try again.")
}

func ErrRPC(code int, message string) *CLIError {
	return New(RPCError,
		fmt.Sprintf("RPC error %d: %s", code, message),
		"")
}

func ErrInvalidArgs(detail string) *CLIError {
	return New(InvalidArgs, detail, "")
}

func ErrNotFound(resource string) *CLIError {
	return New(NotFound,
		fmt.Sprintf("Not found: %s", resource),
		"")
}

func ErrRateLimited() *CLIError {
	return New(RateLimited,
		"Rate limited. Please wait and try again.",
		"Consider upgrading your Alchemy plan for higher rate limits.")
}
