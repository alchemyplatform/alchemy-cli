package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	clierrors "github.com/alchemyplatform/alchemy-cli/internal/errors"
)

// RPCRequest is a JSON-RPC 2.0 request.
type RPCRequest struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  []any  `json:"params"`
	ID      int    `json:"id"`
}

// RPCResponse is a JSON-RPC 2.0 response.
type RPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCErrorDetail `json:"error,omitempty"`
	ID      int             `json:"id"`
}

// RPCErrorDetail holds the error object from a JSON-RPC response.
type RPCErrorDetail struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Call makes a JSON-RPC call and returns the raw result.
func (c *Client) Call(method string, params []any) (json.RawMessage, error) {
	if params == nil {
		params = []any{}
	}

	req := RPCRequest{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
		ID:      1,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, clierrors.New(clierrors.InternalError, err.Error(), "")
	}

	httpReq, err := http.NewRequest("POST", c.RPCURL(), bytes.NewReader(body))
	if err != nil {
		return nil, clierrors.New(clierrors.InternalError, err.Error(), "")
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, clierrors.ErrNetwork(err.Error())
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, clierrors.ErrNetwork(err.Error())
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, clierrors.ErrRateLimited()
	}

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, clierrors.ErrInvalidAPIKey()
	}

	if resp.StatusCode != http.StatusOK {
		return nil, clierrors.ErrNetwork(fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(respBody)))
	}

	var rpcResp RPCResponse
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return nil, clierrors.New(clierrors.InternalError, "failed to parse RPC response: "+err.Error(), "")
	}

	if rpcResp.Error != nil {
		return nil, clierrors.ErrRPC(rpcResp.Error.Code, rpcResp.Error.Message)
	}

	return rpcResp.Result, nil
}

// CallEnhanced makes an HTTP GET to the Alchemy Enhanced API (NFT, etc.).
func (c *Client) CallEnhanced(path string, params map[string]string) (json.RawMessage, error) {
	url := c.EnhancedURL() + "/" + path

	httpReq, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, clierrors.New(clierrors.InternalError, err.Error(), "")
	}

	q := httpReq.URL.Query()
	for k, v := range params {
		q.Set(k, v)
	}
	httpReq.URL.RawQuery = q.Encode()
	httpReq.Header.Set("Accept", "application/json")

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, clierrors.ErrNetwork(err.Error())
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, clierrors.ErrNetwork(err.Error())
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, clierrors.ErrRateLimited()
	}

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, clierrors.ErrInvalidAPIKey()
	}

	if resp.StatusCode != http.StatusOK {
		return nil, clierrors.ErrNetwork(fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(respBody)))
	}

	return json.RawMessage(respBody), nil
}
