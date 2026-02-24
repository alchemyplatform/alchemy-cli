package errors

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCLIError_Error(t *testing.T) {
	err := New(AuthRequired, "not authenticated", "run config set")
	got := err.Error()
	if !strings.Contains(got, "AUTH_REQUIRED") {
		t.Errorf("expected error string to contain code, got: %s", got)
	}
	if !strings.Contains(got, "not authenticated") {
		t.Errorf("expected error string to contain message, got: %s", got)
	}
	if !strings.Contains(got, "run config set") {
		t.Errorf("expected error string to contain hint, got: %s", got)
	}
}

func TestCLIError_ErrorNoHint(t *testing.T) {
	err := New(RPCError, "something failed", "")
	got := err.Error()
	if strings.Contains(got, "Hint") {
		t.Errorf("expected no hint in error string, got: %s", got)
	}
}

func TestCLIError_JSON(t *testing.T) {
	err := New(InvalidAPIKey, "bad key", "check your key")
	data := err.JSON()

	var parsed struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
			Hint    string `json:"hint"`
		} `json:"error"`
	}
	if e := json.Unmarshal(data, &parsed); e != nil {
		t.Fatalf("failed to unmarshal JSON: %v", e)
	}
	if parsed.Error.Code != InvalidAPIKey {
		t.Errorf("expected code %s, got %s", InvalidAPIKey, parsed.Error.Code)
	}
	if parsed.Error.Message != "bad key" {
		t.Errorf("expected message 'bad key', got %s", parsed.Error.Message)
	}
	if parsed.Error.Hint != "check your key" {
		t.Errorf("expected hint 'check your key', got %s", parsed.Error.Hint)
	}
}

func TestConvenienceConstructors(t *testing.T) {
	tests := []struct {
		name string
		err  *CLIError
		code string
	}{
		{"ErrAuthRequired", ErrAuthRequired(), AuthRequired},
		{"ErrInvalidAPIKey", ErrInvalidAPIKey(), InvalidAPIKey},
		{"ErrNetwork", ErrNetwork("timeout"), NetworkError},
		{"ErrRPC", ErrRPC(-32600, "invalid request"), RPCError},
		{"ErrInvalidArgs", ErrInvalidArgs("bad input"), InvalidArgs},
		{"ErrNotFound", ErrNotFound("tx"), NotFound},
		{"ErrRateLimited", ErrRateLimited(), RateLimited},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.err.Code != tt.code {
				t.Errorf("expected code %s, got %s", tt.code, tt.err.Code)
			}
		})
	}
}
