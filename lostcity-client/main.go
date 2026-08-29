package main

import (
	"context"
	"embed"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

var hiscoreService *HiscoreService
var discordService *DiscordService

func init() {
	loadConfig()
	application.RegisterEvent[string]("time")
	hiscoreService = NewHiscoreService()
	hiscoreService.Init()
	discordService = &DiscordService{}
}

// startWSProxy starts a plain HTTP server that accepts WebSocket connections
// from the browser and bridges them to the game server.
// Running as a separate localhost server sidesteps any WebView2 origin restrictions.
func startWSProxy() {
	gameWSURL := fmt.Sprintf("ws://%s:%d", cfg.WebHost, cfg.WebPort)
	proxyAddr := fmt.Sprintf(":%d", cfg.ProxyPort)

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		// Accept the browser's WebSocket connection; allow any origin.
		clientConn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			Subprotocols:       []string{"binary"},
			InsecureSkipVerify: true,
		})
		if err != nil {
			log.Printf("[ws proxy] accept: %v", err)
			return
		}
		defer clientConn.CloseNow()

		// Connect to the game server from Go (no browser Origin header).
		gameConn, _, err := websocket.Dial(ctx, gameWSURL, &websocket.DialOptions{
			Subprotocols: []string{"binary"},
		})
		if err != nil {
			log.Printf("[ws proxy] dial %s: %v", gameWSURL, err)
			clientConn.Close(websocket.StatusBadGateway, "game server unavailable")
			return
		}
		defer gameConn.CloseNow()

		log.Printf("[ws proxy] connected to game server")

		// browser → game
		go func() {
			defer cancel()
			for {
				typ, msg, err := clientConn.Read(ctx)
				if err != nil {
					return
				}
				if err := gameConn.Write(ctx, typ, msg); err != nil {
					return
				}
			}
		}()

		// game → browser
		for {
			typ, msg, err := gameConn.Read(ctx)
			if err != nil {
				return
			}
			if err := clientConn.Write(ctx, typ, msg); err != nil {
				return
			}
		}
	})

	log.Printf("[ws proxy] listening on %s → %s", proxyAddr, gameWSURL)
	if err := http.ListenAndServe(proxyAddr, mux); err != nil {
		log.Printf("[ws proxy] server error: %v", err)
	}
}

var featureFlagsClient = &http.Client{Timeout: 2 * time.Second}

