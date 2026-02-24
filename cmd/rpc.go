package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/alchemyplatform/alchemy-cli/internal/output"
)

var rpcCmd = &cobra.Command{
	Use:   "rpc <method> [params...]",
	Short: "Make a raw JSON-RPC call",
	Long:  `Make a raw JSON-RPC call to the Alchemy API. Params are parsed as JSON values.`,
	Args:  cobra.MinimumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		client, err := newClientFromFlags()
		if err != nil {
			exitWithError(err)
		}

		method := args[0]
		params := make([]any, 0, len(args)-1)
		for _, arg := range args[1:] {
			var v any
			if err := json.Unmarshal([]byte(arg), &v); err != nil {
				// Treat as plain string if not valid JSON
				v = arg
			}
			params = append(params, v)
		}

		output.Debug("rpc %s %v", method, params)

		result, err := client.Call(method, params)
		if err != nil {
			exitWithError(err)
		}

		if output.IsJSONMode() {
			// Print the raw JSON result
			fmt.Println(string(result))
			return
		}

		// Pretty-print for humans
		var pretty any
		if err := json.Unmarshal(result, &pretty); err != nil {
			fmt.Println(string(result))
			return
		}
		formatted, err := json.MarshalIndent(pretty, "", "  ")
		if err != nil {
			fmt.Println(string(result))
			return
		}
		fmt.Println(string(formatted))
	},
}

func init() {
	rpcCmd.Example = `  # Get the latest block number
  alchemy rpc eth_blockNumber

  # Get balance for an address
  alchemy rpc eth_getBalance "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" "latest"

  # Get a block by number
  alchemy rpc eth_getBlockByNumber "0x1" true`

	rootCmd.AddCommand(rpcCmd)
}
