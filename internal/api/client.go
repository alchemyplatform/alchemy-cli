package api

import (
	"net/http"
	"time"
)

// Client holds the configuration for making Alchemy API requests.
type Client struct {
	APIKey     string
	Network    string
	HTTPClient *http.Client
}

// NewClient creates a new API client.
func NewClient(apiKey, network string) *Client {
	return &Client{
		APIKey:  apiKey,
		Network: network,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// RPCURL returns the JSON-RPC endpoint URL for the configured network.
func (c *Client) RPCURL() string {
	return "https://" + c.Network + ".g.alchemy.com/v2/" + c.APIKey
}

// EnhancedURL returns the Enhanced API endpoint URL for the configured network.
func (c *Client) EnhancedURL() string {
	return "https://" + c.Network + ".g.alchemy.com/nft/v3/" + c.APIKey
}
