package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/alchemyplatform/alchemy-cli/internal/api"
	"github.com/alchemyplatform/alchemy-cli/internal/config"
	clierrors "github.com/alchemyplatform/alchemy-cli/internal/errors"
	"github.com/alchemyplatform/alchemy-cli/internal/output"
)

var (
	flagAPIKey  string
	flagNetwork string
	flagJSON    bool
	flagQuiet   bool
	flagVerbose bool
)

var rootCmd = &cobra.Command{
	Use:   "alchemy",
	Short: "Alchemy CLI — interact with blockchain data",
	Long:  `The Alchemy CLI lets you query blockchain data, call JSON-RPC methods, and manage your Alchemy configuration.`,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		output.ForceJSON = flagJSON
		output.Quiet = flagQuiet
		output.Verbose = flagVerbose
	},
}

func init() {
	rootCmd.PersistentFlags().StringVar(&flagAPIKey, "api-key", "", "Alchemy API key (env: ALCHEMY_API_KEY)")
	rootCmd.PersistentFlags().StringVarP(&flagNetwork, "network", "n", "", "Target network (default: eth-mainnet) (env: ALCHEMY_NETWORK)")
	rootCmd.PersistentFlags().BoolVar(&flagJSON, "json", false, "Force JSON output")
	rootCmd.PersistentFlags().BoolVarP(&flagQuiet, "quiet", "q", false, "Suppress non-essential output")
	rootCmd.PersistentFlags().BoolVarP(&flagVerbose, "verbose", "v", false, "Enable debug output")
}

// Execute is the entry point called from main.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

// resolveAPIKey returns the API key from flag → env → config.
func resolveAPIKey() (string, error) {
	if flagAPIKey != "" {
		return flagAPIKey, nil
	}
	if v := os.Getenv("ALCHEMY_API_KEY"); v != "" {
		return v, nil
	}
	cfg, err := config.Load()
	if err != nil {
		return "", err
	}
	if cfg.APIKey != "" {
		return cfg.APIKey, nil
	}
	return "", clierrors.ErrAuthRequired()
}

// resolveNetwork returns the network from flag → env → config → default.
func resolveNetwork() string {
	if flagNetwork != "" {
		return flagNetwork
	}
	if v := os.Getenv("ALCHEMY_NETWORK"); v != "" {
		return v
	}
	cfg, err := config.Load()
	if err == nil && cfg.Network != "" {
		return cfg.Network
	}
	return "eth-mainnet"
}

// newClientFromFlags creates an API client using resolved config.
func newClientFromFlags() (*api.Client, error) {
	apiKey, err := resolveAPIKey()
	if err != nil {
		return nil, err
	}
	network := resolveNetwork()
	output.Debug("using network=%s", network)
	return api.NewClient(apiKey, network), nil
}

// exitWithError prints a CLIError and exits.
func exitWithError(err error) {
	if cliErr, ok := err.(*clierrors.CLIError); ok {
		output.PrintError(cliErr)
	} else {
		output.PrintError(clierrors.New(clierrors.InternalError, err.Error(), ""))
	}
	fmt.Fprintln(os.Stderr)
	os.Exit(1)
}
