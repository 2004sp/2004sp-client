import { canvas } from '#/graphics/Canvas.js';

// ─── Configuration ────────────────────────────────────────────────────────────

export const GAMEPAD_CONFIG = {
    deadzone: 0.18,
    cursorSpeed: 8,           // internal pixels per tick at full deflection
    precisionMultiplier: 0.4, // LT held: cursor runs at this fraction of normal
    repeatDelay: 300,         // ms before held-button auto-repeat starts
    repeatInterval: 100,      // ms between subsequent auto-repeats
};

// ─── Button index constants (Standard Gamepad / XInput mapping) ───────────────

export const BTN = {
    A: 0, B: 1, X: 2, Y: 3,
    LB: 4, RB: 5,
    LT: 6, RT: 7,
    BACK: 8, START: 9,
    L3: 10, R3: 11,
    DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15,
} as const;

// Axis indices in pad.axes[]
const AXIS_LX = 0;
const AXIS_LY = 1;
const AXIS_RX = 2;
const AXIS_RY = 3;

// GameShell.keyHeld indices for camera (ArrowLeft/Right/Up/Down = 1/2/3/4)
const KEY_CAM_LEFT  = 1;
const KEY_CAM_RIGHT = 2;
const KEY_CAM_UP    = 3;
const KEY_CAM_DOWN  = 4;
const KEY_ESCAPE    = 27;

// ─── Host interface (what GamepadInput reads/writes on the Client) ─────────────

export interface GameMenuState {
    open: boolean;
    count: number;
    options: string[];
}

export interface GamepadHost {
    // GameShell public fields
    mouseX: number;
    mouseY: number;
    mouseButton: number;
    keyHeld: number[];
    // GameShell fields promoted to public
    nextMouseClickButton: number;
    nextMouseClickX: number;
    nextMouseClickY: number;
    nextMouseClickTime: number;
    // Client fields / methods
    ingame: boolean;
    cycleTab(delta: number): void;
    executeMenuEntry(index: number): void;
    closeMenu(): void;
    getMenuState(): GameMenuState;
}

// ─── Per-button edge/repeat state ─────────────────────────────────────────────

interface BtnState {
    pressed: boolean;
    justPressed: boolean;
    justReleased: boolean;
    heldSince: number;
    lastRepeat: number;
}

function mkBtn(): BtnState {
    return { pressed: false, justPressed: false, justReleased: false, heldSince: 0, lastRepeat: 0 };
}

// ─── Camera key tracking (to avoid clobbering keyboard camera input) ──────────

const CAM_KEYS = [KEY_CAM_LEFT, KEY_CAM_RIGHT, KEY_CAM_UP, KEY_CAM_DOWN];

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

// ─── GamepadInput ─────────────────────────────────────────────────────────────

export class GamepadInput {
    // ── Controller state ──────────────────────────────────────────────────────
    private gpIndex: number = -1;
    private prevBtns: boolean[] = new Array(16).fill(false) as boolean[];
    private btns: BtnState[] = Array.from({ length: 16 }, mkBtn);
    private axes: number[] = new Array(4).fill(0) as number[];

    // Camera keys currently driven by controller (so we only clear what we set)
    private camActive: Map<number, boolean> = new Map(CAM_KEYS.map(k => [k, false]));

    // ── Virtual cursor (internal coordinate space, 0..canvas.width/height) ────
    private curX: number = 0;
    private curY: number = 0;
    private curVisible: boolean = false;

    // ── Menu navigation ───────────────────────────────────────────────────────
    // menuHL tracks which option index is currently highlighted by D-pad
    // Index menuCount-1 = visual top, 0 = Cancel at bottom
    private menuHL: number = 0;
    private prevMenuOpen: boolean = false;

    // ── Settings (readable/writable from HTML panel) ──────────────────────────
    enabled: boolean = true;
    sensitivity: number = 1.0;
    cameraSensitivity: number = 1.0;
    invertCameraY: boolean = false;

    // ── DOM elements ──────────────────────────────────────────────────────────
    private curEl: HTMLElement;
    private overlayEl: HTMLElement;
    private notifEl: HTMLElement;
    private notifTimer: ReturnType<typeof setTimeout> | null = null;
    private overlayOpen: boolean = false;

