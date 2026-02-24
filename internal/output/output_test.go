package output

import (
	"testing"
)

func TestIsJSONMode_ForceJSON(t *testing.T) {
	ForceJSON = true
	defer func() { ForceJSON = false }()

	if !IsJSONMode() {
		t.Error("expected JSON mode when ForceJSON is true")
	}
}

func TestIsJSONMode_Default(t *testing.T) {
	ForceJSON = false
	// In tests, stdout is not a terminal, so this should return true
	if !IsJSONMode() {
		t.Error("expected JSON mode when stdout is not a terminal")
	}
}
