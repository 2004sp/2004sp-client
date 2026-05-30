import InputTracking from '#/client/InputTracking.js';
import { CanvasEnabledKeys, KeyCodes } from '#/client/KeyCodes.js';

import { canvas, canvas2d } from '#/dash3d/graphics/Canvas.js';
import Pix3D from '#/dash3d/Pix3D.js';
import PixMap from '#/dash3d/graphics/PixMap.js';

import { sleep } from '#/util/JsUtil.js';

export default abstract class GameShell {
    static cameraZoom: number = 1;
    protected state: number = 0;
    protected deltime: number = 20;
    protected mindel: number = 1;
    protected otim: number[] = new Array(10);
    protected fps: number = 0;
    protected debug: boolean = false;
    protected drawArea: PixMap | null = null;
    protected redrawScreen: boolean = true;
    protected focus: boolean = true;

    public idleTimer: number = performance.now();
    public mouseButton: number = 0;
    public mouseX: number = -1;
    public mouseY: number = -1;
    protected nextMouseClickButton: number = 0;
    protected nextMouseClickX: number = -1;
    protected nextMouseClickY: number = -1;
    public mouseClickButton: number = 0;
    public mouseClickX: number = -1;
    public mouseClickY: number = -1;
    protected nextMouseClickTime: number = 0;
    public mouseClickTime: number = 0;

    public keyHeld: number[] = [];
    protected keyQueue: number[] = [];
    protected keyQueueReadPos: number = 0;
    protected keyQueueWritePos: number = 0;

    /// custom
    protected resizeToFit: boolean = false;
    protected tfps: number = 60;

    /**
     * Fraction of the current 20ms game tick that has elapsed.
     * Game logic remains fixed at 50 TPS; render-only code uses this for 60 FPS smoothing.
     */
    protected tickAlpha: number = 0;

    protected tps: number = 0;
    protected renderFps: number = 0;

    private tickAccumulator: number = 0;
    private lastTickLoopTime: number = 0;
    private lastTickTime: number = 0;
    private tickRunning: boolean = false;

    protected async maininit() { }
    protected async mainloop() { }
    protected async maindraw() { }
    protected refresh() { }

    constructor(resizetoFit: boolean = false) {
        canvas.tabIndex = -1;
        canvas2d.fillStyle = 'black';
        canvas2d.fillRect(0, 0, canvas.width, canvas.height);

        this.resizeToFit = resizetoFit;
        if (this.resizeToFit) {
            this.resize(window.innerWidth, window.innerHeight);
        } else {
            this.resize(canvas.width, canvas.height);
        }
    }

    protected get sWid(): number {
        return canvas.width;
    }

    protected get sHei(): number {
        return canvas.height;
    }

    protected resize(width: number, height: number) {
        canvas.width = width;
        canvas.height = height;
        this.drawArea = new PixMap(width, height);
        Pix3D.setRenderClipping();
    }

    async run() {
        canvas.addEventListener(
            'resize',
            (): void => {
                if (this.resizeToFit) {
                    this.resize(window.innerWidth, window.innerHeight);
                }
            },
            false
        );

        canvas.onfocus = this.onfocus.bind(this);
        canvas.onblur = this.onblur.bind(this);

        canvas.onkeydown = this.onkeydown.bind(this);
        canvas.onkeyup = this.onkeyup.bind(this);
        canvas.onwheel = this.onwheel.bind(this);
        canvas.onmousedown = this.onmousedown.bind(this);
        canvas.onpointerdown = this.onpointerdown.bind(this);
        canvas.onmouseup = this.onmouseup.bind(this);
        canvas.onpointerup = this.onpointerup.bind(this);
        canvas.onpointerenter = this.onpointerenter.bind(this);
        canvas.onpointerleave = this.onpointerleave.bind(this);
        canvas.onpointermove = this.onpointermove.bind(this);
        window.onmouseup = this.windowMouseUp.bind(this);
        window.onmousemove = this.windowMouseMove.bind(this);

        if (this.isTouchDevice) {
            if (this.hasTouchEvents) {
                canvas.ontouchstart = this.ontouchstart.bind(this);
            } else {
                // edge case: we can't control canvas touch action behavior to allow zooming
                // device has a touch screen but browser does not expose touchstart
                canvas.style.touchAction = 'none';
            }
        }

        canvas.oncontextmenu = (e: MouseEvent): void => {
            e.preventDefault();
        };

        window.oncontextmenu = (e: MouseEvent): void => {
            e.preventDefault();
        };

        await this.messageBox('Loading...', 0);
        await this.maininit();

        this.lastTickLoopTime = performance.now();
        this.lastTickTime = this.lastTickLoopTime;
        this.tickAccumulator = 0;

        this.startTickLoop();
        this.startRenderLoop();
    }

