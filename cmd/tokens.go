package cmd

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	clierrors "github.com/alchemyplatform/alchemy-cli/internal/errors"
	"github.com/alchemyplatform/alchemy-cli/internal/output"
)

var tokensCmd = &cobra.Command{
	Use:   "tokens <address>",
	Short: "List ERC-20 token balances for an address",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		address := args[0]
		if !strings.HasPrefix(address, "0x") {
			exitWithError(clierrors.ErrInvalidArgs("address must start with 0x"))
		}

		client, err := newClientFromFlags()
		if err != nil {
			exitWithError(err)
		}

		result, err := client.Call("alchemy_getTokenBalances", []any{address})
		if err != nil {
			exitWithError(err)
		}

		if output.IsJSONMode() {
			var parsed any
			json.Unmarshal(result, &parsed)
			output.PrintJSON(parsed)
			return
		}

		var resp struct {
			Address       string `json:"address"`
			TokenBalances []struct {
				ContractAddress string `json:"contractAddress"`
				TokenBalance    string `json:"tokenBalance"`
			} `json:"tokenBalances"`
		}
		if err := json.Unmarshal(result, &resp); err != nil {
			exitWithError(clierrors.New(clierrors.InternalError, "failed to parse token response: "+err.Error(), ""))
		}

		fmt.Printf("Token balances for %s\n\n", address)
		nonZero := 0
		for _, tb := range resp.TokenBalances {
			balance := tb.TokenBalance
			if balance == "0x0" || balance == "0x0000000000000000000000000000000000000000000000000000000000000000" {
				continue
			}
			nonZero++
			// Truncate long balances for display
			display := balance
			if len(display) > 20 {
				display = display[:20] + "..."
			}
			fmt.Printf("  %s: %s\n", tb.ContractAddress, display)
		}
		if nonZero == 0 {
			fmt.Println("  No token balances found.")
		}
	},
}

func init() {
	tokensCmd.Example = `  # List token balances
  alchemy tokens 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`

	rootCmd.AddCommand(tokensCmd)
}
