package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/alchemyplatform/alchemy-cli/internal/output"
)

// Version is set at build time via ldflags.
var Version = "dev"

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the CLI version",
	Args:  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		output.PrintHuman(
			fmt.Sprintf("alchemy-cli %s\n", Version),
			map[string]string{"version": Version},
		)
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}
