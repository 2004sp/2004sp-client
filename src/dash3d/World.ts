import { BuildArea } from '#/dash3d/CollisionMap.js';
import { LocAngle } from '#/dash3d/LocAngle.js';
import { LocShape } from '#/dash3d/LocShape.js';
import Occlude from '#/dash3d/Occlude.js';
import LocType from '#/config/LocType.js';

import GroundDecor from '#/dash3d/GroundDecor.js';
import Sprite from '#/dash3d/Sprite.js';
import GroundObject from '#/dash3d/GroundObject.js';
import Square from '#/dash3d/Square.js';
import Ground from '#/dash3d/Ground.js';
import { TerrainOverlayShape } from '#/dash3d/TerrainOverlayShape.js';
import QuickGround from '#/dash3d/QuickGround.js';
import Wall from '#/dash3d/Wall.js';
import Decor from '#/dash3d/Decor.js';

import LinkList from '#/datastruct/LinkList.js';

import Pix2D from '#/dash3d/graphics/Pix2D.js';
import Pix3D from '#/dash3d/Pix3D.js';
import Model from '#/dash3d/Model.js';
import HDRenderer from '#/hd/HDRenderer.js';

import { Int32Array3d, TypedArray1d, TypedArray2d, TypedArray3d, TypedArray4d } from '#/util/Arrays.js';
import type ModelSource from '#/dash3d/ModelSource.js';
import type PointNormal from '#/dash3d/PointNormal.js';

let _renderAllProbesFired = false;

const PRETAB = Uint8Array.of(19, 55, 38, 155, 255, 110, 137, 205, 76);
const MIDTAB = Uint8Array.of(160, 192, 80, 96, 0, 144, 80, 48, 160);
const POSTTAB = Uint8Array.of(76, 8, 137, 4, 0, 1, 38, 2, 19);

const MIDDLEPF_16 = Uint8Array.of(0, 0, 2, 0, 0, 2, 1, 1, 0);
const MIDDLEPF_32 = Uint8Array.of(2, 0, 0, 2, 0, 0, 0, 4, 4);
const MIDDLEPF_64 = Uint8Array.of(0, 4, 4, 8, 0, 0, 8, 0, 0);
const MIDDLEPF_128 = Uint8Array.of(1, 1, 0, 0, 0, 8, 0, 0, 8);

const DECORXOF = Int8Array.of(53, -53, -53, 53);
const DECORZOF = Int8Array.of(-53, -53, 53, 53);
const DECORXOF2 = Int8Array.of(-45, 45, 45, -45);
const DECORZOF2 = Int8Array.of(45, 45, -45, -45);

// prettier-ignore
const MINIMAP_SHAPE = [
    new Uint8Array(16),
    Uint8Array.of(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1), // PLAIN_SHAPE
    Uint8Array.of(1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1), // DIAGONAL_SHAPE
    Uint8Array.of(1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0), // LEFT_SEMI_DIAGONAL_SMALL_SHAPE
    Uint8Array.of(0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1), // RIGHT_SEMI_DIAGONAL_SMALL_SHAPE
    Uint8Array.of(0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1), // LEFT_SEMI_DIAGONAL_BIG_SHAPE
    Uint8Array.of(1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1), // RIGHT_SEMI_DIAGONAL_BIG_SHAPE
    Uint8Array.of(1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0), // HALF_SQUARE_SHAPE
    Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0), // CORNER_SMALL_SHAPE
    Uint8Array.of(1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1), // CORNER_BIG_SHAPE
    Uint8Array.of(1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0), // FAN_SMALL_SHAPE
    Uint8Array.of(0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1), // FAN_BIG_SHAPE
    Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1)  // TRAPEZIUM_SHAPE
];

// prettier-ignore
const MINIMAP_ROTATE = [
    Uint8Array.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15),
    Uint8Array.of(12, 8, 4, 0, 13, 9, 5, 1, 14, 10, 6, 2, 15, 11, 7, 3),
    Uint8Array.of(15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
    Uint8Array.of(3, 7, 11, 15, 2, 6, 10, 14, 1, 5, 9, 13, 0, 4, 8, 12)
];

