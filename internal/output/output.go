package output

import (
	"encoding/json"
	"fmt"
	"os"

	"golang.org/x/term"

	clierrors "github.com/alchemyplatform/alchemy-cli/internal/errors"
)

// ForceJSON is set by the --json global flag.
var ForceJSON bool

// Quiet suppresses non-essential output.
var Quiet bool

// Verbose enables debug output.
var Verbose bool

// IsJSONMode returns true if output should be JSON (non-TTY or --json flag).
func IsJSONMode() bool {
	if ForceJSON {
		return true
	}
	return !term.IsTerminal(int(os.Stdout.Fd()))
}

// PrintJSON marshals v to indented JSON and prints it.
func PrintJSON(v any) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		PrintError(clierrors.New(clierrors.InternalError, err.Error(), ""))
		return
	}
	fmt.Println(string(data))
}

// PrintHuman prints a formatted string when in human mode,
// or prints the jsonValue as JSON when in JSON mode.
func PrintHuman(humanText string, jsonValue any) {
	if IsJSONMode() {
		PrintJSON(jsonValue)
	} else {
		fmt.Print(humanText)
	}
}

// PrintError outputs a CLIError in the appropriate format.
func PrintError(err *clierrors.CLIError) {
	if IsJSONMode() {
		fmt.Fprintln(os.Stderr, string(err.JSON()))
	} else {
		fmt.Fprintln(os.Stderr, err.Error())
	}
}

// Debug prints a message only when verbose mode is enabled.
func Debug(format string, args ...any) {
	if Verbose {
		fmt.Fprintf(os.Stderr, "[debug] "+format+"\n", args...)
	}
}