    /**
     * Fixed-step game loop. This intentionally runs mainloop at the authentic 50 TPS
     * while renderLoop is free to draw at 60 FPS / display refresh rate.
     */
    protected startTickLoop(): void {
        const maxCatchupTicks = 5;
        let tickCounter = 0;
        let lastTpsUpdate = performance.now();

        const tickLoop = async (): Promise<void> => {
            try {
                if (this.state < 0) {
                    if (this.state === -1) {
                        this.shutdown();
                    }
                    return;
                }

                const now = performance.now();
                let delta = now - this.lastTickLoopTime;
                if (delta > 250) {
                    delta = 250;
                }

                this.lastTickLoopTime = now;
                this.tickAccumulator += delta;

                let updates = 0;
                while (this.tickAccumulator >= this.deltime && updates < maxCatchupTicks && !this.tickRunning) {
                    if (this.state > 0) {
                        this.state--;
                        if (this.state === 0) {
                            this.shutdown();
                            return;
                        }
                    }

                    this.tickRunning = true;

                    try {
                        this.mouseClickButton = this.nextMouseClickButton;
                        this.mouseClickX = this.nextMouseClickX;
                        this.mouseClickY = this.nextMouseClickY;
                        this.mouseClickTime = this.nextMouseClickTime;
                        this.nextMouseClickButton = 0;

                        this.lastTickTime = performance.now();
                        await this.mainloop();
                    } catch (e) {
                        console.error('[GameShell] mainloop failed:', e);
                        fetch('/debug-log', { method: 'POST', body: '[GameShell] mainloop failed: ' + String(e).substring(0, 500) }).catch(() => {});
                    } finally {
                        this.tickRunning = false;
                    }

                    this.tickAccumulator -= this.deltime;
                    updates++;
                    tickCounter++;
                }

                // If the client fell badly behind, drop excess backlog instead of spiral-catching up.
                if (updates >= maxCatchupTicks && this.tickAccumulator >= this.deltime) {
                    this.tickAccumulator = 0;
                }

                if (now - lastTpsUpdate >= 1000) {
                    this.tps = Math.min(tickCounter, Math.round(1000 / this.deltime));
                    tickCounter = 0;
                    lastTpsUpdate = now;
                }
            } catch (e) {
                console.error('[GameShell] tickLoop failed:', e);
                fetch('/debug-log', { method: 'POST', body: '[GameShell] tickLoop failed: ' + String(e).substring(0, 500) }).catch(() => {});
            } finally {
                if (this.state >= 0) {
                    requestAnimationFrame(tickLoop);
                }
            }
        };

        requestAnimationFrame(tickLoop);
    }

    /**
     * Render loop. Draws independently from the fixed 50 TPS game loop and exposes
     * tickAlpha to camera/entity/model rendering for smooth 60 FPS visuals.
     */
    protected startRenderLoop(): void {
        let lastRenderTime = performance.now();
        let renderCounter = 0;
        let lastRenderFpsUpdate = performance.now();

        const renderLoop = async (timestamp: number): Promise<void> => {
            try {
                if (this.state < 0) {
                    return;
                }

                const now = performance.now();
                const fpsLimit = (window as any).clientInstance?.maxRenderFps ?? this.tfps;
                const targetFrameTime = fpsLimit > 0 ? 1000 / fpsLimit : 0;
                const delta = now - lastRenderTime;

                if (targetFrameTime === 0 || delta >= targetFrameTime) {
                    if (targetFrameTime > 0) {
                        lastRenderTime = now - (delta % targetFrameTime);
                    } else {
                        lastRenderTime = now;
                    }

                    this.tickAlpha = Math.max(0, Math.min(1, this.tickAccumulator / this.deltime));

                    try {
                        await this.maindraw();
                    } catch (e) {
                        console.error('[GameShell] maindraw failed:', e);
                        fetch('/debug-log', { method: 'POST', body: '[GameShell] maindraw failed: ' + String(e).substring(0, 500) }).catch(() => {});
                    }

                    renderCounter++;
                    if (now - lastRenderFpsUpdate >= 1000) {
                        this.renderFps = renderCounter;
                        this.fps = this.renderFps;
                        renderCounter = 0;
                        lastRenderFpsUpdate = now;
                    }

                    if (this.debug) {
                        console.log('tickAlpha:' + this.tickAlpha.toFixed(3) + ' fps:' + this.renderFps + ' tps:' + this.tps + ' deltime:' + this.deltime);
                        this.debug = false;
                    }
                }

                // Optional mobile cap support. Normal desktop stays at 60 by default.
                if (this.tfps > 0 && this.tfps < 60) {
                    const wait: number = 1000 / this.tfps - (performance.now() - timestamp);
                    if (wait > 0) {
                        await sleep(wait);
                    }
                }
            } catch (e) {
                console.error('[GameShell] renderLoop failed:', e);
                fetch('/debug-log', { method: 'POST', body: '[GameShell] renderLoop failed: ' + String(e).substring(0, 500) }).catch(() => {});
            } finally {
                if (this.state >= 0) {
                    requestAnimationFrame(renderLoop);
                }
            }
        };

        requestAnimationFrame(renderLoop);
    }

