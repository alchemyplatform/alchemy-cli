package cmd

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	clierrors "github.com/alchemyplatform/alchemy-cli/internal/errors"
	"github.com/alchemyplatform/alchemy-cli/internal/output"
)

var txCmd = &cobra.Command{
	Use:   "tx <hash>",
	Short: "Get transaction details by hash",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		hash := args[0]
		if !strings.HasPrefix(hash, "0x") {
			exitWithError(clierrors.ErrInvalidArgs("transaction hash must start with 0x"))
		}

		client, err := newClientFromFlags()
		if err != nil {
			exitWithError(err)
		}

		// Fetch transaction and receipt in sequence
		txResult, err := client.Call("eth_getTransactionByHash", []any{hash})
		if err != nil {
			exitWithError(err)
		}

		var tx map[string]any
		if err := json.Unmarshal(txResult, &tx); err != nil {
			exitWithError(clierrors.New(clierrors.InternalError, "failed to parse transaction: "+err.Error(), ""))
		}
		if tx == nil {
			exitWithError(clierrors.ErrNotFound("transaction " + hash))
		}

		receiptResult, err := client.Call("eth_getTransactionReceipt", []any{hash})
		if err != nil {
			exitWithError(err)
		}

		var receipt map[string]any
		if receiptResult != nil {
			json.Unmarshal(receiptResult, &receipt)
		}

		if output.IsJSONMode() {
			combined := map[string]any{
				"transaction": tx,
				"receipt":     receipt,
			}
			output.PrintJSON(combined)
			return
		}

		// Human-friendly output
		fmt.Printf("Transaction: %s\n", hash)
		if from, ok := tx["from"].(string); ok {
			fmt.Printf("From:        %s\n", from)
		}
		if to, ok := tx["to"].(string); ok {
			fmt.Printf("To:          %s\n", to)
		}
		if value, ok := tx["value"].(string); ok {
			fmt.Printf("Value:       %s (wei)\n", value)
		}
		if blockNum, ok := tx["blockNumber"].(string); ok {
			fmt.Printf("Block:       %s\n", blockNum)
		}
		if receipt != nil {
			if status, ok := receipt["status"].(string); ok {
				if status == "0x1" {
					fmt.Printf("Status:      Success\n")
				} else {
					fmt.Printf("Status:      Failed\n")
				}
			}
			if gasUsed, ok := receipt["gasUsed"].(string); ok {
				fmt.Printf("Gas Used:    %s\n", gasUsed)
			}
		}
	},
}

func init() {
	txCmd.Example = `  # Look up a transaction
  alchemy tx 0xabc123...`

	rootCmd.AddCommand(txCmd)
}
