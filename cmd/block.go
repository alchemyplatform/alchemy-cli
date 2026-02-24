package cmd

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	clierrors "github.com/alchemyplatform/alchemy-cli/internal/errors"
	"github.com/alchemyplatform/alchemy-cli/internal/output"
)

var blockCmd = &cobra.Command{
	Use:   "block <number|latest>",
	Short: "Get block details by number",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		blockID := args[0]

		// Convert to hex if it's a decimal number
		var blockParam string
		switch {
		case blockID == "latest" || blockID == "earliest" || blockID == "pending":
			blockParam = blockID
		case strings.HasPrefix(blockID, "0x"):
			blockParam = blockID
		default:
			num, err := strconv.ParseUint(blockID, 10, 64)
			if err != nil {
				exitWithError(clierrors.ErrInvalidArgs("block must be a number, hex, or 'latest'"))
			}
			blockParam = fmt.Sprintf("0x%x", num)
		}

		client, err := newClientFromFlags()
		if err != nil {
			exitWithError(err)
		}

		result, err := client.Call("eth_getBlockByNumber", []any{blockParam, false})
		if err != nil {
			exitWithError(err)
		}

		var block map[string]any
		if err := json.Unmarshal(result, &block); err != nil {
			exitWithError(clierrors.New(clierrors.InternalError, "failed to parse block: "+err.Error(), ""))
		}
		if block == nil {
			exitWithError(clierrors.ErrNotFound("block " + blockID))
		}

		if output.IsJSONMode() {
			output.PrintJSON(block)
			return
		}

		// Human-friendly output
		if num, ok := block["number"].(string); ok {
			fmt.Printf("Block:        %s\n", num)
		}
		if hash, ok := block["hash"].(string); ok {
			fmt.Printf("Hash:         %s\n", hash)
		}
		if ts, ok := block["timestamp"].(string); ok {
			fmt.Printf("Timestamp:    %s\n", ts)
		}
		if txs, ok := block["transactions"].([]any); ok {
			fmt.Printf("Transactions: %d\n", len(txs))
		}
		if miner, ok := block["miner"].(string); ok {
			fmt.Printf("Miner:        %s\n", miner)
		}
		if gasUsed, ok := block["gasUsed"].(string); ok {
			fmt.Printf("Gas Used:     %s\n", gasUsed)
		}
		if gasLimit, ok := block["gasLimit"].(string); ok {
			fmt.Printf("Gas Limit:    %s\n", gasLimit)
		}
	},
}

func init() {
	blockCmd.Example = `  # Get latest block
  alchemy block latest

  # Get block by number
  alchemy block 17000000

  # Get block by hex number
  alchemy block 0x1`

	rootCmd.AddCommand(blockCmd)
}