// prettier-ignore
const TEXTURE_AVERAGE = Uint16Array.of(
    41,
    39248, // water
    41,
    4643, // planks
    41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41,
    43086, // marble
    41, 41, 41, 41, 41, 41, 41,
    8602, // mossybricks
    41,
    28992, // gungywater
    41, 41, 41, 41, 41,
    5056, // lava
    41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41,
    3131, // pebblefloor
    41, 41, 41
);

export default class World {
    static lowMem: boolean = true;

    private static cameraSinX: number = 0;
    private static cameraCosX: number = 0;
    private static cameraSinY: number = 0;
    private static cameraCosY: number = 0;

    private static fillLeft: number = 0;
    private static fillQueue: LinkList<Square> = new LinkList();

    static maxLevel: number = 0;

    private static cycleNo: number = 0;

    private static minX: number = 0;
    private static maxX: number = 0;
    private static minZ: number = 0;
    private static maxZ: number = 0;

    private static gx: number = 0;
    private static gz: number = 0;
    private static cx: number = 0;
    private static cy: number = 0;
    private static cz: number = 0;

    private static click: boolean = false;
    static clickX: number = 0;
    static clickY: number = 0;
    static groundX: number = -1;
    static groundZ: number = -1;

    private static visibilityMatrix: boolean[][][][] = new TypedArray4d(8, 32, 51, 51, false);
    private static visibilityMap: boolean[][] | null = null;

    static activeOccluderCount: number = 0;
    private static activeOccluders: (Occlude | null)[] = new TypedArray1d(500, null);

    static levelOccluderCount: Int32Array = new Int32Array(BuildArea.LEVELS);
    private static levelOccluders: (Occlude | null)[][] = new TypedArray2d(BuildArea.LEVELS, 500, null);

    private static spriteBuffer: (Sprite | null)[] = new TypedArray1d(100, null);

    private static viewportLeft: number = 0;
    private static viewportTop: number = 0;
    private static viewportRight: number = 0;
    private static viewportBottom: number = 0;
    private static viewportCentreX: number = 0;
    private static viewportCentreY: number = 0;

    private readonly maxTileLevel: number;
    private readonly maxTileX: number;
    private readonly maxTileZ: number;
    private readonly groundh: Int32Array[][];
    private readonly levelTiles: (Square | null)[][][];
    private readonly dynamicSprites: (Sprite | null)[];
    private readonly occlusionCycle: Int32Array[][];
    private readonly shareTickA: Int32Array;
    private readonly shareTickB: Int32Array;

    private dynamicCount: number = 0;
    private minLevel: number = 0;
    private shareTic: number = 0;

    private invalidateHdStaticScene(): void {
        if (!HDRenderer.isEnabled()) {
            return;
        }

        const g = globalThis as any;
        const now = performance.now();
        g.__HD_INVALIDATE_COUNT = (g.__HD_INVALIDATE_COUNT ?? 0) + 1;

        const stack = new Error().stack ?? '';
        const caller = stack.split('\n').slice(2, 6).map((line: string) => line.trim()).join(' | ');
        g.__HD_INVALIDATE_CALLERS = g.__HD_INVALIDATE_CALLERS ?? new Map<string, number>();
        g.__HD_INVALIDATE_CALLERS.set(caller, (g.__HD_INVALIDATE_CALLERS.get(caller) ?? 0) + 1);

        if (!g.__HD_INVALIDATE_LAST_LOG || now - g.__HD_INVALIDATE_LAST_LOG > 1000) {
            let topCaller = '';
            let topCount = 0;
            for (const [key, count] of g.__HD_INVALIDATE_CALLERS.entries()) {
                if (count > topCount) {
                    topCaller = key;
                    topCount = count;
                }
            }

            console.log('[HD] invalidates/sec', g.__HD_INVALIDATE_COUNT, 'top caller x' + topCount, topCaller);
            g.__HD_INVALIDATE_COUNT = 0;
            g.__HD_INVALIDATE_CALLERS.clear();
            g.__HD_INVALIDATE_LAST_LOG = now;
        }

        HDRenderer.invalidateStaticFarScene();
    }