    constructor() {
        this.curEl     = this.mkCursor();
        this.overlayEl = this.mkOverlay();
        this.notifEl   = this.mkNotif();
        this.curX = canvas.width  / 2;
        this.curY = canvas.height / 2;
        this.hookEvents();
        this.loadPrefs();
    }

    // ─── DOM construction ─────────────────────────────────────────────────────

    private mkCursor(): HTMLElement {
        const el = document.createElement('div');
        el.id = 'ctrl-cursor';
        Object.assign(el.style, {
            position: 'fixed',
            pointerEvents: 'none',
            zIndex: '9999',
            display: 'none',
            width: '0',
            height: '0',
        } as CSSStyleDeclaration);
        // Classic arrow-cursor SVG
        el.innerHTML = `<svg width="18" height="22" viewBox="0 0 18 22"
            xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block">
            <polygon points="1,1 1,17 5,13 8,19 10.5,18 7.5,12 12,12"
                fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`;
        document.body.appendChild(el);
        return el;
    }

    private mkOverlay(): HTMLElement {
        const el = document.createElement('div');
        el.id = 'ctrl-overlay';
        Object.assign(el.style, {
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            zIndex: '10000',
            display: 'none',
            background: 'rgba(0,0,0,0.9)',
            border: '1px solid #7a5f10',
            color: '#ffd700',
            fontFamily: 'Arial,sans-serif',
            fontSize: '12px',
            padding: '14px 18px',
            minWidth: '240px',
            pointerEvents: 'none',
            lineHeight: '1.4',
        } as CSSStyleDeclaration);
        el.innerHTML = `
            <div style="font-weight:bold;font-size:13px;margin-bottom:10px;
                letter-spacing:2px;text-transform:uppercase;
                border-bottom:1px solid #7a5f10;padding-bottom:8px">
                Controller Bindings
            </div>
            <table style="border-collapse:collapse;color:#ccc;font-size:11px">
                <tr><td style="padding:3px 16px 3px 0;color:#ffd700">Left Stick</td><td>Move cursor</td></tr>
                <tr><td style="padding:3px 16px 3px 0;color:#ffd700">A / RT</td><td>Left click / confirm</td></tr>
                <tr><td style="padding:3px 16px 3px 0;color:#ffd700">B</td><td>Right click / close menu</td></tr>
                <tr><td style="padding:3px 16px 3px 0;color:#ffd700">Right Stick</td><td>Camera</td></tr>
                <tr><td style="padding:3px 16px 3px 0;color:#ffd700">LB / RB</td><td>Cycle sidebar tabs</td></tr>
                <tr><td style="padding:3px 16px 3px 0;color:#ffd700">D-Pad Up/Down</td><td>Navigate menu (when open)</td></tr>
                <tr><td style="padding:3px 16px 3px 0;color:#ffd700">D-Pad</td><td>Coarse cursor movement</td></tr>
                <tr><td style="padding:3px 16px 3px 0;color:#ffd700">LT</td><td>Precision cursor (slow)</td></tr>
                <tr><td style="padding:3px 16px 3px 0;color:#ffd700">Start</td><td>Escape</td></tr>
                <tr><td style="padding:3px 16px 3px 0;color:#ffd700">Back / Select</td><td>Toggle this overlay</td></tr>
                <tr><td style="padding:3px 16px 3px 0;color:#ffd700">L3</td><td>Center cursor</td></tr>
            </table>`;
        document.body.appendChild(el);
        return el;
    }

    private mkNotif(): HTMLElement {
        const el = document.createElement('div');
        el.id = 'ctrl-notif';
        Object.assign(el.style, {
            position: 'fixed',
            bottom: '70px', left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '10001',
            display: 'none',
            background: 'rgba(0,0,0,0.84)',
            border: '1px solid #5a4a1a',
            color: '#ffd700',
            fontFamily: 'Arial,sans-serif',
            fontSize: '11px',
            padding: '5px 14px',
            borderRadius: '2px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
        } as CSSStyleDeclaration);
        document.body.appendChild(el);
        return el;
    }

