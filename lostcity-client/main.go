package main

import (
	"context"
	"embed"
	_ "embed"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
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

// assetProxyHandler serves embedded frontend files from frontend/dist and proxies
// all unrecognised paths (game assets like /crc, /title*, /ondemand.zip) to the
// game web server.
type assetProxyHandler struct {
	distFS       fs.FS
	publicFS     fs.FS
	diskPublicFS fs.FS // live disk override: takes priority over embedded files
	embedded     http.Handler
	proxy        *httputil.ReverseProxy
}

func (h *assetProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/debug-log":
		// Client-side diagnostic logging → terminal
		body, _ := io.ReadAll(io.LimitReader(r.Body, 4096))
		r.Body.Close()
		log.Printf("[client] %s", strings.TrimSpace(string(body)))
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusNoContent)
		return
	case "/client-config.js":
		// Expose runtime config to the frontend (port may differ per user).
		w.Header().Set("Content-Type", "application/javascript")
		fmt.Fprintf(w, "window.SERVER_HOST = 'localhost:%d';\n", cfg.ProxyPort)
		fmt.Fprintf(w, "window.SERVER_SECURED = false;\n")
		fmt.Fprintf(w, "window.WASM_BASE_URL = '';\n")
		fmt.Fprintf(w, "window.AUTO_START_CLIENT = true;\n")
		fmt.Fprintf(w, "window.DISCORD_APP_ID = '%s';\n", cfg.DiscordAppId)

		// HD texture debug hotkeys for the Wails EXE.
		// F6 cycles: normal -> flat -> id-colours -> single-texture -> uv -> normal.
		// Shift+F6 goes backwards. F7 resets to normal.
		fmt.Fprint(w, `
window.HD_TEXTURE_DEBUG_MODE = window.HD_TEXTURE_DEBUG_MODE || 'normal';
(function () {
  if (window.__HD_TEXTURE_DEBUG_KEYS_INSTALLED__) return;
  window.__HD_TEXTURE_DEBUG_KEYS_INSTALLED__ = true;

  const modes = ['normal', 'flat', 'id-colours', 'single-texture', 'uv'];

  function showHdTextureDebugToast(mode) {
    let toast = document.getElementById('hd-texture-debug-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'hd-texture-debug-toast';
      toast.style.position = 'fixed';
      toast.style.left = '12px';
      toast.style.top = '12px';
      toast.style.zIndex = '2147483647';
      toast.style.padding = '8px 10px';
      toast.style.background = 'rgba(0, 0, 0, 0.78)';
      toast.style.color = '#ffff00';
      toast.style.font = '13px monospace';
      toast.style.border = '1px solid rgba(255, 255, 0, 0.8)';
      toast.style.borderRadius = '4px';
      toast.style.pointerEvents = 'none';
      document.documentElement.appendChild(toast);
    }

    toast.textContent = 'HD texture debug: ' + mode + '  (F6 cycle, F7 normal)';
    toast.style.display = 'block';

    clearTimeout(window.__HD_TEXTURE_DEBUG_TOAST_TIMER__);
    window.__HD_TEXTURE_DEBUG_TOAST_TIMER__ = setTimeout(function () {
      toast.style.display = 'none';
    }, 1800);
  }

  function setHdTextureDebugMode(mode) {
    window.HD_TEXTURE_DEBUG_MODE = mode;
    showHdTextureDebugToast(mode);

    // Optional event if your HD renderer wants to listen for instant rebuilds later.
    window.dispatchEvent(new CustomEvent('hd-texture-debug-mode', { detail: mode }));
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'F6') {
      e.preventDefault();
      e.stopPropagation();

      const current = window.HD_TEXTURE_DEBUG_MODE || 'normal';
      const index = Math.max(0, modes.indexOf(current));
      const direction = e.shiftKey ? -1 : 1;
      const next = modes[(index + direction + modes.length) % modes.length];

      setHdTextureDebugMode(next);
      return;
    }

    if (e.key === 'F7') {
      e.preventDefault();
      e.stopPropagation();
      setHdTextureDebugMode('normal');
    }
  }, true);

  window.setHdTextureDebugMode = setHdTextureDebugMode;
})();

(function () {
  if (window.__RS_PERF_OVERLAY_INSTALLED__) return;
  window.__RS_PERF_OVERLAY_INSTALLED__ = true;
  window.RS_PERF_OVERLAY_VISIBLE = window.RS_PERF_OVERLAY_VISIBLE !== false;

  const perf = {
    fps: 0,
    frameMs: 0,
    avgFrameMs: 0,
    drawCallsLastFrame: 0,
    drawCallsThisFrame: 0,
    frames: 0,
    frameMsSum: 0,
    lastFrameTime: performance.now(),
    lastSecondTime: performance.now(),
    rebuildsThisSecond: 0,
    rebuildsPerSecond: 0,
    lastTerrainVertexCount: -1,
    lastModelBatchCount: -1,
    lastTextureAtlasLoadedCount: -1
  };

  function hookWebGlDrawCalls(proto) {
    if (!proto || proto.__RS_DRAW_CALLS_HOOKED__) return;
    proto.__RS_DRAW_CALLS_HOOKED__ = true;

    const drawArrays = proto.drawArrays;
    if (typeof drawArrays === 'function') {
      proto.drawArrays = function () {
        perf.drawCallsThisFrame++;
        return drawArrays.apply(this, arguments);
      };
    }

    const drawElements = proto.drawElements;
    if (typeof drawElements === 'function') {
      proto.drawElements = function () {
        perf.drawCallsThisFrame++;
        return drawElements.apply(this, arguments);
      };
    }
  }

  hookWebGlDrawCalls(window.WebGLRenderingContext && window.WebGLRenderingContext.prototype);
  hookWebGlDrawCalls(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype);

  function ensureOverlay() {
    let el = document.getElementById('rs-perf-debug-overlay');
    if (el) return el;

    el = document.createElement('pre');
    el.id = 'rs-perf-debug-overlay';
    el.style.position = 'fixed';
    el.style.right = '10px';
    el.style.top = '10px';
    el.style.zIndex = '2147483647';
    el.style.margin = '0';
    el.style.padding = '8px 10px';
    el.style.minWidth = '220px';
    el.style.background = 'rgba(0, 0, 0, 0.78)';
    el.style.color = '#00ff66';
    el.style.border = '1px solid rgba(0, 255, 102, 0.8)';
    el.style.borderRadius = '4px';
    el.style.font = '12px Consolas, monospace';
    el.style.lineHeight = '1.35';
    el.style.pointerEvents = 'none';
    el.textContent = 'Perf overlay loading...';
    document.documentElement.appendChild(el);
    return el;
  }

  function updateRebuildCounter(status) {
    if (!status) return;

    const terrainChanged = typeof status.terrainVertexCount === 'number' &&
      perf.lastTerrainVertexCount !== -1 &&
      status.terrainVertexCount !== perf.lastTerrainVertexCount;
    const batchChanged = typeof status.modelBatchCount === 'number' &&
      perf.lastModelBatchCount !== -1 &&
      status.modelBatchCount !== perf.lastModelBatchCount;
    const atlasChanged = typeof status.textureAtlasLoadedCount === 'number' &&
      perf.lastTextureAtlasLoadedCount !== -1 &&
      status.textureAtlasLoadedCount !== perf.lastTextureAtlasLoadedCount;

    if (terrainChanged || batchChanged || atlasChanged) {
      perf.rebuildsThisSecond++;
    }

    if (typeof status.terrainVertexCount === 'number') perf.lastTerrainVertexCount = status.terrainVertexCount;
    if (typeof status.modelBatchCount === 'number') perf.lastModelBatchCount = status.modelBatchCount;
    if (typeof status.textureAtlasLoadedCount === 'number') perf.lastTextureAtlasLoadedCount = status.textureAtlasLoadedCount;
  }

  function renderOverlay() {
    const el = ensureOverlay();
    el.style.display = window.RS_PERF_OVERLAY_VISIBLE ? 'block' : 'none';
    if (!window.RS_PERF_OVERLAY_VISIBLE) return;

    const status = window.HD_RENDERER_STATUS || null;
    updateRebuildCounter(status);

    const visibleObjects = status ? (status.modelDrawCount || 0) : 0;
    const culledObjects = status ? ((status.clippedTriangleCount || 0) + (status.skippedBackfaceCount || 0)) : 0;
    const terrainVerts = status ? (status.terrainVertexCount || 0) : 0;
    const modelVerts = status ? (status.modelVertexCount || 0) : 0;

    el.textContent = [
      'Perf Debug Overlay  (F10 toggle)',
      'FPS: ' + perf.fps,
      'Frame time: ' + perf.frameMs.toFixed(2) + ' ms',
      'Avg frame: ' + perf.avgFrameMs.toFixed(2) + ' ms',
      'Draw calls: ' + perf.drawCallsLastFrame,
      'Visible objects: ' + visibleObjects,
      'Culled objects: ' + culledObjects,
      'Rebuilds/sec: ' + perf.rebuildsPerSecond,
      'Terrain verts: ' + terrainVerts,
      'Model verts: ' + modelVerts,
      'HD: ' + (status ? (status.enabled ? 'enabled' : 'disabled') : 'not ready')
    ].join('\n');
  }

  function tick(now) {
    perf.frameMs = now - perf.lastFrameTime;
    perf.lastFrameTime = now;
    perf.frameMsSum += perf.frameMs;
    perf.frames++;

    perf.drawCallsLastFrame = perf.drawCallsThisFrame;
    perf.drawCallsThisFrame = 0;

    if (now - perf.lastSecondTime >= 1000) {
      perf.fps = perf.frames;
      perf.avgFrameMs = perf.frames > 0 ? perf.frameMsSum / perf.frames : 0;
      perf.frames = 0;
      perf.frameMsSum = 0;
      perf.lastSecondTime = now;
      perf.rebuildsPerSecond = perf.rebuildsThisSecond;
      perf.rebuildsThisSecond = 0;
    }

    renderOverlay();
    requestAnimationFrame(tick);
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'F10') {
      e.preventDefault();
      e.stopPropagation();
      window.RS_PERF_OVERLAY_VISIBLE = !window.RS_PERF_OVERLAY_VISIBLE;
      renderOverlay();
    }
  }, true);

  window.RS_PERF_STATS = perf;
  requestAnimationFrame(tick);
})();
`)
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

	// Disk-based public override takes priority over embedded assets, enabling
	// live client.js edits without rebuilding the binary.
	if h.diskPublicFS != nil && h.isDiskPublic(r.URL.Path) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		http.FileServerFS(h.diskPublicFS).ServeHTTP(w, r)
		return
	}
	if h.isEmbedded(r.URL.Path) {
		h.embedded.ServeHTTP(w, r)
		return
	}
	if h.isPublic(r.URL.Path) {
		http.FileServerFS(h.publicFS).ServeHTTP(w, r)
		return
	}
	h.proxy.ServeHTTP(w, r)
}

