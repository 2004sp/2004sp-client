package main

import (
	"encoding/binary"
	"fmt"
	"log"
	"os"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	discordOpHandshake = 0
	discordOpFrame     = 1
	discordOpClose     = 2

	// How long to wait for Discord to respond to a handshake or ack.
	discordReadTimeout = 3 * time.Second
)

// DiscordService manages a connection to the Discord desktop app via its
// local IPC named pipe.  All blocking pipe I/O happens on a dedicated
// background goroutine so HTTP handlers (and therefore the browser) always
// return immediately.
type DiscordService struct {
	mu        sync.Mutex // guards pipe, connected, nonce
	pipe      *os.File
	connected bool
	nonce     int
	clientId  string
	loginTime int64

	// pending is written by UpdateActivity (HTTP handler goroutine) and read
	// by the ioLoop goroutine.  Using atomic.Value keeps it lock-free.
	pending atomic.Value // string — empty means nothing queued
}

// -------------------------------------------------------------------
// Public API — called from HTTP handlers, must return immediately
// -------------------------------------------------------------------

// Connect disconnects any existing session and opens a fresh one.
func (d *DiscordService) Connect(appClientId string) {
	d.mu.Lock()
	d.clientId = appClientId
	d.loginTime = time.Now().Unix()
	d.mu.Unlock()

	// Do all blocking work in the background so the HTTP response is instant.
	go func() {
		d.closeExisting()
		d.tryConnect()
	}()
}

// UpdateActivity queues a Rich Presence update.  Non-blocking.
func (d *DiscordService) UpdateActivity(details, state string) {
	d.mu.Lock()
	conn := d.connected
	d.mu.Unlock()
	if !conn {
		return
	}

	d.mu.Lock()
	d.nonce++
	nonce := d.nonce
	loginTime := d.loginTime
	d.mu.Unlock()

	activity := `{"details":"` + escDiscord(details) + `"` +
		`,"state":"` + escDiscord(state) + `"` +
		`,"timestamps":{"start":` + fmt.Sprintf("%d", loginTime) + `}` +
		`,"assets":{"large_image":"logo","large_text":"LostCity RSPS"}}`
	payload := `{"cmd":"SET_ACTIVITY"` +
		`,"args":{"pid":` + fmt.Sprintf("%d", os.Getpid()) + `,"activity":` + activity + `}` +
		`,"nonce":"` + fmt.Sprintf("%d", nonce) + `"}`
	d.pending.Store(payload)
}

// Disconnect clears presence and closes the pipe.  Non-blocking.
func (d *DiscordService) Disconnect() {
	go d.closeExisting()
}

// -------------------------------------------------------------------
// Internal — all run on background goroutines
// -------------------------------------------------------------------

// closeExisting shuts down any live connection immediately.
func (d *DiscordService) closeExisting() {
	d.mu.Lock()
	f := d.pipe
	d.pipe = nil
	d.connected = false
	d.mu.Unlock()

	d.pending.Store("")

	if f != nil {
		// Best-effort OP_CLOSE; ignore errors — pipe may already be dead.
		done := make(chan struct{}, 1)
		go func() {
			writeDiscordPacket(f, discordOpClose, "{}")
			done <- struct{}{}
		}()
		select {
		case <-done:
		case <-time.After(500 * time.Millisecond):
		}
		f.Close()
		log.Printf("[discord] disconnected")
	}
}

// tryConnect iterates over the Discord pipe numbers until one responds.
func (d *DiscordService) tryConnect() {
	d.mu.Lock()
	clientId := d.clientId
	loginTime := d.loginTime
	d.mu.Unlock()

	for i := 0; i < 10; i++ {
		path := discordPipePath(i)
		f, err := os.OpenFile(path, os.O_RDWR, os.ModeNamedPipe)
		if err != nil {
			continue
		}

		if err := writeDiscordPacket(f, discordOpHandshake,
			`{"v":1,"client_id":"`+clientId+`"}`); err != nil {
			f.Close()
			continue
		}

		// Wait up to discordReadTimeout for the READY packet.
		_, err = readDiscordPacketTimeout(f, discordReadTimeout)
		if err != nil {
			f.Close()
			continue
		}

		d.mu.Lock()
		d.pipe = f
		d.connected = true
		d.loginTime = loginTime
		d.mu.Unlock()

		log.Printf("[discord] connected via %s", path)
		d.ioLoop(f)
		return
	}
	log.Printf("[discord] could not connect to Discord IPC (is Discord running?)")
}

