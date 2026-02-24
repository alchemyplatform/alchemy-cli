package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestConfig_SetGet(t *testing.T) {
	cfg := &Config{}

	if !cfg.Set("api-key", "test123") {
		t.Fatal("Set api-key should return true")
	}
	if got := cfg.Get("api-key"); got != "test123" {
		t.Errorf("expected test123, got %s", got)
	}

	if !cfg.Set("network", "polygon-mainnet") {
		t.Fatal("Set network should return true")
	}
	if got := cfg.Get("network"); got != "polygon-mainnet" {
		t.Errorf("expected polygon-mainnet, got %s", got)
	}

	// Underscore variant
	if got := cfg.Get("api_key"); got != "test123" {
		t.Errorf("expected test123 via api_key, got %s", got)
	}
}

func TestConfig_SetUnknownKey(t *testing.T) {
	cfg := &Config{}
	if cfg.Set("unknown", "value") {
		t.Error("Set should return false for unknown key")
	}
}

func TestConfig_GetUnknownKey(t *testing.T) {
	cfg := &Config{}
	if got := cfg.Get("unknown"); got != "" {
		t.Errorf("expected empty string for unknown key, got %s", got)
	}
}

func TestConfig_ToMap(t *testing.T) {
	cfg := &Config{APIKey: "key1", Network: "eth-mainnet"}
	m := cfg.ToMap()
	if m["api_key"] != "key1" {
		t.Errorf("expected key1, got %s", m["api_key"])
	}
	if m["network"] != "eth-mainnet" {
		t.Errorf("expected eth-mainnet, got %s", m["network"])
	}
}

func TestConfig_ToMapEmpty(t *testing.T) {
	cfg := &Config{}
	m := cfg.ToMap()
	if len(m) != 0 {
		t.Errorf("expected empty map, got %v", m)
	}
}

func TestConfig_SaveLoad(t *testing.T) {
	// Use a temp dir to avoid touching real config
	tmpDir := t.TempDir()
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", tmpDir)
	defer os.Setenv("HOME", origHome)

	cfg := &Config{APIKey: "testkey", Network: "eth-sepolia"}
	if err := Save(cfg); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Verify file permissions
	p := filepath.Join(tmpDir, configDir, configFile)
	info, err := os.Stat(p)
	if err != nil {
		t.Fatalf("Stat failed: %v", err)
	}
	if info.Mode().Perm() != 0600 {
		t.Errorf("expected permissions 0600, got %o", info.Mode().Perm())
	}

	// Verify file content is valid JSON
	data, _ := os.ReadFile(p)
	var raw map[string]string
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("config file is not valid JSON: %v", err)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if loaded.APIKey != "testkey" {
		t.Errorf("expected APIKey testkey, got %s", loaded.APIKey)
	}
	if loaded.Network != "eth-sepolia" {
		t.Errorf("expected Network eth-sepolia, got %s", loaded.Network)
	}
}

func TestConfig_LoadNonExistent(t *testing.T) {
	tmpDir := t.TempDir()
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", tmpDir)
	defer os.Setenv("HOME", origHome)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load should not error for missing file: %v", err)
	}
	if cfg.APIKey != "" || cfg.Network != "" {
		t.Error("expected zero Config for missing file")
	}
}