    protected shutdown() {
        this.state = -2;
    }

    protected setFramerate(rate: number) {
        this.deltime = (1000 / rate) | 0;
    }

    protected setTargetedFramerate(rate: number) {
        this.tfps = Math.max(Math.min(60, rate | 0), 0);
    }

    protected start() {
        if (this.state >= 0) {
            this.state = 0;
        }
    }

    protected stop() {
        if (this.state >= 0) {
            this.state = (4000 / this.deltime) | 0;
        }
    }

    protected async messageBox(message: string, progress: number): Promise<void> {
        const width: number = this.sWid;
        const height: number = this.sHei;

        if (this.redrawScreen) {
            canvas2d.fillStyle = 'black';
            canvas2d.fillRect(0, 0, width, height);
            this.redrawScreen = false;
        }

        const y: number = height / 2 - 18;

        // draw full progress bar
        canvas2d.strokeStyle = 'rgb(140, 17, 17)';
        canvas2d.strokeRect(((width / 2) | 0) - 152, y, 304, 34);
        canvas2d.fillStyle = 'rgb(140, 17, 17)';
        canvas2d.fillRect(((width / 2) | 0) - 150, y + 2, progress * 3, 30);

        // cover up progress bar
        canvas2d.fillStyle = 'black';
        canvas2d.fillRect(((width / 2) | 0) - 150 + progress * 3, y + 2, 300 - progress * 3, 30);

        // draw text
        canvas2d.font = 'bold 13px helvetica, sans-serif';
        canvas2d.textAlign = 'center';
        canvas2d.fillStyle = 'white';
        canvas2d.fillText(message, (width / 2) | 0, y + 22);

        await sleep(5); // return a slice of time to the main loop so it can update the progress bar
    }

    // ----

    private onmousedown(e: MouseEvent) {
        if (e.clientX < 0 || e.clientY < 0) {
            return;
        }

        const { x, y } = this.getMousePos(e);

        this.mouseDown(x, y, e);
    }

    private onwheel(e: WheelEvent) {

const ZOOM_STEP = 0.5;
const MIN_ZOOM = 0;
const MAX_ZOOM = 3.0;

if (e.deltaY > 0) {
    GameShell.cameraZoom = Math.min(MAX_ZOOM, GameShell.cameraZoom + ZOOM_STEP);
} else {
    GameShell.cameraZoom = Math.max(MIN_ZOOM, GameShell.cameraZoom - ZOOM_STEP);
}
}


    protected mouseDown(x: number, y: number, e: MouseEvent) {
        this.idleTimer = performance.now();
        this.nextMouseClickX = x;
        this.nextMouseClickY = y;
        this.nextMouseClickTime = performance.now();

        // custom: down event comes before and potentially without move event
        this.mouseX = x;
        this.mouseY = y;

        if (e.button === 2) {
            this.nextMouseClickButton = 2;
            this.mouseButton = 2;
        } else {
            this.nextMouseClickButton = 1;
            this.mouseButton = 1;
        }

        if (InputTracking.active) {
            InputTracking.mousePressed(x, y, e.button, 'mouse');
        }
    }

    private onpointerdown(e: PointerEvent) {
        if (e.clientX < 0 || e.clientY < 0) {
            return;
        }

        const { x, y } = this.getMousePos(e);

        this.pointerDown(x, y, e);
    }

    protected pointerDown(_x: number, _y: number, _e: PointerEvent) {
    }

    private onmouseup(e: MouseEvent) {
        const { x, y } = this.getMousePos(e);

        this.mouseUp(x, y, e);
    }