// ioLoop runs on its own goroutine and handles all outgoing activity updates.
func (d *DiscordService) ioLoop(f *os.File) {
	for {
		d.mu.Lock()
		conn := d.connected
		d.mu.Unlock()
		if !conn {
			break
		}

		raw := d.pending.Load()
		payload, _ := raw.(string)
		if payload == "" {
			time.Sleep(50 * time.Millisecond)
			continue
		}
		d.pending.Store("")

		if err := writeDiscordPacket(f, discordOpFrame, payload); err != nil {
			log.Printf("[discord] write error: %v", err)
			d.mu.Lock()
			d.connected = false
			d.pipe = nil
			d.mu.Unlock()
			f.Close()
			return
		}

		// Read the ack with a timeout so a slow Discord doesn't stall the loop.
		hdr, err := readDiscordPacketTimeout(f, discordReadTimeout)
		if err != nil {
			log.Printf("[discord] ack read error: %v", err)
			d.mu.Lock()
			d.connected = false
			d.pipe = nil
			d.mu.Unlock()
			f.Close()
			return
		}
		if hdr[0] == discordOpClose {
			d.mu.Lock()
			d.connected = false
			d.pipe = nil
			d.mu.Unlock()
			f.Close()
			log.Printf("[discord] Discord sent OP_CLOSE")
			return
		}
	}
	f.Close()
	log.Printf("[discord] io loop exited")
}

// -------------------------------------------------------------------
// Pipe helpers
// -------------------------------------------------------------------

// readDiscordPacketTimeout reads one IPC packet, giving up after timeout.
// Because os.File doesn't support SetDeadline on all platforms for named
// pipes, we run the read in a goroutine and use a select with a timer.
func readDiscordPacketTimeout(f *os.File, timeout time.Duration) ([2]int, error) {
	type result struct {
		hdr [2]int
		err error
	}
	ch := make(chan result, 1)
	go func() {
		hdr, err := readDiscordPacket(f)
		ch <- result{hdr, err}
	}()
	select {
	case r := <-ch:
		return r.hdr, r.err
	case <-time.After(timeout):
		// Close the file to unblock the reader goroutine.
		f.Close()
		return [2]int{}, fmt.Errorf("discord read timeout after %s", timeout)
	}
}

func discordPipePath(i int) string {
	if runtime.GOOS == "windows" {
		return fmt.Sprintf(`\\.\pipe\discord-ipc-%d`, i)
	}
	bases := []string{
		os.Getenv("XDG_RUNTIME_DIR"),
		os.Getenv("TMPDIR"),
		"/tmp",
	}
	for _, b := range bases {
		if b != "" {
			return fmt.Sprintf("%s/discord-ipc-%d", b, i)
		}
	}
	return fmt.Sprintf("/tmp/discord-ipc-%d", i)
}

func writeDiscordPacket(f *os.File, opcode int, payload string) error {
	data := []byte(payload)
	hdr := make([]byte, 8)
	binary.LittleEndian.PutUint32(hdr[0:4], uint32(opcode))
	binary.LittleEndian.PutUint32(hdr[4:8], uint32(len(data)))
	if _, err := f.Write(hdr); err != nil {
		return err
	}
	_, err := f.Write(data)
	return err
}

func readDiscordPacket(f *os.File) ([2]int, error) {
	hdr := make([]byte, 8)
	if _, err := readFull(f, hdr); err != nil {
		return [2]int{}, err
	}
	op := int(binary.LittleEndian.Uint32(hdr[0:4]))
	ln := int(binary.LittleEndian.Uint32(hdr[4:8]))
	if ln > 0 && ln <= 65535 {
		body := make([]byte, ln)
		readFull(f, body) //nolint:errcheck
	}
	return [2]int{op, ln}, nil
}

func readFull(f *os.File, buf []byte) (int, error) {
	total := 0
	for total < len(buf) {
		n, err := f.Read(buf[total:])
		total += n
		if err != nil {
			return total, err
		}
	}
	return total, nil
}

func escDiscord(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return s
}