// fetchFeatureFlags asks the game engine for its current NODE_FEATURE_*/NODE_QOL_*
// toggles (see /api/features in the engine's web.ts) and returns them as a raw JSON
// object literal for embedding into window.__customContent. On any failure it
// returns "{}" so features fail closed rather than silently defaulting to enabled.
func fetchFeatureFlags() string {
	url := fmt.Sprintf("http://%s:%d/api/features", cfg.WebHost, cfg.WebPort)
	resp, err := featureFlagsClient.Get(url)
	if err != nil {
		log.Printf("[config] could not fetch feature flags from engine: %v", err)
		return "{}"
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil || resp.StatusCode != http.StatusOK {
		log.Printf("[config] bad response fetching feature flags: status=%d err=%v", resp.StatusCode, err)
		return "{}"
	}

	// Validate it's well-formed JSON before embedding it verbatim into a script tag.
	var flags map[string]bool
	if err := json.Unmarshal(body, &flags); err != nil {
		log.Printf("[config] invalid feature flags JSON from engine: %v", err)
		return "{}"
	}
	return string(body)
}

// assetProxyHandler serves embedded frontend files from frontend/dist and proxies
// all unrecognised paths (game assets like /crc, /title*, /ondemand.zip) to the
// game web server.
type assetProxyHandler struct {
	distFS   fs.FS
	embedded http.Handler
	proxy    *httputil.ReverseProxy
}

func (h *assetProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/client-config.js":
		// Expose runtime config to the frontend (port may differ per user).
		w.Header().Set("Content-Type", "application/javascript")
		fmt.Fprintf(w, "window.SERVER_HOST = 'localhost:%d';\n", cfg.ProxyPort)
		fmt.Fprintf(w, "window.SERVER_SECURED = false;\n")
		fmt.Fprintf(w, "window.WASM_BASE_URL = '';\n")
		fmt.Fprintf(w, "window.AUTO_START_CLIENT = true;\n")
		fmt.Fprintf(w, "window.DISCORD_APP_ID = '%s';\n", cfg.DiscordAppId)
		fmt.Fprintf(w, "window.AUTO_OPEN_HISCORES = %t;\n", autoOpenHiscoresEnabled())
		fmt.Fprintf(w, "window.__customContent = %s;\n", fetchFeatureFlags())
		return

	case "/api/hiscores":
		// Local hiscore API — served directly, never proxied to game server.
		w.Header().Set("Content-Type", "application/json")
		skill := r.URL.Query().Get("skill")
		if skill == "" || skill == "overall" {
			w.Write([]byte(hiscoreService.GetHiscores()))
		} else {
			skillType := 0
			fmt.Sscanf(skill, "%d", &skillType)
			w.Write([]byte(hiscoreService.GetHiscoresByType(skillType)))
		}
		return

	case "/api/discord/connect":
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if cfg.DiscordAppId != "" {
			discordService.Connect(cfg.DiscordAppId)
		}
		w.WriteHeader(http.StatusNoContent)
		return

	case "/api/discord/update":
		w.Header().Set("Access-Control-Allow-Origin", "*")
		details := r.URL.Query().Get("details")
		state := r.URL.Query().Get("state")
		discordService.UpdateActivity(details, state)
		w.WriteHeader(http.StatusNoContent)
		return

	case "/api/discord/disconnect":
		w.Header().Set("Access-Control-Allow-Origin", "*")
		discordService.Disconnect()
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if h.isEmbedded(r.URL.Path) {
		h.embedded.ServeHTTP(w, r)
		return
	}
	h.proxy.ServeHTTP(w, r)
}

// isEmbedded reports whether the URL path exists as a file in frontend/dist.
func (h *assetProxyHandler) isEmbedded(urlPath string) bool {
	if urlPath == "/" || urlPath == "" {
		return true
	}
	if strings.HasPrefix(urlPath, "/_wails") || strings.HasPrefix(urlPath, "/wails") {
		return true
	}
	fsPath := strings.TrimPrefix(urlPath, "/")
	f, err := h.distFS.Open(fsPath)
	if err == nil {
		f.Close()
		return true
	}
	return false
}

func main() {
	// Start the WebSocket proxy in the background before launching the app.
	go startWSProxy()

	distFS, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		log.Fatalf("failed to sub embedded FS: %v", err)
	}

	gameWebURL := fmt.Sprintf("http://%s:%d", cfg.WebHost, cfg.WebPort)
	target, err := url.Parse(gameWebURL)
	if err != nil {
		log.Fatalf("invalid game web URL: %v", err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ModifyResponse = func(resp *http.Response) error {
		if resp.StatusCode >= 400 {
			log.Printf("[proxy] %s %s → %d", resp.Request.Method, resp.Request.URL.Path, resp.StatusCode)
		} else {
			log.Printf("[proxy] %s %s → %d (%d bytes)", resp.Request.Method, resp.Request.URL.Path, resp.StatusCode, resp.ContentLength)
		}
		return nil
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, proxyErr error) {
		log.Printf("[proxy] ERROR %s %s → %v  (is the game server running?)", r.Method, r.URL.Path, proxyErr)
		http.Error(w, "game server unavailable: "+proxyErr.Error(), http.StatusBadGateway)
	}

	handler := &assetProxyHandler{
		distFS:   distFS,
		embedded: application.AssetFileServerFS(distFS),
		proxy:    proxy,
	}

	app := application.New(application.Options{
		Name:        "2004 Singleplayer Progressive",
		Description: "Lost City MMO Client",
		Icon:        appIcon,
		Services: []application.Service{
			application.NewService(&GreetService{}),
			application.NewService(hiscoreService),
		},
		Assets: application.AssetOptions{
			Handler: handler,
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "2004 Singleplayer Progressive",
		Width:     1280,
		Height:    720,
		MinWidth:  765,
		MinHeight: 503,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(0, 0, 0),
		URL:              "/",
	})

	go func() {
		for {
			now := time.Now().Format(time.RFC1123)
			app.Event.Emit("time", now)
			time.Sleep(time.Second)
		}
	}()

	if err = app.Run(); err != nil {
		log.Fatal(err)
	}
}