    protected mouseUp(x: number, y: number, e: MouseEvent) {
        this.idleTimer = performance.now();
        this.mouseButton = 0;

        if (InputTracking.active) {
            InputTracking.mouseReleased(e.button, 'mouse');
        }

        // custom: up event comes before and potentially without move event
        this.mouseX = x;
        this.mouseY = y;
    }

    private onpointerup(e: PointerEvent) {
        const { x, y } = this.getMousePos(e);

        this.pointerUp(x, y, e);
    }

    protected pointerUp(_x: number, _y: number, _e: PointerEvent) {
    }

    private onpointerenter(e: PointerEvent) {
        if (e.clientX < 0 || e.clientY < 0) {
            return;
        }

        const { x, y } = this.getMousePos(e);

        this.pointerEnter(x, y, e);
    }

    protected pointerEnter(x: number, y: number, _e: PointerEvent) {
        this.mouseX = x;
        this.mouseY = y;

        if (InputTracking.active) {
            InputTracking.mouseEntered();
        }
    }

    private onpointerleave(e: PointerEvent) {
        this.pointerLeave(e);
    }

    protected pointerLeave(_e: PointerEvent) {
        this.idleTimer = performance.now();
        this.mouseX = -1;
        this.mouseY = -1;

        if (InputTracking.active) {
            InputTracking.mouseExited();
        }

        // custom: moving off-canvas may have a stuck mouse event
        this.nextMouseClickX = -1;
        this.nextMouseClickY = -1;
        this.nextMouseClickButton = 0;
        this.mouseButton = 0;
    }

    private onpointermove(e: PointerEvent) {
        if (e.clientX < 0 || e.clientY < 0) {
            return;
        }

        const { x, y } = this.getMousePos(e);

        this.pointerMove(x, y, e);
    }

    protected pointerMove(x: number, y: number, e: PointerEvent) {
        this.idleTimer = performance.now();
        this.mouseX = x;
        this.mouseY = y;

        if (InputTracking.active) {
            InputTracking.mouseMoved(x, y, e.pointerType);
        }
    }

    protected windowMouseUp(e: MouseEvent) {
    }

    protected windowMouseMove(e: MouseEvent) {
    }

    private ontouchstart(e: TouchEvent) {
        this.touchStart(e);
    }

    protected touchStart(e: TouchEvent) {
        if (e.touches.length < 2) {
            // 1 touch - prevent natural browser behavior
            // 2+ touches - allow scrolling/zooming
            e.preventDefault();
        }
    }

    private onkeydown(e: KeyboardEvent) {
        this.idleTimer = performance.now();

        const keyCode = KeyCodes.get(e.key);
        if (!keyCode || (e.code.length === 0 && !e.isTrusted)) {
            return;
        }

        let ch: number = keyCode.ch;

        if (e.ctrlKey) {
            if ((ch >= 'A'.charCodeAt(0) && ch <= ']'.charCodeAt(0)) || ch == '_'.charCodeAt(0)) {
                ch -= 'A'.charCodeAt(0) - 1;
            } else if (ch >= 'a'.charCodeAt(0) && ch <= 'z'.charCodeAt(0)) {
                ch -= 'a'.charCodeAt(0) - 1;
            }
        }

        if (ch > 0 && ch < 128) {
            this.keyHeld[ch] = 1;
        }

        if (ch > 4) {
            this.keyQueue[this.keyQueueWritePos] = ch;
            this.keyQueueWritePos = (this.keyQueueWritePos + 1) & 0x7f;
        }

        if (InputTracking.active) {
            InputTracking.keyPressed(ch);
        }

        if (!CanvasEnabledKeys.includes(e.key)) {
            e.preventDefault();
        }
    }

    private onkeyup(e: KeyboardEvent) {
        // if (e.isTrusted && MobileKeyboard.isDisplayed()) {
        //     // physical keyboard started typing, hide virtual
        //     MobileKeyboard.hide();
        //     this.refresh();
        // }

        this.idleTimer = performance.now();

        const keyCode = KeyCodes.get(e.key);
        if (!keyCode || (e.code.length === 0 && !e.isTrusted)) {
            return;
        }

        let ch: number = keyCode.ch;

        if (e.ctrlKey) {
            if ((ch >= 'A'.charCodeAt(0) && ch <= ']'.charCodeAt(0)) || ch == '_'.charCodeAt(0)) {
                ch -= 'A'.charCodeAt(0) - 1;
            } else if (ch >= 'a'.charCodeAt(0) && ch <= 'z'.charCodeAt(0)) {
                ch -= 'a'.charCodeAt(0) - 1;
            }
        }

        if (ch > 0 && ch < 128) {
            this.keyHeld[ch] = 0;
        }

        if (InputTracking.active) {
            InputTracking.keyReleased(ch);
        }

        if (!CanvasEnabledKeys.includes(e.key)) {
            e.preventDefault();
        }
    }

