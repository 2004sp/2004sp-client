package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
)

// AppConfig holds all user-configurable settings, persisted in config.json
// next to the executable.
type AppConfig struct {
	// DbPath is the path to the 2004scape server's db.sqlite.
	// Leave empty to use auto-detection.
	DbPath string `json:"db_path,omitempty"`

	// WebHost is the hostname or IP address of the game server.
	// Default: "localhost"
	WebHost string `json:"web_host,omitempty"`

	// WebPort is the game server's HTTP/WebSocket port (WEB_PORT in server .env).
	// Default: 80
	WebPort int `json:"web_port,omitempty"`

	// ProxyPort is the local WebSocket proxy port the client connects to.
	// Change this if 43595 conflicts with another process.
	// Default: 43595
	ProxyPort int `json:"proxy_port,omitempty"`
}

var cfg AppConfig

// loadConfig reads config.json from next to the exe, applies defaults for
// any missing fields, and auto-detects db.sqlite if no path is set.
func loadConfig() {
	cfg = AppConfig{
		WebHost:   "localhost",
		WebPort:   80,
		ProxyPort: 43595,
	}

	configPath := filepath.Join(exeDir(), "config.json")
	data, err := os.ReadFile(configPath)
	if err == nil {
		if err := json.Unmarshal(data, &cfg); err != nil {
			log.Printf("[config] could not parse config.json: %v", err)
		}
	}

	// Apply defaults for zero values (omitempty fields).
	if cfg.WebHost == "" {
		cfg.WebHost = "localhost"
	}
	if cfg.WebPort == 0 {
		cfg.WebPort = 80
	}
	if cfg.ProxyPort == 0 {
		cfg.ProxyPort = 43595
	}

	// Auto-detect db.sqlite if not set in config.
	if cfg.DbPath == "" {
		cfg.DbPath = detectDbPath()
	} else {
		if _, err := os.Stat(cfg.DbPath); err != nil {
			log.Printf("[config] db_path not found: %s — trying auto-detect", cfg.DbPath)
			cfg.DbPath = detectDbPath()
		}
	}

	// Always write config.json next to the exe on first run so users can
	// find and edit it (e.g. to set db_path manually).
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		saveConfig()
	}

	log.Printf("[config] web_host=%s  web_port=%d  proxy_port=%d  db=%s",
		cfg.WebHost, cfg.WebPort, cfg.ProxyPort, cfg.DbPath)
}

func saveConfig() {
	configPath := filepath.Join(exeDir(), "config.json")
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return
	}
	if err := os.WriteFile(configPath, data, 0644); err != nil {
		log.Printf("[config] could not save config.json: %v", err)
	}
}

// detectDbPath searches common locations relative to the exe for db.sqlite.
func detectDbPath() string {
	dir := exeDir()
	candidates := []string{
		filepath.Join(dir, "engine", "db.sqlite"),
		filepath.Join(dir, "db.sqlite"),
	}
	for _, p := range candidates {
		abs, _ := filepath.Abs(p)
		if _, err := os.Stat(abs); err == nil {
			log.Printf("[config] auto-detected db.sqlite: %s", abs)
			return abs
		}
	}
	log.Printf("[config] db.sqlite not found — set db_path in config.json")
	return ""
}

// exeDir returns the directory containing the running executable.
func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}
