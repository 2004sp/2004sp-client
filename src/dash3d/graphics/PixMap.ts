import { canvas2d } from '#/dash3d/graphics/Canvas.js';
import Pix2D from '#/dash3d/graphics/Pix2D.js';

export default class PixMap {
    readonly data: Int32Array;
    private static keyedCanvas: HTMLCanvasElement | null = null;
    private static keyedCtx: CanvasRenderingContext2D | null = null;
    private readonly width: number;
    private readonly height: number;
    private readonly img: ImageData;

    private readonly ctx: CanvasRenderingContext2D;
    private readonly paint: Uint32Array;

    constructor(width: number, height: number, ctx: CanvasRenderingContext2D = canvas2d) {
        this.width = width;
        this.height = height;
        this.data = new Int32Array(width * height);

        this.ctx = ctx;
        this.img = this.ctx.createImageData(width, height);
        this.paint = new Uint32Array(this.img.data.buffer);

        this.setPixels();
    }

    setPixels(): void {
        Pix2D.setPixels(this.data, this.width, this.height);
    }

    draw(x: number, y: number): void {
        this.prepareCanvas();
        this.ctx.putImageData(this.img, x, y);
    }

    drawKeyed(x: number, y: number, transparentRgb: number): void {
        this.prepareCanvas(transparentRgb & 0xffffff);
        const scratch = this.keyedCanvas();
        if (!scratch) {
            this.ctx.putImageData(this.img, x, y);
            return;
        }

        scratch.ctx.putImageData(this.img, 0, 0);
        this.ctx.drawImage(scratch.canvas, x, y);
    }

    private keyedCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
        if (!PixMap.keyedCanvas) {
            PixMap.keyedCanvas = document.createElement('canvas');
            PixMap.keyedCtx = PixMap.keyedCanvas.getContext('2d');
        }

        const canvas = PixMap.keyedCanvas;
        const ctx = PixMap.keyedCtx;
        if (!canvas || !ctx) {
            return null;
        }

        if (canvas.width !== this.width) {
            canvas.width = this.width;
        }
        if (canvas.height !== this.height) {
            canvas.height = this.height;
        }

        return { canvas, ctx };
    }

    private prepareCanvas(transparentRgb: number = -1): void {
        const data = this.data;
        const paint = this.paint;
        const len = data.length;
        const keyed = transparentRgb >= 0;

        let i = 0;
        const unroll = len - (len % 4);

        for (; i < unroll; i += 4) {
            const p0 = data[i];
            const p1 = data[i + 1];
            const p2 = data[i + 2];
            const p3 = data[i + 3];

            paint[i] = keyed && (p0 & 0xffffff) === transparentRgb ? 0 : ((p0 & 0xff0000) >> 16) | (p0 & 0xff00) | ((p0 & 0xff) << 16) | 0xff000000;
            paint[i + 1] = keyed && (p1 & 0xffffff) === transparentRgb ? 0 : ((p1 & 0xff0000) >> 16) | (p1 & 0xff00) | ((p1 & 0xff) << 16) | 0xff000000;
            paint[i + 2] = keyed && (p2 & 0xffffff) === transparentRgb ? 0 : ((p2 & 0xff0000) >> 16) | (p2 & 0xff00) | ((p2 & 0xff) << 16) | 0xff000000;
            paint[i + 3] = keyed && (p3 & 0xffffff) === transparentRgb ? 0 : ((p3 & 0xff0000) >> 16) | (p3 & 0xff00) | ((p3 & 0xff) << 16) | 0xff000000;
        }

        for (; i < len; i++) {
            const pixel = data[i];
            paint[i] = keyed && (pixel & 0xffffff) === transparentRgb ? 0 : ((pixel & 0xff0000) >> 16) | (pixel & 0xff00) | ((pixel & 0xff) << 16) | 0xff000000;
        }
    }
}
