package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
)

// AppConfig holds all user-configurable settings, persisted in config.json
// next to the executable.
type AppConfig struct {
	// HiscoresURL is the base URL of the server hosting the hiscores JSON API
	// (e.g. "http://localhost" or "https://my2004server.example.com").
	// Leave empty to default to http://{WebHost}:{WebPort}.
	HiscoresURL string `json:"hiscores_url,omitempty"`

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

	// DiscordAppId is the Discord Application ID used for Rich Presence.
	// Create one at https://discord.com/developers/applications and paste it here.
	// Leave empty to disable Discord Rich Presence entirely.
	DiscordAppId string `json:"discord_app_id,omitempty"`

	// AutoOpenHiscores opens the built-in hiscores panel when the desktop client
	// starts. It is the Wails equivalent of NODE_QOL_AUTO_OPEN_HISCORES.
	AutoOpenHiscores bool `json:"auto_open_hiscores"`
}

var cfg AppConfig

const defaultDiscordAppId = "1507449981689270283"

// loadConfig reads config.json from next to the exe and applies defaults for
// any missing fields.
func loadConfig() {
	cfg = AppConfig{
		WebHost:      "localhost",
		WebPort:      80,
		ProxyPort:    43595,
		DiscordAppId: defaultDiscordAppId,
	}

	configPath := filepath.Join(exeDir(), "config.json")
	needsSave := false
	data, err := os.ReadFile(configPath)
	if err == nil {
		if err := json.Unmarshal(data, &cfg); err != nil {
			log.Printf("[config] could not parse config.json: %v", err)
		}
	} else if os.IsNotExist(err) {
		needsSave = true
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
	if cfg.DiscordAppId == "" {
		cfg.DiscordAppId = defaultDiscordAppId
		needsSave = true
	}

	// Always write config.json next to the exe on first run so users can
	// find and edit it (e.g. to set hiscores_url manually).
	if needsSave {
		saveConfig()
	}

	hiscoresURL := cfg.HiscoresURL
	if hiscoresURL == "" {
		hiscoresURL = fmt.Sprintf("http://%s:%d (derived)", cfg.WebHost, cfg.WebPort)
	}
	log.Printf("[config] web_host=%s  web_port=%d  proxy_port=%d  hiscores_url=%s",
		cfg.WebHost, cfg.WebPort, cfg.ProxyPort, hiscoresURL)
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

// autoOpenHiscoresEnabled lets a launcher-provided NODE_QOL_AUTO_OPEN_HISCORES
// override the saved desktop preference. The config field is the persistent
// option for users who launch the Wails app directly.
func autoOpenHiscoresEnabled() bool {
	value, exists := os.LookupEnv("NODE_QOL_AUTO_OPEN_HISCORES")
	if !exists {
		return cfg.AutoOpenHiscores
	}

	enabled, err := strconv.ParseBool(value)
	if err != nil {
		log.Printf("[config] invalid NODE_QOL_AUTO_OPEN_HISCORES value %q; using config.json", value)
		return cfg.AutoOpenHiscores
	}
	return enabled
}

// exeDir returns the directory containing the running executable.
func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}