    protected pollKey() {
        let key: number = -1;
        if (this.keyQueueWritePos !== this.keyQueueReadPos) {
            key = this.keyQueue[this.keyQueueReadPos];
            this.keyQueueReadPos = (this.keyQueueReadPos + 1) & 0x7f;
        }
        return key;
    }

    private onfocus(_e: FocusEvent) {
        this.focus = true;
        this.redrawScreen = true;
        this.refresh();

        if (InputTracking.active) {
            InputTracking.focusGained();
        }
    }

    private onblur(_e: FocusEvent) {
        this.focus = false;

        // custom: taken from later version to release all keys
        for (let i = 0; i < 128; i++) {
            this.keyHeld[i] = 0;
        }

        if (InputTracking.active) {
            InputTracking.focusLost();
        }
    }

    // ----

    private get hasTouchEvents() {
        return 'ontouchstart' in window;
    }

    private get isTouchDevice() {
        return (
            this.hasTouchEvents ||
            navigator.maxTouchPoints > 0 ||
            (navigator as any).msMaxTouchPoints > 0
        );
    }

    protected get isMobile(): boolean {
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone|Mobile/i.test(navigator.userAgent)) {
            return true;
        }

        return this.isTouchDevice;
    }

    private isFullScreen() {
        return document.fullscreenElement !== null;
    }

    private getMousePos(e: MouseEvent): { x: number; y: number } {
        const fixedWidth: number = this.sWid;
        const fixedHeight: number = this.sHei;

        const canvasBounds: DOMRect = canvas.getBoundingClientRect();
        const clickLocWithinCanvas = {
            x: e.clientX - canvasBounds.left,
            y: e.clientY - canvasBounds.top
        };
        let x = 0;
        let y = 0;

        if (this.isFullScreen()) {
            // Fullscreen logic will ensure the canvas aspect ratio is
            // preserved, centering the canvas on the screen.
            const gameAspectRatio = fixedWidth / fixedHeight;
            const ourAspectRatio = window.innerWidth / window.innerHeight;

            // Determine whether our aspect ratio is wider than canvas' one.
            const wider = ourAspectRatio >= gameAspectRatio;

            let trueCanvasWidth = 0;
            let trueCanvasHeight = 0;
            let offsetX = 0;
            let offsetY = 0;

            if (wider) {
                // Browser will scale canvas according to _height_.
                trueCanvasWidth = window.innerHeight * gameAspectRatio;
                trueCanvasHeight = window.innerHeight;
                // As such, there will be a gap on the X axis either side.
                offsetX = (window.innerWidth - trueCanvasWidth) / 2;
            } else {
                // Browser will scale canvas according to _width_.
                trueCanvasWidth = window.innerWidth;
                trueCanvasHeight = window.innerWidth / gameAspectRatio;
                // As such, there will be a gap on the Y axis either side.
                offsetY = (window.innerHeight - trueCanvasHeight) / 2;
            }
            const scaleX = fixedWidth / trueCanvasWidth;
            const scaleY = fixedHeight / trueCanvasHeight;
            x = ((clickLocWithinCanvas.x - offsetX) * scaleX) | 0;
            y = ((clickLocWithinCanvas.y - offsetY) * scaleY) | 0;
        } else {
            const scaleX: number = canvas.width / canvasBounds.width;
            const scaleY: number = canvas.height / canvasBounds.height;
            x = (clickLocWithinCanvas.x * scaleX) | 0;
            y = (clickLocWithinCanvas.y * scaleY) | 0;
        }

        // Specifically filter events outside of bounds of canvas; this can
        // happen if fullscreen mode is on due to letterboxing! The result is
        // that the mouse appears to move up/down vertically along X:0 if they
        // move mouse on the black section to the left, vice versa for other
        // sides, depending on aspect ratio.
        if (x < 0) {
            x = 0;
        }

        if (x > fixedWidth) {
            x = fixedWidth;
        }

        if (y < 0) {
            y = 0;
        }

        if (y > fixedHeight) {
            y = fixedHeight;
        }

        return { x, y };
    }
}