    private showNotif(msg: string, ms = 2500): void {
        this.notifEl.textContent = msg;
        this.notifEl.style.display = 'block';
        if (this.notifTimer !== null) clearTimeout(this.notifTimer);
        this.notifTimer = setTimeout(() => { this.notifEl.style.display = 'none'; }, ms);
    }

    // ─── Gamepad browser events ───────────────────────────────────────────────

    private hookEvents(): void {
        window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
            if (this.gpIndex === -1) {
                this.gpIndex = e.gamepad.index;
                this.showNotif('Controller connected');
            }
        });
        window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
            if (this.gpIndex === e.gamepad.index) {
                this.gpIndex = -1;
                this.hideCursor();
            }
        });
    }

    // ─── Per-tick logic update ────────────────────────────────────────────────

    update(host: GamepadHost): void {
        if (!this.enabled) {
            // If disabled while camera keys are held by controller, release them
            for (const [k, held] of this.camActive) {
                if (held) { host.keyHeld[k] = 0; this.camActive.set(k, false); }
            }
            return;
        }

        // Discover controller when no connected index (some browsers skip the event)
        if (this.gpIndex === -1) {
            const pads = navigator.getGamepads();
            for (let i = 0; i < pads.length; i++) {
                if (pads[i]) { this.gpIndex = i; break; }
            }
            if (this.gpIndex === -1) return;
        }

        const pad = navigator.getGamepads()[this.gpIndex];
        if (!pad || !pad.connected) {
            this.gpIndex = -1;
            return;
        }

        const now = performance.now();
        this.poll(pad, now);

        // LT value for precision mode
        const ltVal = pad.buttons[BTN.LT]?.value ?? 0;
        const precise = ltVal > 0.5;
        const spd = GAMEPAD_CONFIG.cursorSpeed
            * (precise ? GAMEPAD_CONFIG.precisionMultiplier : 1.0)
            * this.sensitivity;

        // ── Left stick → virtual cursor ───────────────────────────────────────
        const lx = this.dz(this.axes[AXIS_LX]);
        const ly = this.dz(this.axes[AXIS_LY]);

        if (lx !== 0 || ly !== 0) {
            // Slight acceleration when stick is pushed far from centre
            const mag   = Math.min(1.0, Math.sqrt(lx * lx + ly * ly));
            const accel = 0.75 + 0.25 * mag;
            this.curX = clamp(this.curX + lx * spd * accel, 0, canvas.width  - 1);
            this.curY = clamp(this.curY + ly * spd * accel, 0, canvas.height - 1);
            host.mouseX = this.curX | 0;
            host.mouseY = this.curY | 0;
            this.showCursor();
        }

        // ── Right stick → camera (via keyHeld) ────────────────────────────────
        // Only inject camera keys when in-game; camera code only runs then anyway.
        if (host.ingame) {
            const camSpd = this.cameraSensitivity;
            const rx = this.dz(this.axes[AXIS_RX]) * camSpd;
            const ry = this.dz(this.axes[AXIS_RY]) * camSpd * (this.invertCameraY ? -1 : 1);
            this.setCam(host, KEY_CAM_LEFT,  rx < -0.2);
            this.setCam(host, KEY_CAM_RIGHT, rx >  0.2);
            this.setCam(host, KEY_CAM_UP,    ry < -0.2);
            this.setCam(host, KEY_CAM_DOWN,  ry >  0.2);
        }

        // ── Menu state ────────────────────────────────────────────────────────
        const menu = host.getMenuState();

        // Reset highlight to top item whenever menu first opens
        if (menu.open && !this.prevMenuOpen) {
            this.menuHL = Math.max(0, menu.count - 1);
        }
        this.prevMenuOpen = menu.open;

        // ── Button actions ────────────────────────────────────────────────────

        // A / RT  →  left-click or confirm highlighted menu entry
        if (this.jp(BTN.A) || this.jp(BTN.RT)) {
            if (menu.open) {
                host.executeMenuEntry(this.menuHL);
            } else {
                this.click(host, 1);
            }
        }

        // B  →  right-click or close menu
        if (this.jp(BTN.B)) {
            if (menu.open) {
                host.closeMenu();
            } else {
                this.click(host, 2);
            }
        }

        // Start  →  Escape
        if (this.jp(BTN.START)) {
            this.pulseKey(host, KEY_ESCAPE);
        }

        // LB / RB  →  cycle sidebar tabs (in-game only)
        if (host.ingame) {
            if (this.jp(BTN.LB)) host.cycleTab(-1);
            if (this.jp(BTN.RB)) host.cycleTab(1);
        }

        // Back  →  toggle controller overlay
        if (this.jp(BTN.BACK)) {
            this.toggleOverlay();
        }

        // L3  →  centre cursor on game viewport
        if (this.jp(BTN.L3)) {
            this.curX = canvas.width  / 2;
            this.curY = canvas.height / 2;
            host.mouseX = this.curX | 0;
            host.mouseY = this.curY | 0;
            this.showCursor();
        }

        // D-Pad: menu navigation when menu open, coarse cursor movement otherwise
        if (menu.open && menu.count > 0) {
            // clamp in case menu shrank since last tick
            this.menuHL = clamp(this.menuHL, 0, menu.count - 1);

            // Up/Down navigate menu entries (highest index = visual top option)
            if (this.jpr(BTN.DPAD_UP, now)) {
                this.menuHL = Math.min(menu.count - 1, this.menuHL + 1);
                const opt = menu.options[this.menuHL] ?? '';
                this.showNotif('► ' + opt, 1200);
            }
            if (this.jpr(BTN.DPAD_DOWN, now)) {
                this.menuHL = Math.max(0, this.menuHL - 1);
                const opt = menu.options[this.menuHL] ?? '';
                this.showNotif('► ' + opt, 1200);
            }
        } else {
            const step = 32;
            if (this.jpr(BTN.DPAD_UP,    now)) { this.curY = clamp(this.curY - step, 0, canvas.height - 1); host.mouseY = this.curY | 0; this.showCursor(); }
            if (this.jpr(BTN.DPAD_DOWN,  now)) { this.curY = clamp(this.curY + step, 0, canvas.height - 1); host.mouseY = this.curY | 0; this.showCursor(); }
            if (this.jpr(BTN.DPAD_LEFT,  now)) { this.curX = clamp(this.curX - step, 0, canvas.width  - 1); host.mouseX = this.curX | 0; this.showCursor(); }
            if (this.jpr(BTN.DPAD_RIGHT, now)) { this.curX = clamp(this.curX + step, 0, canvas.width  - 1); host.mouseX = this.curX | 0; this.showCursor(); }
        }

        // Keep cursor DOM overlay positioned correctly
        if (this.curVisible) this.moveCursor();
    }

    // Called each render tick to keep DOM cursor aligned (canvas may have scrolled/resized)
    refreshCursor(): void {
        if (this.curVisible) this.moveCursor();
    }

    // Called when the physical mouse moves — hide controller cursor, sync position
    onMouseMove(x: number, y: number): void {
        this.curX = x;
        this.curY = y;
        this.hideCursor();
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    // Poll axes and build per-button edge states
    private poll(pad: Gamepad, now: number): void {
        for (let i = 0; i < Math.min(4, pad.axes.length); i++) {
            this.axes[i] = pad.axes[i];
        }
        for (let i = 0; i < Math.min(16, pad.buttons.length); i++) {
            const on  = pad.buttons[i].pressed || pad.buttons[i].value > 0.5;
            const was = this.prevBtns[i];
            const s   = this.btns[i];
            s.justPressed  = on  && !was;
            s.justReleased = !on && was;
            s.pressed      = on;
            if (s.justPressed) { s.heldSince = now; s.lastRepeat = now; }
            this.prevBtns[i] = on;
        }
    }

    // Apply deadzone and rescale to [0..1]
    private dz(v: number): number {
        const d = GAMEPAD_CONFIG.deadzone;
        if (Math.abs(v) < d) return 0;
        return (v - Math.sign(v) * d) / (1.0 - d);
    }

    // Edge-trigger: true only on the frame the button transitions unpressed→pressed
    private jp(btn: number): boolean {
        return this.btns[btn]?.justPressed ?? false;
    }

    // Edge or auto-repeat: true on press, then again after repeatDelay at repeatInterval
    private jpr(btn: number, now: number): boolean {
        const s = this.btns[btn];
        if (!s?.pressed) return false;
        if (s.justPressed) return true;
        if (now - s.heldSince < GAMEPAD_CONFIG.repeatDelay) return false;
        if (now - s.lastRepeat >= GAMEPAD_CONFIG.repeatInterval) {
            s.lastRepeat = now;
            return true;
        }
        return false;
    }

    // Inject a synthetic mouse click into the game's existing pending-click mechanism
    private click(host: GamepadHost, button: number): void {
        const x = this.curX | 0;
        const y = this.curY | 0;
        // nextMouseClick* is consumed at the start of the next tick (GameShell.run()),
        // so the click will be processed on the following game tick.
        host.nextMouseClickButton = button;
        host.nextMouseClickX      = x;
        host.nextMouseClickY      = y;
        host.nextMouseClickTime   = performance.now();
        host.mouseX     = x;
        host.mouseY     = y;
        host.mouseButton = button;
        // Release the synthetic "held" state after a short delay
        setTimeout(() => { if (host.mouseButton === button) host.mouseButton = 0; }, 60);
    }

    // Set a keyHeld entry for one frame then release it
    private pulseKey(host: GamepadHost, key: number): void {
        host.keyHeld[key] = 1;
        setTimeout(() => { host.keyHeld[key] = 0; }, 60);
    }

    // Drive a camera keyHeld entry; only clears entries that this method set.
    // This prevents accidentally zeroing keyboard camera input.
    private setCam(host: GamepadHost, key: number, active: boolean): void {
        if (active) {
            this.camActive.set(key, true);
            host.keyHeld[key] = 1;
        } else if (this.camActive.get(key)) {
            this.camActive.set(key, false);
            host.keyHeld[key] = 0;
        }
    }

    // ─── Cursor DOM management ────────────────────────────────────────────────

    private showCursor(): void {
        if (!this.curVisible) {
            this.curVisible = true;
            this.curEl.style.display = 'block';
        }
    }

    private hideCursor(): void {
        if (this.curVisible) {
            this.curVisible = false;
            this.curEl.style.display = 'none';
        }
    }

    // Convert internal canvas coords → fixed screen coords and position the div
    private moveCursor(): void {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        // Scale factor: internal pixels → CSS display pixels
        const sx = rect.left + (this.curX / canvas.width)  * rect.width;
        const sy = rect.top  + (this.curY / canvas.height) * rect.height;
        this.curEl.style.left = sx + 'px';
        this.curEl.style.top  = sy + 'px';
    }

    // ─── Overlay ──────────────────────────────────────────────────────────────

    private toggleOverlay(): void {
        this.overlayOpen = !this.overlayOpen;
        this.overlayEl.style.display = this.overlayOpen ? 'block' : 'none';
    }

    // ─── Settings persistence ─────────────────────────────────────────────────

    savePrefs(): void {
        try {
            localStorage.setItem('gamepadPrefs', JSON.stringify({
                enabled:           this.enabled,
                sensitivity:       this.sensitivity,
                cameraSensitivity: this.cameraSensitivity,
                invertCameraY:     this.invertCameraY,
            }));
        } catch (_) { /* storage may be unavailable */ }
    }

    private loadPrefs(): void {
        try {
            const raw = localStorage.getItem('gamepadPrefs');
            if (!raw) return;
            const p = JSON.parse(raw) as Record<string, unknown>;
            if (typeof p['enabled']           === 'boolean') this.enabled           = p['enabled'] as boolean;
            if (typeof p['sensitivity']        === 'number')  this.sensitivity        = p['sensitivity'] as number;
            if (typeof p['cameraSensitivity']  === 'number')  this.cameraSensitivity  = p['cameraSensitivity'] as number;
            if (typeof p['invertCameraY']      === 'boolean') this.invertCameraY      = p['invertCameraY'] as boolean;
        } catch (_) { /* ignore corrupt prefs */ }
    }
}

// Module-level singleton — imported by Client.ts and exposed on window
export const gamepadInput = new GamepadInput();
