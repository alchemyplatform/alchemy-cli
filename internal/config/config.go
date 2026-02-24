package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

const (
	configDir  = ".config/alchemy"
	configFile = "config.json"
)

// Config holds the CLI configuration values.
type Config struct {
	APIKey  string `json:"api_key,omitempty"`
	Network string `json:"network,omitempty"`
}

// Path returns the full path to the config file.
func Path() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, configDir, configFile), nil
}

// Load reads the config file from disk. Returns a zero Config if the file doesn't exist.
func Load() (*Config, error) {
	p, err := Path()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return &Config{}, nil
		}
		return nil, err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// Save writes the config to disk with restricted permissions.
func Save(cfg *Config) error {
	p, err := Path()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(p, data, 0600)
}

// Get returns the value for a config key.
func (c *Config) Get(key string) string {
	switch key {
	case "api-key", "api_key":
		return c.APIKey
	case "network":
		return c.Network
	default:
		return ""
	}
}

// Set sets a config key to the given value. Returns false if the key is unknown.
func (c *Config) Set(key, value string) bool {
	switch key {
	case "api-key", "api_key":
		c.APIKey = value
	case "network":
		c.Network = value
	default:
		return false
	}
	return true
}

// ToMap returns the config as a string map (for listing).
func (c *Config) ToMap() map[string]string {
	m := make(map[string]string)
	if c.APIKey != "" {
		m["api_key"] = c.APIKey
	}
	if c.Network != "" {
		m["network"] = c.Network
	}
	return m
}
