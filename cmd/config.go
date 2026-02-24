package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/alchemyplatform/alchemy-cli/internal/config"
	clierrors "github.com/alchemyplatform/alchemy-cli/internal/errors"
	"github.com/alchemyplatform/alchemy-cli/internal/output"
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Manage CLI configuration",
}

var configSetCmd = &cobra.Command{
	Use:   "set <key> <value>",
	Short: "Set a config value",
	Args:  cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		key, value := args[0], args[1]

		cfg, err := config.Load()
		if err != nil {
			exitWithError(clierrors.New(clierrors.InternalError, "failed to load config: "+err.Error(), ""))
		}

		if !cfg.Set(key, value) {
			exitWithError(clierrors.ErrInvalidArgs(fmt.Sprintf("unknown config key: %s (valid keys: api-key, network)", key)))
		}

		if err := config.Save(cfg); err != nil {
			exitWithError(clierrors.New(clierrors.InternalError, "failed to save config: "+err.Error(), ""))
		}

		output.PrintHuman(fmt.Sprintf("Set %s\n", key), map[string]string{"key": key, "status": "set"})
	},
}

var configGetCmd = &cobra.Command{
	Use:   "get <key>",
	Short: "Get a config value",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		key := args[0]

		cfg, err := config.Load()
		if err != nil {
			exitWithError(clierrors.New(clierrors.InternalError, "failed to load config: "+err.Error(), ""))
		}

		value := cfg.Get(key)
		if value == "" {
			exitWithError(clierrors.ErrNotFound(fmt.Sprintf("config key '%s'", key)))
		}

		output.PrintHuman(value+"\n", map[string]string{"key": key, "value": value})
	},
}

var configListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all config values",
	Args:  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			exitWithError(clierrors.New(clierrors.InternalError, "failed to load config: "+err.Error(), ""))
		}

		m := cfg.ToMap()

		if output.IsJSONMode() {
			output.PrintJSON(m)
			return
		}

		if len(m) == 0 {
			fmt.Println("No configuration set.")
			return
		}
		for k, v := range m {
			fmt.Printf("%s = %s\n", k, v)
		}
	},
}

func init() {
	configCmd.AddCommand(configSetCmd, configGetCmd, configListCmd)
	rootCmd.AddCommand(configCmd)
}
