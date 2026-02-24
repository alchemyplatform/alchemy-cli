package cmd

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	clierrors "github.com/alchemyplatform/alchemy-cli/internal/errors"
	"github.com/alchemyplatform/alchemy-cli/internal/output"
)

var nftsCmd = &cobra.Command{
	Use:   "nfts <address>",
	Short: "List NFTs owned by an address",
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

		result, err := client.CallEnhanced("getNFTsForOwner", map[string]string{
			"owner":    address,
			"withMetadata": "true",
		})
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
			OwnedNfts []struct {
				Contract struct {
					Address string `json:"address"`
					Name    string `json:"name"`
				} `json:"contract"`
				TokenID     string `json:"tokenId"`
				Name        string `json:"name"`
				Description string `json:"description"`
			} `json:"ownedNfts"`
			TotalCount int `json:"totalCount"`
		}
		if err := json.Unmarshal(result, &resp); err != nil {
			exitWithError(clierrors.New(clierrors.InternalError, "failed to parse NFT response: "+err.Error(), ""))
		}

		fmt.Printf("NFTs for %s (%d total)\n\n", address, resp.TotalCount)
		for _, nft := range resp.OwnedNfts {
			name := nft.Name
			if name == "" {
				name = fmt.Sprintf("#%s", nft.TokenID)
			}
			collection := nft.Contract.Name
			if collection == "" {
				collection = nft.Contract.Address
			}
			fmt.Printf("  %s — %s\n", collection, name)
		}
		if len(resp.OwnedNfts) == 0 {
			fmt.Println("  No NFTs found.")
		}
	},
}

func init() {
	nftsCmd.Example = `  # List NFTs for an address
  alchemy nfts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`

	rootCmd.AddCommand(nftsCmd)
}
