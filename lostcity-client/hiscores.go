package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type HiscoreEntry struct {
	Rank     int    `json:"rank"`
	Username string `json:"username"`
	Level    int    `json:"level"`
	XP       int    `json:"xp"`
	Type     int    `json:"type"`
}

type HiscoreService struct {
	baseURL string
	client  *http.Client
}

func NewHiscoreService() *HiscoreService {
	return &HiscoreService{client: &http.Client{Timeout: 5 * time.Second}}
}

func (h *HiscoreService) Init() {
	if cfg.HiscoresURL != "" {
		h.baseURL = cfg.HiscoresURL
	} else {
		h.baseURL = fmt.Sprintf("http://%s:%d", cfg.WebHost, cfg.WebPort)
	}
}

// GetHiscores returns the overall hiscores (total level) from the configured
// hiscores webserver.
func (h *HiscoreService) GetHiscores() string {
	return h.fetch("overall", 0)
}

// GetHiscoresByType returns hiscores for a specific skill type from the
// configured hiscores webserver.
func (h *HiscoreService) GetHiscoresByType(skillType int) string {
	return h.fetch(fmt.Sprintf("%d", skillType), skillType)
}

func (h *HiscoreService) fetch(skillParam string, skillType int) string {
	url := fmt.Sprintf("%s/api/hiscores?skill=%s", h.baseURL, skillParam)
	resp, err := h.client.Get(url)
	if err != nil {
		log.Printf("[hiscores] request to %s failed: %v", url, err)
		return "[]"
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[hiscores] reading response from %s failed: %v", url, err)
		return "[]"
	}
	if resp.StatusCode != http.StatusOK {
		log.Printf("[hiscores] %s returned status %d", url, resp.StatusCode)
		return "[]"
	}

	return backfillEntries(body, skillType)
}

// backfillEntries fills in rank/type fields that the remote server may not
// include, so the frontend table (which expects e.rank/e.type) keeps working
// regardless of the remote hiscores API's exact response shape.
func backfillEntries(body []byte, skillType int) string {
	var entries []HiscoreEntry
	if err := json.Unmarshal(body, &entries); err != nil {
		return string(body)
	}
	for i := range entries {
		if entries[i].Rank == 0 {
			entries[i].Rank = i + 1
		}
		if entries[i].Type == 0 {
			entries[i].Type = skillType
		}
	}
	data, err := json.Marshal(entries)
	if err != nil {
		return string(body)
	}
	return string(data)
}