// isPublic reports whether the URL path exists as a file in frontend/public.
func (h *assetProxyHandler) isPublic(urlPath string) bool {
	if urlPath == "/" || urlPath == "" {
		return false
	}
	fsPath := strings.TrimPrefix(urlPath, "/")
	f, err := h.publicFS.Open(fsPath)
	if err == nil {
		f.Close()
		return true
	}
	return false
}

// isDiskPublic reports whether the URL path exists in the live disk public dir.
func (h *assetProxyHandler) isDiskPublic(urlPath string) bool {
	if urlPath == "/" || urlPath == "" {
		return false
	}
	fsPath := strings.TrimPrefix(urlPath, "/")
	f, err := h.diskPublicFS.Open(fsPath)
	if err == nil {
		f.Close()
		return true
	}
	return false
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
	publicFS, err := fs.Sub(assets, "frontend/public")
	if err != nil {
		log.Fatalf("failed to sub embedded public FS: %v", err)
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

	// Use a live disk-based public FS so edits to frontend/public/ take effect
	// immediately without rebuilding the binary. Falls back to embedded if the
	// directory doesn't exist (e.g. when running from a different working dir).
	var diskPublicFS fs.FS
	if info, err := os.Stat("frontend/public"); err == nil && info.IsDir() {
		diskPublicFS = os.DirFS("frontend/public")
		log.Printf("[config] disk public override active: frontend/public")
	}

	handler := &assetProxyHandler{
		distFS:       distFS,
		publicFS:     publicFS,
		diskPublicFS: diskPublicFS,
		embedded:     application.AssetFileServerFS(distFS),
		proxy:        proxy,
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
		Title:                  "2004 Singleplayer Progressive",
		Width:                  1280,
		Height:                 720,
		MinWidth:               765,
		MinHeight:              503,
		DevToolsEnabled:        true,
		OpenInspectorOnStartup: false,
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
