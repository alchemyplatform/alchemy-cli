package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/alchemyplatform/alchemy-cli/internal/output"
)

// Supported networks — this list can be extended over time.
var supportedNetworks = []map[string]string{
	{"id": "eth-mainnet", "name": "Ethereum Mainnet", "chain": "Ethereum"},
	{"id": "eth-sepolia", "name": "Ethereum Sepolia", "chain": "Ethereum"},
	{"id": "eth-holesky", "name": "Ethereum Holesky", "chain": "Ethereum"},
	{"id": "polygon-mainnet", "name": "Polygon Mainnet", "chain": "Polygon"},
	{"id": "polygon-amoy", "name": "Polygon Amoy", "chain": "Polygon"},
	{"id": "arb-mainnet", "name": "Arbitrum One", "chain": "Arbitrum"},
	{"id": "arb-sepolia", "name": "Arbitrum Sepolia", "chain": "Arbitrum"},
	{"id": "opt-mainnet", "name": "Optimism Mainnet", "chain": "Optimism"},
	{"id": "opt-sepolia", "name": "Optimism Sepolia", "chain": "Optimism"},
	{"id": "base-mainnet", "name": "Base Mainnet", "chain": "Base"},
	{"id": "base-sepolia", "name": "Base Sepolia", "chain": "Base"},
}

var networkCmd = &cobra.Command{
	Use:   "network",
	Short: "Manage networks",
}

var networkListCmd = &cobra.Command{
	Use:   "list",
	Short: "List supported networks",
	Args:  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		if output.IsJSONMode() {
			output.PrintJSON(supportedNetworks)
			return
		}

		current := resolveNetwork()
		fmt.Println("Supported networks:")
		fmt.Println()
		for _, n := range supportedNetworks {
			marker := "  "
			if n["id"] == current {
				marker = "* "
			}
			fmt.Printf("%s%-20s %s\n", marker, n["id"], n["name"])
		}
		fmt.Println()
		fmt.Printf("Current: %s\n", current)
	},
}

func init() {
	networkCmd.AddCommand(networkListCmd)
	rootCmd.AddCommand(networkCmd)
}
