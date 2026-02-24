package cmd

import (
	"encoding/json"
	"fmt"
	"math/big"
	"strings"

	"github.com/spf13/cobra"

	clierrors "github.com/alchemyplatform/alchemy-cli/internal/errors"
	"github.com/alchemyplatform/alchemy-cli/internal/output"
)

var balanceCmd = &cobra.Command{
	Use:   "balance <address>",
	Short: "Get the ETH balance of an address",
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

		result, err := client.Call("eth_getBalance", []any{address, "latest"})
		if err != nil {
			exitWithError(err)
		}

		var hexBalance string
		if err := json.Unmarshal(result, &hexBalance); err != nil {
			exitWithError(clierrors.New(clierrors.InternalError, "failed to parse balance: "+err.Error(), ""))
		}

		wei := new(big.Int)
		wei.SetString(strings.TrimPrefix(hexBalance, "0x"), 16)

		if output.IsJSONMode() {
			output.PrintJSON(map[string]string{
				"address": address,
				"wei":     wei.String(),
				"eth":     weiToEth(wei),
				"network": resolveNetwork(),
			})
			return
		}

		fmt.Printf("Address: %s\n", address)
		fmt.Printf("Balance: %s ETH\n", weiToEth(wei))
		fmt.Printf("Network: %s\n", resolveNetwork())
	},
}

// weiToEth converts wei to ETH as a decimal string.
func weiToEth(wei *big.Int) string {
	divisor := new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil)
	whole := new(big.Int).Div(wei, divisor)
	remainder := new(big.Int).Mod(wei, divisor)

	if remainder.Sign() == 0 {
		return whole.String() + ".0"
	}

	// Format remainder with leading zeros to 18 digits, then trim trailing zeros
	remStr := fmt.Sprintf("%018s", remainder.String())
	remStr = strings.TrimRight(remStr, "0")

	return whole.String() + "." + remStr
}

func init() {
	balanceCmd.Example = `  # Get ETH balance
  alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

  # Get balance on a specific network
  alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 -n polygon-mainnet`

	rootCmd.AddCommand(balanceCmd)
}
