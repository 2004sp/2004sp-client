import * as THREE from 'three';
import Pix3D from '#/dash3d/Pix3D.js';
import Ground from '#/dash3d/Ground.js';

// ---------------------------------------------------------------------------
// Constants (kept in sync with HDRenderer)
// ---------------------------------------------------------------------------

const VERTEX_FLOATS = 15;
const CACHE_TEXTURE_COUNT = 50;
const WATER_SURFACE_MAX_HEIGHT_DELTA = 48;
const PLAIN_TERRAIN_SHAPE = 0;

const enum HDMaterial {
    Default = 0, Water = 1, Lava = 2, Model = 3, Stone = 4, Wood = 5,
    Marble = 6, Moss = 7, Pebble = 8, Foliage = 9, Metal = 10,
    Roof = 11, Unlit = 12, Earth = 13, Seabed = 14
}

const enum HDWaterSource {
    None = 0, PlainTerrain = 1, ShapedTerrain = 2, Model = 3,
    PlainTerrainColour = 4, ShapedTerrainColour = 5
}

const TEXTURE_SIZE = 128;
const ATLAS_COLS   = 16;
const ATLAS_ROWS   = 8;
const ATLAS_SIZE   = ATLAS_COLS * ATLAS_ROWS; // 128 slots (only 50 used)

const SERVER_TRANSPARENT_TEXTURE_IDS = new Set([
    7, 8, 9, 12, 17, 19, 21, 26, 28, 29, 30, 33, 34, 40, 41, 42, 43
]);

const SERVER_TEXTURE_MATERIALS: readonly number[] = [
    HDMaterial.Wood, HDMaterial.Water, HDMaterial.Stone, HDMaterial.Wood,
    HDMaterial.Wood, HDMaterial.Wood, HDMaterial.Roof, HDMaterial.Wood,
    HDMaterial.Foliage, HDMaterial.Wood, HDMaterial.Moss, HDMaterial.Stone,
    HDMaterial.Metal, HDMaterial.Unlit, HDMaterial.Unlit, HDMaterial.Marble,
    HDMaterial.Wood, HDMaterial.Water, HDMaterial.Wood, HDMaterial.Unlit,
    HDMaterial.Wood, HDMaterial.Roof, HDMaterial.Wood, HDMaterial.Stone,
    HDMaterial.Water, HDMaterial.Water, HDMaterial.Unlit, HDMaterial.Roof,
    HDMaterial.Moss, HDMaterial.Foliage, HDMaterial.Foliage, HDMaterial.Lava,
    HDMaterial.Wood, HDMaterial.Foliage, HDMaterial.Foliage, HDMaterial.Stone,
    HDMaterial.Wood, HDMaterial.Metal, HDMaterial.Default, HDMaterial.Unlit,
    HDMaterial.Foliage, HDMaterial.Foliage, HDMaterial.Foliage, HDMaterial.Foliage,
    HDMaterial.Roof, HDMaterial.Wood, HDMaterial.Pebble, HDMaterial.Stone,
    HDMaterial.Stone, HDMaterial.Unlit
];

// ---------------------------------------------------------------------------
// Skybox shaders — ported from HDRenderer.skyboxShader verbatim.
// RawShaderMaterial + glslVersion:THREE.GLSL3 means Three.js prepends
// "#version 300 es" for us; we must NOT include it ourselves.
// The "position" attribute (vec3) comes from THREE.PlaneGeometry(2,2) and
// spans -1…+1 in x/y, giving us exact NDC coverage without any camera matrix.
// ---------------------------------------------------------------------------

const skyboxVert = /* glsl */`
precision highp float;
in  vec3 position;
out vec2 v_ndc;
void main() {
    v_ndc       = position.xy;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const skyboxFrag = /* glsl */`
precision highp float;

in vec2 v_ndc;

uniform float u_sinEyePitch;
uniform float u_cosEyePitch;
uniform float u_sinEyeYaw;
uniform float u_cosEyeYaw;
uniform vec2  u_projectionScale;
uniform vec3  u_skyZenith;
uniform vec3  u_skyHorizon;
uniform vec3  u_sunDirection;

out vec4 outColour;

void main() {
    vec3 viewRay = normalize(vec3(v_ndc.x / u_projectionScale.x, -v_ndc.y / u_projectionScale.y, 1.0));
    float sp = u_sinEyePitch, cp = u_cosEyePitch;

    float worldY   = cp * viewRay.y + sp * viewRay.z;
    float elevation = atan(-worldY, sqrt(max(0.0, 1.0 - worldY * worldY)));
    float t         = clamp(elevation / 1.5708, 0.0, 1.0);
    vec3  sky       = mix(u_skyHorizon, u_skyZenith, t * t);

    float haze = clamp(1.0 - abs(elevation) / 0.35, 0.0, 1.0);
    sky = mix(sky, u_skyHorizon * 1.08, haze * haze * 0.35);

    float sy = u_sinEyeYaw, cy = u_cosEyeYaw;
    vec3  sunToward = normalize(-u_sunDirection);
    float szPrime   = cy * sunToward.z - sy * sunToward.x;
    float svx       = sy * sunToward.z + cy * sunToward.x;
    float svy       = cp * sunToward.y - sp * szPrime;
    float svz       = sp * sunToward.y + cp * szPrime;

    if (svz > 0.01) {
        vec2  sunScreen = vec2(svx / svz * u_projectionScale.x, -svy / svz * u_projectionScale.y);
        float dist      = length(v_ndc - sunScreen);
        float halo      = smoothstep(0.60, 0.0, dist) * 0.32;
        sky = mix(sky, sky + vec3(1.0, 0.82, 0.42) * halo, 1.0);
        float disk = smoothstep(0.060, 0.022, dist);
        sky = mix(sky, vec3(1.0, 0.97, 0.82), disk);
    }

    if (elevation < -0.05) {
        float below = clamp((-elevation - 0.05) * 5.0, 0.0, 1.0);
        sky = mix(sky, vec3(0.18, 0.22, 0.28), below * 0.70);
    }

    outColour = vec4(sky, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Terrain shaders — ported from HDRenderer.terrainShader.
// #version 300 es is omitted; RawShaderMaterial + glslVersion:GLSL3 adds it.
// layout(location=N) explicit attribute locations are valid in WebGL2 and are
// used here so Three.js name-based binding matches the interleaved buffer.
// ---------------------------------------------------------------------------

const terrainVert = /* glsl */`
precision highp float;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec3 a_colour;
layout(location = 3) in float a_material;
layout(location = 4) in vec2 a_uv;
layout(location = 5) in float a_texture;
layout(location = 6) in float a_alpha;
layout(location = 7) in float a_waterSource;

uniform vec3 u_cameraPosition;
uniform vec2 u_projectionScale;
uniform float u_sinEyePitch;
uniform float u_cosEyePitch;
uniform float u_sinEyeYaw;
uniform float u_cosEyeYaw;
uniform float u_nearPlane;
uniform float u_farPlane;
uniform mat4 u_lightSpaceMatrix;

out vec3 v_worldPos;
out vec3 v_normal;
out vec3 v_colour;
out float v_material;
out float v_distance;
out vec2 v_uv;
flat out int v_texture;
out float v_alpha;
flat out int v_waterSource;
out vec4 v_lightSpacePos;

void main() {
    vec3 relative = a_position - u_cameraPosition;
    float zPrime = relative.z * u_cosEyeYaw - relative.x * u_sinEyeYaw;
    float viewX  = relative.z * u_sinEyeYaw + relative.x * u_cosEyeYaw;
    float viewY  = relative.y * u_cosEyePitch - zPrime * u_sinEyePitch;
    float viewZ  = relative.y * u_sinEyePitch + zPrime * u_cosEyePitch;
    float safeRange = max(u_farPlane - u_nearPlane, 1.0);
    float ndcDepth  = ((viewZ - u_nearPlane) / safeRange) * 2.0 - 1.0;
    gl_Position = vec4(viewX * u_projectionScale.x, -viewY * u_projectionScale.y, ndcDepth * viewZ, viewZ);
    v_worldPos     = a_position;
    v_normal       = normalize(a_normal);
    v_colour       = a_colour;
    v_material     = a_material;
    v_distance     = max(0.0, viewZ);
    v_uv           = a_uv;
    v_texture      = int(floor(a_texture + 0.5));
    v_alpha        = a_alpha;
    v_waterSource  = int(floor(a_waterSource + 0.5));
    v_lightSpacePos = u_lightSpaceMatrix * vec4(a_position, 1.0);
}
`;

// Fragment shader: full HDRenderer terrain shader, stripped of #version.
// In the initial terrain pass we force u_textureDebugMode=1 (flat colour) so
// texture atlas / normal atlas / shadow map samplers are never sampled.
const terrainFrag = /* glsl */`
precision highp float;

in vec3 v_worldPos;
in vec3 v_normal;
in vec3 v_colour;
in float v_material;
in float v_distance;
in vec2 v_uv;
flat in int v_texture;
in float v_alpha;
flat in int v_waterSource;
in vec4 v_lightSpacePos;

uniform vec3 u_cameraPosition;
uniform vec3 u_sunDirection;
uniform vec3 u_skyColour;
uniform float u_ambient;
uniform float u_diffuseStrength;
uniform float u_fogStart;
uniform float u_fogDistance;
uniform float u_time;
uniform sampler2D u_textureAtlas;
uniform vec4 u_atlasRects[128];
uniform int u_textureDebugMode;
uniform int u_cacheTextureCount;
uniform sampler2D u_shadowMap;
uniform float u_shadowStrength;
uniform sampler2D u_normalAtlas;
uniform float u_waterTextureDiffuse;
uniform float u_waterFresnelStrength;
uniform float u_waterSpecularStrength;
uniform float u_waterFoamStrength;
uniform sampler2D u_waterNormalMap;
uniform sampler2D u_waterFlowMap;
uniform sampler2D u_waterFoamMap;
uniform float u_waterMapsReady;
uniform vec3 u_hdAmbientColour;
uniform vec3 u_hdSunColour;
uniform vec3 u_hdFogColour;
uniform float u_hdSkyStrength;
uniform float u_hdExposure;
uniform float u_hdContrast;
uniform float u_hdSaturation;
uniform float u_gammaCorrection;
uniform float u_groundFogStart;
uniform float u_groundFogEnd;
uniform float u_groundFogOpacity;
uniform float u_hdGroundTextureStrength;
uniform float u_hdGroundNormalStrength;
uniform float u_hdGroundTextureScale;
uniform float u_hdGroundMacroStrength;
uniform sampler2D u_hdGroundAtlas;
uniform float u_hdGroundMapsReady;
uniform sampler2D u_hdTextureAtlas;
uniform vec4 u_hdAtlasRects[50];
uniform float u_hdAtlasReady;

out vec4 outColour;

float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise2(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);float a=hash21(i);float b=hash21(i+vec2(1,0));float c=hash21(i+vec2(0,1));float d=hash21(i+vec2(1,1));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}

vec3 srgbToLinear(vec3 c){return mix(c/12.92,pow(max((c+0.055)/1.055,vec3(0)),vec3(2.4)),step(vec3(0.04045),c));}
vec3 linearToSrgb(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}
vec3 srgbToHsl(vec3 c){float V=max(max(c.r,c.g),c.b);float m=min(min(c.r,c.g),c.b);float C=V-m;float H=0.0;if(C>0.0){if(V==c.r)H=mod((c.g-c.b)/C,6.0);else if(V==c.g)H=(c.b-c.r)/C+2.0;else H=(c.r-c.g)/C+4.0;}float L=(V+m)*0.5;float d=1.0-abs(2.0*L-1.0);float SL=abs(d)<0.001?0.0:C/d;return vec3(H/6.0,SL,L);}
vec3 hslToSrgb(vec3 hsl){float C=(1.0-abs(2.0*hsl.z-1.0))*hsl.y;float Hp=fract(hsl.x)*6.0;float m=hsl.z-C*0.5;float r=clamp(abs(Hp-3.0)-1.0,0.0,1.0);float g=clamp(2.0-abs(Hp-2.0),0.0,1.0);float b=clamp(2.0-abs(Hp-4.0),0.0,1.0);return vec3(r,g,b)*C+m;}
vec3 srgbToHsv(vec3 rgb){vec3 hsl=srgbToHsl(rgb);float v=hsl.z+hsl.y*min(hsl.z,1.0-hsl.z);float s=abs(v)<0.001?0.0:2.0*(1.0-hsl.z/v);return vec3(hsl.x,s,v);}
vec3 hsvToSrgb(vec3 hsv){float l=hsv.z*(1.0-hsv.y*0.5);float d=min(l,1.0-l);float s=abs(d)<0.001?0.0:(hsv.z-l)/d;return hslToSrgb(vec3(hsv.x,s,l));}

void main() {
    vec3 normal  = normalize(v_normal);
    vec3 viewDir = normalize(u_cameraPosition - v_worldPos);
    vec3 sunDir  = normalize(-u_sunDirection);
    float diffuse      = max(dot(normal, sunDir), 0.0);
    float shadowFactor = 0.0; // shadow disabled until shadow pass ported
    float light = u_ambient + diffuse * u_diffuseStrength;
    float material = floor(v_material + 0.5);

    vec3 baseColour = v_colour;

    bool hasTextureId    = v_texture >= 0;
    bool validCacheTexture = hasTextureId && v_texture < u_cacheTextureCount;

    // Texture sampling only in normal mode (0); flat/debug modes use vertex colour.
    if (u_textureDebugMode == 0 && validCacheTexture) {
        vec4 rect = u_atlasRects[v_texture];
        vec2 atlasUv = mix(rect.xy, rect.zw, fract(v_uv));
        vec4 texel = texture(u_textureAtlas, atlasUv);
        if (texel.a >= 0.05) {
            baseColour = mix(baseColour, texel.rgb, 0.9);
        } else {
            discard;
        }
    }

    if (material == 12.0) {
        light = 1.0;
    } else if (material == 1.0) {
        // Water — simplified until water pass is ported
        baseColour = mix(vec3(0.04, 0.19, 0.41), vec3(0.25, 0.56, 0.82), clamp(diffuse, 0.0, 1.0));
        light = 1.0;
    } else if (material == 2.0) {
        float lp = sin(u_time * 2.8 + v_uv.x * 11.0 + v_uv.y * 8.5) * 0.5 + 0.5;
        baseColour = mix(vec3(0.52, 0.03, 0.0), vec3(1.0, 0.54, 0.05), lp);
        light = max(light, 1.05 + lp * 0.22);
    } else if (material == 4.0 || material == 8.0) {
        baseColour = mix(vec3(dot(baseColour, vec3(0.299, 0.587, 0.114))), baseColour, 0.72);
        light *= 0.94;
    } else if (material == 5.0 || material == 11.0) {
        baseColour *= vec3(1.08, 0.98, 0.82);
        light *= material == 11.0 ? 0.9 : 0.98;
    } else if (material == 6.0) {
        baseColour = mix(baseColour, vec3(0.78, 0.78, 0.72), 0.24);
        vec3 hv = normalize(viewDir + sunDir);
        baseColour += vec3(0.9, 0.88, 0.82) * pow(max(dot(normal, hv), 0.0), 48.0) * 0.26;
        light *= 1.04;
    } else if (material == 7.0 || material == 9.0) {
        baseColour *= vec3(0.9, 1.15, 0.8);
        light *= 0.97;
    } else if (material == 10.0) {
        baseColour = mix(baseColour, vec3(0.62, 0.62, 0.58), 0.25);
        vec3 hv = normalize(viewDir + sunDir);
        baseColour += vec3(0.75, 0.72, 0.68) * pow(max(dot(normal, hv), 0.0), 32.0) * 0.42;
    } else if (material == 14.0) {
        baseColour = mix(baseColour, vec3(0.04, 0.10, 0.22), v_alpha * 0.65);
        light *= (1.0 - v_alpha * 0.45);
    }

    float skyFacing = max(-normal.y, 0.0);
    vec3 colour;
    if (material == 1.0 || material == 12.0) {
        colour = baseColour;
    } else {
        vec3 bl = srgbToLinear(baseColour);
        vec3 envAmbient = bl * u_hdAmbientColour * u_ambient;
        vec3 envSun     = bl * u_hdSunColour * diffuse * u_diffuseStrength;
        vec3 envSky     = bl * u_hdFogColour * skyFacing * u_hdSkyStrength;
        colour = linearToSrgb(max(envAmbient + envSun + envSky, vec3(0)));
    }

    colour = max(colour * u_hdExposure, vec3(0));
    colour = clamp(colour, 0.0, 1.0);

    if (u_hdSaturation != 1.0 || u_hdContrast != 1.0) {
        vec3 hsv = srgbToHsv(colour);
        hsv.y *= u_hdSaturation;
        hsv.z = hsv.z > 0.5 ? 0.5 + (hsv.z - 0.5) * u_hdContrast : 0.5 - (0.5 - hsv.z) * u_hdContrast;
        colour = clamp(hsvToSrgb(hsv), 0.0, 1.0);
    }

    float fogLinear = clamp((v_distance - u_fogStart) / max(u_fogDistance - u_fogStart, 1.0), 0.0, 1.0);
    colour = mix(colour, u_hdFogColour, smoothstep(0.0, 1.0, fogLinear) * 0.95);
    colour = pow(max(colour, vec3(0)), vec3(u_gammaCorrection));

    float alpha = material == 14.0 ? 1.0 : v_alpha;
    outColour = vec4(clamp(colour, 0.0, 1.0), alpha);
}
`;

// ---------------------------------------------------------------------------
// ThreeRenderer — drop-in replacement for HDRenderer backed by Three.js.
//
// Public API is intentionally identical to HDRenderer so Client.ts needs only
// a one-line import change.  Rendering passes are stubbed and will be ported
// incrementally:
//   [x] Canvas / context initialisation
//   [x] Camera conversion (2004 RS angles → Three.js PerspectiveCamera)
//   [x] Viewport compositing (Three.js canvas → game 2D canvas)
//   [x] Skybox (gradient sky + sun disk)
//   [x] Texture atlas (50 cache textures → 2048×1024 DataTexture + UV rects)
//   [x] Terrain mesh
//   [x] Models (opaque + transparent + dynamic + far-scene cache)
//   [x] Shadow pass (WebGLRenderTarget depth texture, override material, PCF in shader)
//   [ ] Water
//   [x] UI layer (PixMap→canvas2d path; presentSoftwareCanvas/drawPixMapLayer return false — not called)
//   [x] Viewport compositing (Three.js canvas → game 2D canvas)
//   [ ] Terrain mesh
//   [x] Models (opaque + transparent + dynamic + far-scene cache)
//   [x] Shadow pass (WebGLRenderTarget depth texture, override material, PCF in shader)
//   [ ] Skybox
//   [ ] Water
//   [x] UI layer (PixMap→canvas2d path; presentSoftwareCanvas/drawPixMapLayer return false — not called)
// ---------------------------------------------------------------------------

// Re-exported input types (identical shape to HDRenderer's exports so callers
// can import from either file without changes).
export type HDRendererStatus = {
    enabled: boolean;
    available: boolean;
    reason: string;
    groundTileCount: number;
    terrainVertexCount: number;
    modelDrawCount: number;
    modelVertexCount: number;
    modelBatchCount: number;
    clippedTriangleCount: number;
    skippedBackfaceCount: number;
    materialCounts: number[];
    textureAtlasReady: boolean;
    textureAtlasLoadedCount: number;
    textureUseCounts: number[];
    untexturedTriangleCount: number;
    invalidTextureCount: number;
};

export type HDGroundTileInput = {
    level: number;
    x: number;
    z: number;
    shape: number;
    rotation: number;
    texture: number;
    heights: [number, number, number, number];
    colours: [number, number, number, number];
    secondaryColours: [number, number, number, number];
    overlay: number;
    underlay: number;
    overlayId: number;
    underlayId: number;
};

export type HDCameraInput = {
    eyeX: number;
    eyeY: number;
    eyeZ: number;
    eyePitch: number;
    eyeYaw: number;
    sinEyePitch: number;
    cosEyePitch: number;
    sinEyeYaw: number;
    cosEyeYaw: number;
    maxLevel: number;
    minTileX: number;
    minTileZ: number;
    maxTileX: number;
    maxTileZ: number;
};

export type HDModelInput = {
    vertexCount: number;
    vertexX: Int32Array | null;
    vertexY: Int32Array | null;
    vertexZ: Int32Array | null;
    faceCount: number;
    faceVertexA: Int32Array | null;
    faceVertexB: Int32Array | null;
    faceVertexC: Int32Array | null;
    faceRenderType: Int32Array | null;
    facePriority: Int32Array | null;
    priority: number;
    faceAlpha: Int32Array | null;
    faceColour: Int32Array | null;
    faceColourA: Int32Array | null;
    faceColourB: Int32Array | null;
    faceColourC: Int32Array | null;
    faceTextureP: Int32Array | null;
    faceTextureM: Int32Array | null;
    faceTextureN: Int32Array | null;
};

// ---------------------------------------------------------------------------
// Constants (kept in sync with the original HDRenderer values)
// ---------------------------------------------------------------------------

const VIEWPORT_X = 4;
const VIEWPORT_Y = 4;
const VIEWPORT_WIDTH = 512;
const VIEWPORT_HEIGHT = 334;

// 2004 RS focal length (pixels at native 512×334 viewport).
const FOCAL_LENGTH = 512;

// Derived Three.js camera parameters.
const CAMERA_FOV = 2 * Math.atan(VIEWPORT_HEIGHT / (2 * FOCAL_LENGTH)) * (180 / Math.PI); // ≈ 36.2°
const CAMERA_ASPECT = VIEWPORT_WIDTH / VIEWPORT_HEIGHT;
const CAMERA_NEAR = 50;
const CAMERA_FAR = 9000;

const SKY_COLOR = new THREE.Color(0.47, 0.65, 0.85);

// ---------------------------------------------------------------------------
// ThreeRenderer — static class, mirrors HDRenderer's interface exactly.
// ---------------------------------------------------------------------------

export default class ThreeRenderer {
    // ── Three.js objects ────────────────────────────────────────────────────
    private static renderer: THREE.WebGLRenderer | null = null;
    private static scene: THREE.Scene = new THREE.Scene();
    private static camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_ASPECT, CAMERA_NEAR, CAMERA_FAR);

    // ── Skybox ───────────────────────────────────────────────────────────────
    private static skyboxMesh: THREE.Mesh | null = null;
    private static skyboxMat: THREE.RawShaderMaterial | null = null;

    // ── Terrain ───────────────────────────────────────────────────────────────
    private static terrainMat: THREE.RawShaderMaterial | null = null;
    private static terrainMesh: THREE.Mesh | null = null;
    private static waterMesh: THREE.Mesh | null = null;
    private static dummyTex: THREE.DataTexture | null = null;
    private static lastCameraRange: { minX: number; minZ: number; maxX: number; maxZ: number; maxLevel: number } | null = null;
    private static smoothNormalCache: Map<number, readonly [number, number, number]> = new Map();
    private static groundObjectCache: Map<string, Ground> = new Map();
    private static terrainVertexCount: number = 0;
    private static textureAtlasReady: boolean = false;
    private static textureAtlasLoadedCount: number = 0;

    // ── Shadow pass ───────────────────────────────────────────────────────────
    private static shadowTarget: THREE.WebGLRenderTarget | null = null;
    private static shadowMat: THREE.RawShaderMaterial | null = null;
    private static lightSpaceMatrix: Float32Array = new Float32Array(16);

    // ── State ───────────────────────────────────────────────────────────────
    private static enabled: boolean = false;
    private static ready: boolean = false;
    private static reason: string = 'not initialised';
    private static frameStarted: boolean = false;
    private static currentCamera: HDCameraInput | null = null;
    private static frameNumber: number = 0;
    private static safeWarmupFrames: number = 0;

    // ── Ground tile accumulation (populated each scene load) ─────────────
    private static groundTiles: HDGroundTileInput[] = [];
    private static groundTileMap: Map<string, HDGroundTileInput> = new Map();
    private static visibleGroundKeys: Set<string> = new Set();
    private static sceneDirty: boolean = false;

    // ── Far-scene cache ──────────────────────────────────────────────────
    private static staticFarSceneKey: string = '';
    private static staticFarSceneBuilding: boolean = false;
    private static staticFarGpuDirty: boolean = true;

    // ── Model batch accumulation ──────────────────────────────────────────────
    // Keyed by texture (-1 = untextured).  Floats are appended during queueModel()
    // and uploaded to GPU meshes at the start of renderFrame().
    private static modelBatches: Map<number, number[]> = new Map();
    private static transparentBatches: { depth: number; texture: number; vertices: number[] }[] = [];
    private static dynamicModelBatches: Map<number, number[]> = new Map();
    private static dynamicTransparentBatches: { depth: number; texture: number; vertices: number[] }[] = [];
    private static lastGoodDynamicModelBatches: Map<number, number[]> = new Map();
    private static lastGoodDynamicTransparentBatches: { depth: number; texture: number; vertices: number[] }[] = [];

    // ── Static far-scene batch cache ──────────────────────────────────────────
    // Models accumulated while _HD_FAR_SCENE_QUEUING=true go into pendingFar*.
    // On endStaticFarScene() they become the committed far* batches.
    // GPU meshes are only rebuilt when staticFarGpuDirty flips true.
    private static staticFarBatches: Map<number, number[]> = new Map();
    private static staticFarTransBatches: { depth: number; texture: number; vertices: number[] }[] = [];
    private static pendingFarBatches: Map<number, number[]> = new Map();
    private static pendingFarTransBatches: { depth: number; texture: number; vertices: number[] }[] = [];
    private static farMeshPool: Map<string, THREE.Mesh> = new Map();
    private static farTransparentMesh: THREE.Mesh | null = null;

    // ── Model mesh pool ───────────────────────────────────────────────────────
    // One persistent Mesh per batch key; geometry is updated each frame.
    private static modelMeshPool: Map<string, THREE.Mesh> = new Map();
    private static transparentModelMesh: THREE.Mesh | null = null;
    private static transparentModelMat: THREE.RawShaderMaterial | null = null;

    // ── Model queue tracking ──────────────────────────────────────────────────
    private static modelDrawCount: number = 0;
    private static modelVertexCount: number = 0;
    private static modelBatchCount: number = 0;
    private static dynamicModelDrawCount: number = 0;
    private static dynamicModelVertexCount: number = 0;
    private static farModelDrawCount: number = 0;
    private static dynamicModelQueueing: boolean = false;
    private static queuedModelKeys: Set<string> = new Set();
    private static modelObjectIds: WeakMap<object, number> = new WeakMap();
    private static nextModelObjectId: number = 1;

    // ── Diagnostics ──────────────────────────────────────────────────────
    private static clippedTriangleCount: number = 0;
    private static skippedBackfaceCount: number = 0;
    private static materialCounts: number[] = [];
    private static textureUseCounts: number[] = [];
    private static untexturedTriangleCount: number = 0;
    private static invalidTextureCount: number = 0;

    // ── Last-good dynamic model hold (matches HDRenderer's flicker guard) ─
    private static lastGoodDynamicFrameNumber: number = 0;

    // =========================================================================
    // Initialisation
    // =========================================================================

    private static init(): void {
        if (this.renderer) {
            return;
        }

        try {
            const renderer = new THREE.WebGLRenderer({
                alpha: true,
                antialias: true,
                depth: true,
                powerPreference: 'high-performance',
                premultipliedAlpha: false,
                preserveDrawingBuffer: true,
            });

            // Keep the canvas off-DOM; compositing is done via drawImage each frame.
            renderer.domElement.id = 'three-hd-canvas';
            renderer.domElement.setAttribute('aria-hidden', 'true');

            // Horizon colour as the base clear; the skybox mesh draws the gradient.
            renderer.setClearColor(new THREE.Color(0.64, 0.78, 0.92), 1);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;

            this.syncRendererSize(renderer);

            this.renderer = renderer;
            // No solid background — the skybox mesh handles all sky pixels.
            this.scene.background = null;

            this.initSkybox();
            this.initTerrain();
            this.initTransparentModelMat();
            this.initShadow();

            this.ready = true;
            this.reason = 'ready';
        } catch (e) {
            this.reason = e instanceof Error ? e.message : String(e);
            this.ready = false;
        }
    }

    private static initSkybox(): void {
        const geo = new THREE.PlaneGeometry(2, 2);

        const mat = new THREE.RawShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: skyboxVert,
            fragmentShader: skyboxFrag,
            uniforms: {
                u_sinEyePitch:    { value: 0 },
                u_cosEyePitch:    { value: 1 },
                u_sinEyeYaw:      { value: 0 },
                u_cosEyeYaw:      { value: 1 },
                u_projectionScale:{ value: new THREE.Vector2(2.0, 3.066) },
                u_skyZenith:      { value: new THREE.Vector3(0.28, 0.52, 0.82) },
                u_skyHorizon:     { value: new THREE.Vector3(0.64, 0.78, 0.92) },
                u_sunDirection:   { value: new THREE.Vector3(-0.45, 0.8, -0.35) },
            },
            depthTest: false,
            depthWrite: false,
            side: THREE.FrontSide,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = -1;

        this.skyboxMesh = mesh;
        this.skyboxMat  = mat;
        this.scene.add(mesh);
    }

    private static initTerrain(): void {
        // 1x1 black texture used for all sampler uniforms that aren't yet populated.
        const dummy = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
        dummy.needsUpdate = true;
        this.dummyTex = dummy;

        const zeroRects128 = Array.from({ length: 128 }, () => new THREE.Vector4());
        const zeroRects50  = Array.from({ length: 50  }, () => new THREE.Vector4());
        const idMat = new THREE.Matrix4(); // identity light-space matrix

        const mat = new THREE.RawShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: terrainVert,
            fragmentShader: terrainFrag,
            uniforms: {
                u_cameraPosition:          { value: new THREE.Vector3() },
                u_projectionScale:         { value: new THREE.Vector2(2.0, 3.066) },
                u_sinEyePitch:             { value: 0 },
                u_cosEyePitch:             { value: 1 },
                u_sinEyeYaw:               { value: 0 },
                u_cosEyeYaw:               { value: 1 },
                u_nearPlane:               { value: 50 },
                u_farPlane:                { value: 9000 },
                u_lightSpaceMatrix:        { value: idMat },
                u_sunDirection:            { value: new THREE.Vector3(-0.45, 0.8, -0.35) },
                u_skyColour:               { value: new THREE.Vector3(0.47, 0.65, 0.85) },
                u_ambient:                 { value: 0.45 },
                u_diffuseStrength:         { value: 0.85 },
                u_fogStart:                { value: 2600 },
                u_fogDistance:             { value: 5200 },
                u_time:                    { value: 0 },
                u_textureAtlas:            { value: dummy },
                u_atlasRects:              { value: zeroRects128 },
                u_textureDebugMode:        { value: 0 },
                u_cacheTextureCount:       { value: CACHE_TEXTURE_COUNT },
                u_shadowMap:               { value: dummy },
                u_shadowStrength:          { value: 0.0 },
                u_normalAtlas:             { value: dummy },
                u_waterTextureDiffuse:     { value: 0.3 },
                u_waterFresnelStrength:    { value: 1.0 },
                u_waterSpecularStrength:   { value: 1.0 },
                u_waterFoamStrength:       { value: 1.0 },
                u_waterNormalMap:          { value: dummy },
                u_waterFlowMap:            { value: dummy },
                u_waterFoamMap:            { value: dummy },
                u_waterMapsReady:          { value: 0.0 },
                u_hdAmbientColour:         { value: new THREE.Vector3(0.78, 0.82, 0.92) },
                u_hdSunColour:             { value: new THREE.Vector3(1.0, 0.95, 0.82) },
                u_hdFogColour:             { value: new THREE.Vector3(0.58, 0.74, 0.90) },
                u_hdSkyStrength:           { value: 0.28 },
                u_hdExposure:              { value: 1.20 },
                u_hdContrast:              { value: 1.08 },
                u_hdSaturation:            { value: 1.12 },
                u_gammaCorrection:         { value: 1.0 },
                u_groundFogStart:          { value: 0.0 },
                u_groundFogEnd:            { value: -200.0 },
                u_groundFogOpacity:        { value: 0.0 },
                u_hdGroundTextureStrength: { value: 0.0 },
                u_hdGroundNormalStrength:  { value: 0.0 },
                u_hdGroundTextureScale:    { value: 384.0 },
                u_hdGroundMacroStrength:   { value: 0.10 },
                u_hdGroundAtlas:           { value: dummy },
                u_hdGroundMapsReady:       { value: 0.0 },
                u_hdTextureAtlas:          { value: dummy },
                u_hdAtlasRects:            { value: zeroRects50 },
                u_hdAtlasReady:            { value: 0.0 },
            },
            depthTest:  true,
            depthWrite: true,
            side: THREE.FrontSide,
        });

        const geo  = new THREE.BufferGeometry();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder   = 0;

        const wGeo  = new THREE.BufferGeometry();
        const wMat  = mat.clone();
        wMat.transparent = true;
        wMat.depthWrite  = false;
        const wMesh = new THREE.Mesh(wGeo, wMat);
        wMesh.frustumCulled = false;
        wMesh.renderOrder   = 1;

        this.terrainMat  = mat;
        this.terrainMesh = mesh;
        this.waterMesh   = wMesh;
        this.scene.add(mesh);
        this.scene.add(wMesh);
    }

    // ── Terrain sync ─────────────────────────────────────────────────────────

    private static syncTerrain(camera?: HDCameraInput): void {
        if (!this.terrainMesh || !this.waterMesh) {
            return;
        }

        const lc = this.lastCameraRange;
        const rangeUnchanged = camera && lc !== null &&
            camera.minTileX === lc.minX && camera.minTileZ === lc.minZ &&
            camera.maxTileX === lc.maxX && camera.maxTileZ === lc.maxZ &&
            camera.maxLevel === lc.maxLevel;

        if (!this.sceneDirty && rangeUnchanged) {
            return;
        }

        if (this.sceneDirty) {
            this.buildSmoothNormals(camera);
            this.sceneDirty = false;
        }

        const { land, water } = this.buildTerrainVertices(camera);
        this.terrainVertexCount = land.length / VERTEX_FLOATS;

        this.uploadTerrainBuffer(this.terrainMesh.geometry, land);
        this.uploadTerrainBuffer(this.waterMesh.geometry, water);

        if (camera) {
            this.lastCameraRange = {
                minX: camera.minTileX, minZ: camera.minTileZ,
                maxX: camera.maxTileX, maxZ: camera.maxTileZ,
                maxLevel: camera.maxLevel
            };
        }
    }

    private static uploadTerrainBuffer(geo: THREE.BufferGeometry, data: Float32Array): void {
        if (data.length === 0) {
            geo.setAttribute('a_position', new THREE.BufferAttribute(new Float32Array(0), 3));
            return;
        }

        const ib = new THREE.InterleavedBuffer(data, VERTEX_FLOATS);
        ib.usage = THREE.StaticDrawUsage;
        geo.setAttribute('a_position',    new THREE.InterleavedBufferAttribute(ib, 3, 0));
        geo.setAttribute('a_normal',      new THREE.InterleavedBufferAttribute(ib, 3, 3));
        geo.setAttribute('a_colour',      new THREE.InterleavedBufferAttribute(ib, 3, 6));
        geo.setAttribute('a_material',    new THREE.InterleavedBufferAttribute(ib, 1, 9));
        geo.setAttribute('a_uv',          new THREE.InterleavedBufferAttribute(ib, 2, 10));
        geo.setAttribute('a_texture',     new THREE.InterleavedBufferAttribute(ib, 1, 12));
        geo.setAttribute('a_alpha',       new THREE.InterleavedBufferAttribute(ib, 1, 13));
        geo.setAttribute('a_waterSource', new THREE.InterleavedBufferAttribute(ib, 1, 14));
        geo.setDrawRange(0, data.length / VERTEX_FLOATS);
    }

    private static initTransparentModelMat(): void {
        if (!this.terrainMat) return;
        const mat = this.terrainMat.clone() as THREE.RawShaderMaterial;
        mat.transparent = true;
        mat.depthWrite  = false;
        this.transparentModelMat = mat;

        const geo  = new THREE.BufferGeometry();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder   = 4;
        mesh.visible       = false;
        this.transparentModelMesh = mesh;
        this.scene.add(mesh);
    }

    // ── Model mesh upload ─────────────────────────────────────────────────────

    private static uploadAndDrawModels(): void {
        // Dynamic model flicker guard: if no dynamic models were queued this frame
        // but we had a good batch recently, reuse it (mirrors HDRenderer's hold logic).
        const holdFrames = Number((globalThis as any).HD_DYNAMIC_HOLD_FRAMES ?? 6);
        if (this.dynamicModelDrawCount > 0) {
            this.lastGoodDynamicModelBatches     = this.cloneBatchMap(this.dynamicModelBatches);
            this.lastGoodDynamicTransparentBatches = this.cloneTransparentBatches(this.dynamicTransparentBatches);
            this.lastGoodDynamicFrameNumber      = this.frameNumber;
        } else if (
            this.lastGoodDynamicFrameNumber > 0 &&
            this.frameNumber - this.lastGoodDynamicFrameNumber <= holdFrames
        ) {
            this.dynamicModelBatches           = this.cloneBatchMap(this.lastGoodDynamicModelBatches);
            this.dynamicTransparentBatches     = this.cloneTransparentBatches(this.lastGoodDynamicTransparentBatches);
        }

        // Hide all pool meshes; re-show the ones with data below.
        for (const mesh of this.modelMeshPool.values()) mesh.visible = false;
        if (this.transparentModelMesh) this.transparentModelMesh.visible = false;

        // Sync transparent material uniforms from terrainMat each frame.
        if (this.transparentModelMat && this.terrainMat) {
            for (const key of Object.keys(this.terrainMat.uniforms)) {
                if (this.transparentModelMat.uniforms[key] !== undefined) {
                    this.transparentModelMat.uniforms[key].value =
                        this.terrainMat.uniforms[key].value;
                }
            }
        }

        // Upload opaque static model batches.
        for (const [texKey, verts] of this.modelBatches) {
            if (verts.length === 0) continue;
            const poolKey = `s-${texKey}`;
            let mesh = this.modelMeshPool.get(poolKey);
            if (!mesh) {
                mesh = this.makeModelMesh(false);
                this.modelMeshPool.set(poolKey, mesh);
                this.scene.add(mesh);
            }
            this.uploadTerrainBuffer(mesh.geometry, new Float32Array(verts));
            mesh.visible = true;
        }

        // Upload opaque dynamic model batches.
        for (const [texKey, verts] of this.dynamicModelBatches) {
            if (verts.length === 0) continue;
            const poolKey = `d-${texKey}`;
            let mesh = this.modelMeshPool.get(poolKey);
            if (!mesh) {
                mesh = this.makeModelMesh(false);
                this.modelMeshPool.set(poolKey, mesh);
                this.scene.add(mesh);
            }
            this.uploadTerrainBuffer(mesh.geometry, new Float32Array(verts));
            mesh.visible = true;
        }

        // Upload transparent batches (all tiers combined, sorted back-to-front).
        const allTrans = [
            ...this.transparentBatches,
            ...this.dynamicTransparentBatches,
        ].sort((a, b) => b.depth - a.depth);

        if (allTrans.length > 0) {
            const combined: number[] = [];
            for (const batch of allTrans) combined.push(...batch.vertices);
            if (!this.transparentModelMesh) this.initTransparentModelMat();
            if (this.transparentModelMesh) {
                this.uploadTerrainBuffer(this.transparentModelMesh.geometry, new Float32Array(combined));
                this.transparentModelMesh.visible = true;
            }
        }

        this.modelBatchCount =
            this.modelBatches.size + this.transparentBatches.length +
            this.dynamicModelBatches.size + this.dynamicTransparentBatches.length;
    }

    private static makeModelMesh(transparent: boolean): THREE.Mesh {
        const mat = transparent
            ? (this.transparentModelMat ?? this.terrainMat!)
            : this.terrainMat!;
        const geo  = new THREE.BufferGeometry();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder   = transparent ? 4 : 1;
        return mesh;
    }

    private static uploadFarSceneModels(): void {
        if (!this.staticFarGpuDirty) {
            // Nothing changed — far meshes already visible from last build.
            return;
        }

        // Hide all existing far meshes, then re-show those that have data.
        for (const mesh of this.farMeshPool.values()) mesh.visible = false;
        if (this.farTransparentMesh) this.farTransparentMesh.visible = false;

        for (const [texKey, verts] of this.staticFarBatches) {
            if (verts.length === 0) continue;
            const poolKey = `f-${texKey}`;
            let mesh = this.farMeshPool.get(poolKey);
            if (!mesh) {
                mesh = this.makeModelMesh(false);
                mesh.renderOrder = 1;
                this.farMeshPool.set(poolKey, mesh);
                this.scene.add(mesh);
            }
            this.uploadTerrainBuffer(mesh.geometry, new Float32Array(verts));
            mesh.visible = true;
        }

        const farTrans = [...this.staticFarTransBatches].sort((a, b) => b.depth - a.depth);
        if (farTrans.length > 0) {
            const combined: number[] = [];
            for (const b of farTrans) combined.push(...b.vertices);
            if (!this.farTransparentMesh) {
                this.farTransparentMesh = this.makeModelMesh(true);
                this.scene.add(this.farTransparentMesh);
            }
            this.uploadTerrainBuffer(this.farTransparentMesh.geometry, new Float32Array(combined));
            this.farTransparentMesh.visible = true;
        }

        this.staticFarGpuDirty = false;
    }

    // ── Shadow pass ───────────────────────────────────────────────────────────

    private static initShadow(): void {
        const size = 2048;
        const depthTex = new THREE.DepthTexture(size, size);
        depthTex.type   = THREE.UnsignedIntType;
        depthTex.format = THREE.DepthFormat;

        const target = new THREE.WebGLRenderTarget(size, size, {
            depthBuffer:   true,
            depthTexture:  depthTex,
            type:          THREE.UnsignedByteType,
            format:        THREE.RGBAFormat,
        });
        this.shadowTarget = target;

        // Shadow vertex shader: project world position into light space.
        // Fragment shader is empty — only the depth buffer matters.
        this.shadowMat = new THREE.RawShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: `
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_lightSpaceMatrix;
void main() {
    gl_Position = u_lightSpaceMatrix * vec4(a_position, 1.0);
}
`,
            fragmentShader: `
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(0.0); }
`,
            uniforms: {
                u_lightSpaceMatrix: { value: new THREE.Matrix4() },
            },
            depthTest:  true,
            depthWrite: true,
            side: THREE.FrontSide,
        });
    }

    private static buildLightSpaceMatrix(cam: HDCameraInput): void {
        // Sun direction (light-ray direction, sun→scene): (-0.45, 0.8, -0.35)
        // Toward-sun = (0.45, -0.8, 0.35). Place the light eye above/beside camera.
        const rx = 0.45, ry = 0.8, rz = 0.35;
        const len  = Math.hypot(rx, ry, rz);
        const dist = 5000;
        const le: [number,number,number] = [
            cam.eyeX + (rx/len)*dist,
            cam.eyeY - (ry/len)*dist,
            cam.eyeZ + (rz/len)*dist
        ];
        const center: [number,number,number] = [cam.eyeX, cam.eyeY, cam.eyeZ];
        const up:     [number,number,number] = [0, 0, 1];

        const view  = this.mat4LookAt(le, center, up);
        const half  = 6000;
        const ortho = this.mat4Ortho(-half, half, -half, half, 1, 14000);
        const vp    = this.mat4Multiply(ortho, view);

        // Snap to shadow-map texel boundary to prevent sub-texel shimmer.
        const halfTexels = 2048 * 0.5;
        vp[12] += (Math.round(vp[12]*halfTexels) - vp[12]*halfTexels) / halfTexels;
        vp[13] += (Math.round(vp[13]*halfTexels) - vp[13]*halfTexels) / halfTexels;

        this.lightSpaceMatrix.set(vp);
    }

    private static mat4LookAt(
        eye: [number,number,number], center: [number,number,number], up: [number,number,number]
    ): Float32Array {
        const fx=center[0]-eye[0], fy=center[1]-eye[1], fz=center[2]-eye[2];
        const fl=Math.hypot(fx,fy,fz)||1;
        const f=[fx/fl, fy/fl, fz/fl];
        const rx=f[1]*up[2]-f[2]*up[1], ry=f[2]*up[0]-f[0]*up[2], rz=f[0]*up[1]-f[1]*up[0];
        const rl=Math.hypot(rx,ry,rz)||1;
        const r=[rx/rl, ry/rl, rz/rl];
        const u=[r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0]];
        const m=new Float32Array(16);
        m[0]=r[0];m[4]=r[1];m[8] =r[2];m[12]=-(r[0]*eye[0]+r[1]*eye[1]+r[2]*eye[2]);
        m[1]=u[0];m[5]=u[1];m[9] =u[2];m[13]=-(u[0]*eye[0]+u[1]*eye[1]+u[2]*eye[2]);
        m[2]=-f[0];m[6]=-f[1];m[10]=-f[2];m[14]=f[0]*eye[0]+f[1]*eye[1]+f[2]*eye[2];
        m[3]=0;m[7]=0;m[11]=0;m[15]=1;
        return m;
    }

    private static mat4Ortho(l:number, r:number, b:number, t:number, n:number, f:number): Float32Array {
        const m=new Float32Array(16);
        m[0]=2/(r-l); m[5]=2/(t-b); m[10]=-2/(f-n);
        m[12]=-(r+l)/(r-l); m[13]=-(t+b)/(t-b); m[14]=-(f+n)/(f-n); m[15]=1;
        return m;
    }

    private static mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
        const m=new Float32Array(16);
        for(let i=0;i<4;i++) for(let j=0;j<4;j++){
            let s=0; for(let k=0;k<4;k++) s+=a[k*4+i]*b[j*4+k]; m[j*4+i]=s;
        }
        return m;
    }

    private static renderShadowPass(): void {
        const renderer = this.renderer;
        const mat      = this.shadowMat;
        const target   = this.shadowTarget;
        if (!renderer || !mat || !target || this.terrainVertexCount === 0) return;

        // Push light-space matrix into shadow material.
        (mat.uniforms.u_lightSpaceMatrix.value as THREE.Matrix4).fromArray(this.lightSpaceMatrix);

        // Hide skybox/water during depth-only pass; restore after.
        const skyVis  = this.skyboxMesh?.visible ?? false;
        const waterVis= this.waterMesh?.visible  ?? false;
        const farTransVis = this.farTransparentMesh?.visible ?? false;
        const transVis    = this.transparentModelMesh?.visible ?? false;
        if (this.skyboxMesh)          this.skyboxMesh.visible          = false;
        if (this.waterMesh)           this.waterMesh.visible            = false;
        if (this.farTransparentMesh)  this.farTransparentMesh.visible   = false;
        if (this.transparentModelMesh)this.transparentModelMesh.visible = false;

        const prevOverride = this.scene.overrideMaterial;
        this.scene.overrideMaterial = mat;
        renderer.setRenderTarget(target);
        renderer.clear(false, true, false); // clear depth only
        renderer.render(this.scene, this.camera);
        renderer.setRenderTarget(null);
        this.scene.overrideMaterial = prevOverride;

        // Restore visibility.
        if (this.skyboxMesh)          this.skyboxMesh.visible          = skyVis;
        if (this.waterMesh)           this.waterMesh.visible            = waterVis;
        if (this.farTransparentMesh)  this.farTransparentMesh.visible   = farTransVis;
        if (this.transparentModelMesh)this.transparentModelMesh.visible = transVis;

        // Push the shadow map and light-space matrix into all terrain/model materials.
        const lsm  = Array.from(this.lightSpaceMatrix);
        const depthTex = target.depthTexture;
        for (const mat of this.allOpaqueMaterials()) {
            mat.uniforms.u_shadowMap.value        = depthTex;
            mat.uniforms.u_lightSpaceMatrix.value = new THREE.Matrix4().fromArray(lsm);
            mat.uniforms.u_shadowStrength.value   = 1.0;
        }
    }

    private static allOpaqueMaterials(): THREE.RawShaderMaterial[] {
        const mats: THREE.RawShaderMaterial[] = [];
        if (this.terrainMat) mats.push(this.terrainMat);
        for (const mesh of this.modelMeshPool.values()) {
            if (mesh.material instanceof THREE.RawShaderMaterial) mats.push(mesh.material);
        }
        for (const mesh of this.farMeshPool.values()) {
            if (mesh.material instanceof THREE.RawShaderMaterial) mats.push(mesh.material);
        }
        return mats;
    }

    private static cloneBatchMap(src: Map<number, number[]>): Map<number, number[]> {
        const out = new Map<number, number[]>();
        for (const [k, v] of src) out.set(k, v.slice());
        return out;
    }

    private static cloneTransparentBatches(
        src: { depth: number; texture: number; vertices: number[] }[]
    ): { depth: number; texture: number; vertices: number[] }[] {
        return src.map(b => ({ depth: b.depth, texture: b.texture, vertices: b.vertices.slice() }));
    }

    private static updateTerrainUniforms(cam: HDCameraInput): void {
        const u = this.terrainMat?.uniforms;
        if (!u) {
            return;
        }
        const g = globalThis as any;

        (u.u_cameraPosition.value as THREE.Vector3).set(cam.eyeX, cam.eyeY, cam.eyeZ);
        (u.u_projectionScale.value as THREE.Vector2).set(
            (2 * FOCAL_LENGTH) / VIEWPORT_WIDTH,
            (2 * FOCAL_LENGTH) / VIEWPORT_HEIGHT
        );
        u.u_sinEyePitch.value = cam.sinEyePitch / 65536;
        u.u_cosEyePitch.value = cam.cosEyePitch / 65536;
        u.u_sinEyeYaw.value   = cam.sinEyeYaw   / 65536;
        u.u_cosEyeYaw.value   = cam.cosEyeYaw   / 65536;
        u.u_time.value = performance.now() / 1000;
        u.u_lightSpaceMatrix.value = new THREE.Matrix4().fromArray(this.lightSpaceMatrix);

        // Propagate runtime tuning globals (mirrors HDRenderer).
        u.u_hdAmbientColour.value = new THREE.Vector3(
            Number.isFinite(+g.HD_ENV_AMBIENT_R) ? +g.HD_ENV_AMBIENT_R : 0.78,
            Number.isFinite(+g.HD_ENV_AMBIENT_G) ? +g.HD_ENV_AMBIENT_G : 0.82,
            Number.isFinite(+g.HD_ENV_AMBIENT_B) ? +g.HD_ENV_AMBIENT_B : 0.92
        );
        u.u_hdSunColour.value = new THREE.Vector3(
            Number.isFinite(+g.HD_ENV_SUN_R) ? +g.HD_ENV_SUN_R : 1.00,
            Number.isFinite(+g.HD_ENV_SUN_G) ? +g.HD_ENV_SUN_G : 0.95,
            Number.isFinite(+g.HD_ENV_SUN_B) ? +g.HD_ENV_SUN_B : 0.82
        );
        u.u_hdFogColour.value = new THREE.Vector3(
            Number.isFinite(+g.HD_ENV_FOG_R) ? +g.HD_ENV_FOG_R : 0.58,
            Number.isFinite(+g.HD_ENV_FOG_G) ? +g.HD_ENV_FOG_G : 0.74,
            Number.isFinite(+g.HD_ENV_FOG_B) ? +g.HD_ENV_FOG_B : 0.90
        );
        u.u_hdExposure.value     = Number.isFinite(+g.HD_ENV_EXPOSURE)   ? +g.HD_ENV_EXPOSURE   : 1.20;
        u.u_hdContrast.value     = Number.isFinite(+g.HD_ENV_CONTRAST)   ? +g.HD_ENV_CONTRAST   : 1.08;
        u.u_hdSaturation.value   = Number.isFinite(+g.HD_ENV_SATURATION) ? +g.HD_ENV_SATURATION : 1.12;
        u.u_gammaCorrection.value= Number.isFinite(+g.HD_GAMMA_CORRECTION)? +g.HD_GAMMA_CORRECTION : 1.0;

        // Sync to water mesh material.
        if (this.waterMesh?.material instanceof THREE.RawShaderMaterial) {
            const wu = this.waterMesh.material.uniforms;
            for (const key of Object.keys(u)) {
                if (wu[key] !== undefined) {
                    wu[key].value = u[key].value;
                }
            }
        }
    }

    // ── Texture atlas ────────────────────────────────────────────────────────

    private static ensureTextureAtlas(): void {
        if (this.textureAtlasReady || !this.terrainMat) {
            return;
        }

        const w = ATLAS_COLS * TEXTURE_SIZE; // 2048
        const h = ATLAS_ROWS * TEXTURE_SIZE; // 1024
        const rgba = new Uint8Array(w * h * 4);
        const rects: THREE.Vector4[] = [];
        let loaded = 0;

        for (let id = 0; id < ATLAS_SIZE; id++) {
            const texture = id < CACHE_TEXTURE_COUNT ? Pix3D.textures[id] : null;
            const palette = Pix3D.texPal[id] ?? (texture as any)?.bpal ?? null;
            const col = id % ATLAS_COLS;
            const row = (id / ATLAS_COLS) | 0;

            // Half-texel inset so bilinear filtering doesn't bleed across slots.
            rects[id] = new THREE.Vector4(
                (col * TEXTURE_SIZE + 0.5) / w,
                (row * TEXTURE_SIZE + 0.5) / h,
                ((col + 1) * TEXTURE_SIZE - 0.5) / w,
                ((row + 1) * TEXTURE_SIZE - 0.5) / h
            );

            if (!texture || !palette) {
                continue;
            }

            loaded++;
            const transparent = SERVER_TRANSPARENT_TEXTURE_IDS.has(id);

            for (let y = 0; y < TEXTURE_SIZE; y++) {
                const srcY = Math.min(texture.hi - 1, Math.floor((y * texture.hi) / TEXTURE_SIZE));
                for (let x = 0; x < TEXTURE_SIZE; x++) {
                    const srcX = Math.min(texture.wi - 1, Math.floor((x * texture.wi) / TEXTURE_SIZE));
                    const pi  = texture.data[srcX + srcY * texture.wi] & 0xff;
                    const rgb = (palette[pi] ?? 0) & 0xf8f8ff;
                    const off = ((col * TEXTURE_SIZE + x) + (row * TEXTURE_SIZE + y) * w) * 4;
                    rgba[off]     = (rgb >> 16) & 0xff;
                    rgba[off + 1] = (rgb >> 8)  & 0xff;
                    rgba[off + 2] =  rgb        & 0xff;
                    // Magenta-keyed transparency: pure black pixels become transparent
                    // on textures flagged as transparent (foliage, nets, etc.).
                    rgba[off + 3] = (!transparent || ((rgba[off] >= 16) || (rgba[off+1] >= 16) || (rgba[off+2] >= 16))) ? 255 : 0;
                }
            }
        }

        this.textureAtlasLoadedCount = loaded;

        // Don't commit until all 50 cache textures are present — a partial atlas
        // would bake blank slots permanently since we only build it once.
        if (loaded < CACHE_TEXTURE_COUNT) {
            return;
        }

        const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
        tex.minFilter      = THREE.LinearMipmapLinearFilter;
        tex.magFilter      = THREE.LinearFilter;
        tex.wrapS          = THREE.ClampToEdgeWrapping;
        tex.wrapT          = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = true;
        tex.needsUpdate    = true;

        // Push atlas and rects into both land and water materials.
        for (const mat of [this.terrainMat, this.waterMesh?.material] as (THREE.RawShaderMaterial | undefined | null)[]) {
            if (!mat || !(mat instanceof THREE.RawShaderMaterial)) continue;
            mat.uniforms.u_textureAtlas.value  = tex;
            mat.uniforms.u_atlasRects.value    = rects;
            mat.uniforms.u_textureDebugMode.value = 0; // switch from flat → textured
        }

        this.textureAtlasReady = true;
    }

    // ── CPU-side terrain helpers (ported verbatim from HDRenderer) ────────────

    private static hueToRgb(p: number, q: number, t: number): number {
        if (t < 0) t += 1; else if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    }

    private static hslToRgb(hsl: number): readonly [number, number, number] {
        if (hsl < 0) return [0, 0, 0];
        const hue = ((hsl >> 10) & 0x3f) / 64;
        const sat = ((hsl >> 7) & 0x7) / 8;
        const lit = (hsl & 0x7f) / 128;
        if (sat === 0) return [lit, lit, lit];
        const q = lit < 0.5 ? lit * (1 + sat) : lit + sat - lit * sat;
        const p = 2 * lit - q;
        return [this.hueToRgb(p, q, hue + 1/3), this.hueToRgb(p, q, hue), this.hueToRgb(p, q, hue - 1/3)];
    }

    private static colourIndexToRgb(index: number): readonly [number, number, number] {
        if (index < 0) return [0, 0, 0];
        const rgb = Pix3D.colourTable[index & 0xffff];
        if (rgb === 0) return this.hslToRgb(index);
        return [((rgb >> 16) & 0xff) / 255, ((rgb >> 8) & 0xff) / 255, (rgb & 0xff) / 255];
    }

    private static averageColour(
        a: readonly [number, number, number],
        b: readonly [number, number, number],
        c: readonly [number, number, number]
    ): readonly [number, number, number] {
        return [(a[0]+b[0]+c[0])/3, (a[1]+b[1]+c[1])/3, (a[2]+b[2]+c[2])/3];
    }

    private static triangleNormal(
        a: readonly [number, number, number],
        b: readonly [number, number, number],
        c: readonly [number, number, number]
    ): readonly [number, number, number] {
        const abx=b[0]-a[0], aby=b[1]-a[1], abz=b[2]-a[2];
        const acx=c[0]-a[0], acy=c[1]-a[1], acz=c[2]-a[2];
        const nx=aby*acz-abz*acy, ny=abz*acx-abx*acz, nz=abx*acy-aby*acx;
        const len=Math.hypot(nx,ny,nz)||1;
        return [nx/len, ny/len, nz/len];
    }

    private static tileUv(p: readonly [number,number,number], tx: number, tz: number): readonly [number,number] {
        return [(p[0]-tx*128)/128, (p[2]-tz*128)/128];
    }

    private static normalKey(level: number, x: number, z: number): number {
        return level * 268435456 + x * 16384 + z;
    }

    private static isValid254Texture(t: number): boolean {
        return Number.isInteger(t) && t >= 0 && t < CACHE_TEXTURE_COUNT;
    }

    private static materialForColour(colour: readonly [number,number,number], fallback: number = HDMaterial.Default): number {
        const [r,g,b] = colour;
        const max=Math.max(r,g,b), min=Math.min(r,g,b);
        const sat=max-min, bright=(r+g+b)/3;
        if (b>r*1.15&&b>g*1.1&&sat>0.08) return HDMaterial.Water;
        if (r>0.50&&r>g*1.8&&b<g*0.6&&bright>0.35) return HDMaterial.Lava;
        if (g>r*1.08&&g>b*1.08&&sat>0.08) return bright<0.42?HDMaterial.Moss:HDMaterial.Foliage;
        if (r>0.34&&g<0.3&&b<0.25) return HDMaterial.Roof;
        if (r>g*1.08&&g>b*1.05&&bright<0.58) return HDMaterial.Wood;
        if (sat<0.08&&bright>0.56) return HDMaterial.Marble;
        if (sat<0.12&&bright>0.36) return HDMaterial.Metal;
        if (sat<0.14) return HDMaterial.Stone;
        return fallback;
    }

    private static materialForTexture(texture: number, colour: readonly [number,number,number] = [0.5,0.5,0.5]): number {
        const m = SERVER_TEXTURE_MATERIALS[texture];
        if (m !== undefined && m !== HDMaterial.Default) return m;
        return this.materialForColour(colour, HDMaterial.Default);
    }

    private static materialForFloor(_tile: HDGroundTileInput, _colour: readonly [number,number,number]): number {
        return HDMaterial.Default;
    }

    private static faceHeightDelta(a: readonly[number,number,number], b: readonly[number,number,number], c: readonly[number,number,number]): number {
        return Math.max(a[1],b[1],c[1]) - Math.min(a[1],b[1],c[1]);
    }

    private static isSpikeSheetTerrainFace(normal: readonly[number,number,number], cA: readonly[number,number,number], cB: readonly[number,number,number], cC: readonly[number,number,number]): boolean {
        if (normal[1] <= -0.65) return false;
        const [r,g,b] = this.averageColour(cA, cB, cC);
        const br = (r+g+b)/3;
        return br>0.32 && g>r*1.03 && b>r*0.78;
    }

    private static colourDistanceSq(a: readonly[number,number,number], b: readonly[number,number,number]): number {
        return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
    }

    private static averageTileColour(colours: readonly[number,number,number,number]): readonly[number,number,number] {
        const a=this.colourIndexToRgb(colours[0]), b=this.colourIndexToRgb(colours[1]);
        const c=this.colourIndexToRgb(colours[2]), d=this.colourIndexToRgb(colours[3]);
        return [(a[0]+b[0]+c[0]+d[0])/4, (a[1]+b[1]+c[1]+d[1])/4, (a[2]+b[2]+c[2]+d[2])/4];
    }

    private static isColourOverlayFace(tile: HDGroundTileInput, faceColour: readonly[number,number,number]): boolean {
        if (tile.overlayId < 0 || tile.texture >= 0) return false;
        const under = this.averageTileColour(tile.colours);
        const over  = this.averageTileColour(tile.secondaryColours);
        return this.colourDistanceSq(faceColour, over) < this.colourDistanceSq(faceColour, under);
    }

    private static waterSourceForTerrainFace(tile: HDGroundTileInput, textureCandidate: number): HDWaterSource {
        const textured = this.isValid254Texture(textureCandidate);
        if (tile.shape === PLAIN_TERRAIN_SHAPE) return textured ? HDWaterSource.PlainTerrain : HDWaterSource.PlainTerrainColour;
        return textured ? HDWaterSource.ShapedTerrain : HDWaterSource.ShapedTerrainColour;
    }

    private static pushVertex(
        floats: number[],
        position: readonly[number,number,number],
        normal:   readonly[number,number,number],
        colour:   readonly[number,number,number],
        material: number, texture: number,
        uv:       readonly[number,number],
        alpha: number, waterSource: number
    ): void {
        floats.push(
            position[0], position[1], position[2],
            normal[0],   normal[1],   normal[2],
            colour[0],   colour[1],   colour[2],
            material,
            uv[0], uv[1],
            texture,
            alpha,
            waterSource
        );
    }

    private static pushTriangle(
        floats: number[],
        a: readonly[number,number,number], b: readonly[number,number,number], c: readonly[number,number,number],
        cA: readonly[number,number,number], cB: readonly[number,number,number], cC: readonly[number,number,number],
        material: number, texture: number,
        uvA: readonly[number,number], uvB: readonly[number,number], uvC: readonly[number,number],
        alpha = 1,
        nA?: readonly[number,number,number], nB?: readonly[number,number,number], nC?: readonly[number,number,number],
        waterSource: number = HDWaterSource.None
    ): void {
        const fn = this.triangleNormal(a, b, c);
        this.pushVertex(floats, a, nA??fn, cA, material, texture, uvA, alpha, waterSource);
        this.pushVertex(floats, b, nB??fn, cB, material, texture, uvB, alpha, waterSource);
        this.pushVertex(floats, c, nC??fn, cC, material, texture, uvC, alpha, waterSource);
    }

    private static getGround(tile: HDGroundTileInput): Ground {
        const key = `${tile.level}:${tile.x}:${tile.z}`;
        let g = this.groundObjectCache.get(key);
        if (!g) {
            g = new Ground(
                tile.x, tile.z, tile.shape, tile.rotation, tile.texture,
                tile.heights[0], tile.heights[1], tile.heights[2], tile.heights[3],
                tile.colours[0], tile.colours[1], tile.colours[2], tile.colours[3],
                tile.secondaryColours[0], tile.secondaryColours[1], tile.secondaryColours[2], tile.secondaryColours[3],
                tile.overlay, tile.underlay
            );
            this.groundObjectCache.set(key, g);
        }
        return g;
    }

    private static buildSmoothNormals(camera?: HDCameraInput): void {
        this.smoothNormalCache.clear();
        const acc = new Map<number, [number,number,number]>();
        const minX = camera ? camera.minTileX - 1 : -Infinity;
        const maxX = camera ? camera.maxTileX + 1 :  Infinity;
        const minZ = camera ? camera.minTileZ - 1 : -Infinity;
        const maxZ = camera ? camera.maxTileZ + 1 :  Infinity;
        const maxLvl = camera ? camera.maxLevel : Infinity;

        for (const tile of this.groundTiles) {
            if (tile.level > maxLvl || tile.x < minX || tile.x > maxX || tile.z < minZ || tile.z > maxZ) continue;
            const ground = this.getGround(tile);
            for (let i = 0; i < ground.faceVertexA.length; i++) {
                const a = ground.faceVertexA[i], b = ground.faceVertexB[i], c = ground.faceVertexC[i];
                const pa: [number,number,number] = [ground.vertexX[a], ground.vertexY[a], ground.vertexZ[a]];
                const pb: [number,number,number] = [ground.vertexX[b], ground.vertexY[b], ground.vertexZ[b]];
                const pc: [number,number,number] = [ground.vertexX[c], ground.vertexY[c], ground.vertexZ[c]];
                const [nx,ny,nz] = this.triangleNormal(pa, pb, pc);
                for (const p of [pa, pb, pc]) {
                    const key = this.normalKey(tile.level, p[0], p[2]);
                    const n = acc.get(key);
                    if (n) { n[0]+=nx; n[1]+=ny; n[2]+=nz; }
                    else   { acc.set(key, [nx, ny, nz]); }
                }
            }
        }

        for (const [key, n] of acc) {
            const len = Math.hypot(n[0],n[1],n[2]) || 1;
            this.smoothNormalCache.set(key, [n[0]/len, n[1]/len, n[2]/len]);
        }
    }

    private static tileVisibleForCamera(tile: HDGroundTileInput, cam: HDCameraInput): boolean {
        return tile.level <= cam.maxLevel &&
            tile.x >= cam.minTileX && tile.z >= cam.minTileZ &&
            tile.x <  cam.maxTileX && tile.z <  cam.maxTileZ;
    }

    private static buildTerrainVertices(camera?: HDCameraInput): { land: Float32Array; water: Float32Array } {
        const land: number[] = [], water: number[] = [];

        for (const tile of this.groundTiles) {
            if (camera && !this.tileVisibleForCamera(tile, camera)) continue;
            this.pushGroundTile(land, water, tile);
        }

        return { land: new Float32Array(land), water: new Float32Array(water) };
    }

    // ── Model-specific helpers ────────────────────────────────────────────────

    private static fixedSin(angle: number): number {
        return Math.round(Math.sin((angle & 0x7ff) * Math.PI / 1024) * 65536);
    }

    private static fixedCos(angle: number): number {
        return Math.round(Math.cos((angle & 0x7ff) * Math.PI / 1024) * 65536);
    }

    private static materialForModelTexture(texture: number, colour: readonly [number,number,number] = [0.5,0.5,0.5]): number {
        const m = this.materialForTexture(texture, colour);
        return (m === HDMaterial.Water || m === HDMaterial.Lava) ? HDMaterial.Model : m;
    }

    private static materialForModelColour(colour: readonly [number,number,number]): number {
        const m = this.materialForColour(colour, HDMaterial.Model);
        return (m === HDMaterial.Water || m === HDMaterial.Lava) ? HDMaterial.Model : m;
    }

    private static alphaForFace(alpha: number): number {
        if (alpha <= 0) return 1;
        return Math.max(0.05, Math.min(1, 1 - alpha / 255));
    }

    private static viewDepth(rx: number, ry: number, rz: number): number {
        const cam = this.currentCamera;
        if (!cam) return 0;
        const sp = cam.sinEyePitch / 65536, cp = cam.cosEyePitch / 65536;
        const sy = cam.sinEyeYaw   / 65536, cy = cam.cosEyeYaw   / 65536;
        const zp = rz * cy - rx * sy;
        return ry * sp + zp * cp;
    }

    private static faceDepth(
        a: readonly [number,number,number],
        b: readonly [number,number,number],
        c: readonly [number,number,number]
    ): number {
        const cam = this.currentCamera;
        if (!cam) return 0;
        return (
            this.viewDepth(a[0]-cam.eyeX, a[1]-cam.eyeY, a[2]-cam.eyeZ) +
            this.viewDepth(b[0]-cam.eyeX, b[1]-cam.eyeY, b[2]-cam.eyeZ) +
            this.viewDepth(c[0]-cam.eyeX, c[1]-cam.eyeY, c[2]-cam.eyeZ)
        ) / 3;
    }

    private static modelObjectId(model: HDModelInput): number {
        let id = this.modelObjectIds.get(model as object);
        if (!id) { id = this.nextModelObjectId++; this.modelObjectIds.set(model as object, id); }
        return id;
    }

    private static pushGroundTile(land: number[], water: number[], tile: HDGroundTileInput): void {
        const ground = this.getGround(tile);

        for (let i = 0; i < ground.faceVertexA.length; i++) {
            const a = ground.faceVertexA[i], b = ground.faceVertexB[i], c = ground.faceVertexC[i];
            const pa: [number,number,number] = [ground.vertexX[a], ground.vertexY[a], ground.vertexZ[a]];
            const pb: [number,number,number] = [ground.vertexX[b], ground.vertexY[b], ground.vertexZ[b]];
            const pc: [number,number,number] = [ground.vertexX[c], ground.vertexY[c], ground.vertexZ[c]];

            const tcand = ground.faceTexture && ground.faceTexture[i] >= 0 ? ground.faceTexture[i] : -1;
            let texture = this.isValid254Texture(tcand) ? tcand : -1;

            const cA = this.colourIndexToRgb(ground.faceColourA[i]);
            const cB = this.colourIndexToRgb(ground.faceColourB[i]);
            const cC = this.colourIndexToRgb(ground.faceColourC[i]);
            const avg = this.averageColour(cA, cB, cC);

            const texturedOverlay = ground.faceTexture !== null && ground.faceTexture[i] >= 0;
            const isOverlay = texturedOverlay || this.isColourOverlayFace(tile, avg);
            let material = this.isValid254Texture(texture)
                ? this.materialForTexture(texture, avg)
                : this.materialForFloor(tile, avg);

            if (material === HDMaterial.Water && texture === -1) texture = 1;

            const faceNormal = this.triangleNormal(pa, pb, pc);
            if (faceNormal[1] > -0.15 || this.isSpikeSheetTerrainFace(faceNormal, cA, cB, cC)) continue;

            const nA = material === HDMaterial.Water ? faceNormal : (this.smoothNormalCache.get(this.normalKey(tile.level, pa[0], pa[2])) ?? faceNormal);
            const nB = material === HDMaterial.Water ? faceNormal : (this.smoothNormalCache.get(this.normalKey(tile.level, pb[0], pb[2])) ?? faceNormal);
            const nC = material === HDMaterial.Water ? faceNormal : (this.smoothNormalCache.get(this.normalKey(tile.level, pc[0], pc[2])) ?? faceNormal);

            const uvA = this.tileUv(pa, tile.x, tile.z);
            const uvB = this.tileUv(pb, tile.x, tile.z);
            const uvC = this.tileUv(pc, tile.x, tile.z);

            if (material === HDMaterial.Water) {
                if (this.faceHeightDelta(pa, pb, pc) > WATER_SURFACE_MAX_HEIGHT_DELTA) continue;
                const wSource = this.waterSourceForTerrainFace(tile, tcand);
                this.pushTriangle(water, pa, pb, pc, cA, cB, cC, material, texture, uvA, uvB, uvC, 1, faceNormal, faceNormal, faceNormal, wSource);

                const sbNorm = this.triangleNormal(pa, pb, pc);
                if (sbNorm[1] <= -0.15) {
                    const waterY = Math.max(pa[1], pb[1], pc[1]);
                    const dA = Math.min(1, Math.max(0, waterY - pa[1]) / WATER_SURFACE_MAX_HEIGHT_DELTA);
                    const dB = Math.min(1, Math.max(0, waterY - pb[1]) / WATER_SURFACE_MAX_HEIGHT_DELTA);
                    const dC = Math.min(1, Math.max(0, waterY - pc[1]) / WATER_SURFACE_MAX_HEIGHT_DELTA);
                    this.pushTriangle(land, pa, pb, pc, cA, cB, cC, HDMaterial.Seabed, -1, uvA, uvB, uvC, (dA+dB+dC)/3, sbNorm, sbNorm, sbNorm, HDWaterSource.None);
                }
            } else {
                this.pushTriangle(land, pa, pb, pc, cA, cB, cC, material, texture, uvA, uvB, uvC, 1, nA, nB, nC, HDWaterSource.None);
            }

            void isOverlay; // used only for future overlay-specific material detection
        }
    }

    private static updateSkybox(cam: HDCameraInput): void {
        const u = this.skyboxMat?.uniforms;
        if (!u) {
            return;
        }

        u.u_sinEyePitch.value     = cam.sinEyePitch / 65536;
        u.u_cosEyePitch.value     = cam.cosEyePitch / 65536;
        u.u_sinEyeYaw.value       = cam.sinEyeYaw   / 65536;
        u.u_cosEyeYaw.value       = cam.cosEyeYaw   / 65536;

        // Projection scale: (2*focalLength) / viewportDimension, matching setCameraUniforms.
        (u.u_projectionScale.value as THREE.Vector2).set(
            (2 * FOCAL_LENGTH) / VIEWPORT_WIDTH,
            (2 * FOCAL_LENGTH) / VIEWPORT_HEIGHT
        );

        // Allow runtime tuning via browser console (mirrors HDRenderer behaviour).
        const g = globalThis as any;
        const hr = Number.isFinite(+g.HD_SKY_HORIZON_R) ? +g.HD_SKY_HORIZON_R : 0.64;
        const hg = Number.isFinite(+g.HD_SKY_HORIZON_G) ? +g.HD_SKY_HORIZON_G : 0.78;
        const hb = Number.isFinite(+g.HD_SKY_HORIZON_B) ? +g.HD_SKY_HORIZON_B : 0.92;
        const zr = Number.isFinite(+g.HD_SKY_ZENITH_R)  ? +g.HD_SKY_ZENITH_R  : 0.28;
        const zg = Number.isFinite(+g.HD_SKY_ZENITH_G)  ? +g.HD_SKY_ZENITH_G  : 0.52;
        const zb = Number.isFinite(+g.HD_SKY_ZENITH_B)  ? +g.HD_SKY_ZENITH_B  : 0.82;

        (u.u_skyHorizon.value as THREE.Vector3).set(hr, hg, hb);
        (u.u_skyZenith.value  as THREE.Vector3).set(zr, zg, zb);
    }

    private static syncRendererSize(renderer: THREE.WebGLRenderer): void {
        // The Three.js canvas is sized to the 3D viewport only (512×334 logical).
        // The projectionScale uniform in the terrain/model shader maps NDC space
        // to this exact aspect ratio, so the canvas must not be larger than the
        // viewport or the projection will be wrong.
        const scale = Math.min(window.devicePixelRatio || 1, 2.5);
        const w = Math.max(1, Math.round(VIEWPORT_WIDTH  * scale));
        const h = Math.max(1, Math.round(VIEWPORT_HEIGHT * scale));

        if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
            renderer.setSize(w, h, false);
        }
    }

    // =========================================================================
    // Camera conversion — 2004 RS angles → Three.js PerspectiveCamera
    //
    // 2004 RS coordinate system: X east, Y down, Z south.
    // Three.js coordinate system: X east, Y up, Z toward viewer.
    //
    // The RS view transform (from the terrain vertex shader) is:
    //   zPrime = relZ*cosYaw - relX*sinYaw
    //   viewX  = relZ*sinYaw + relX*cosYaw
    //   viewY  = relY*cosPitch - zPrime*sinPitch
    //   viewZ  = relY*sinPitch + zPrime*cosPitch
    //
    // This is R_pitch * R_yaw applied to (relX, relY, relZ).
    // The camera looks along RS +Z (viewZ = depth); in Three.js the camera
    // looks along its local -Z, so we flip the Z column of the rotation.
    // =========================================================================

    private static applyRSCamera(cam: HDCameraInput): void {
        // Normalise fixed-point trig values (stored as integer * 65536).
        const sinYaw   =  cam.sinEyeYaw   / 65536;
        const cosYaw   =  cam.cosEyeYaw   / 65536;
        const sinPitch =  cam.sinEyePitch  / 65536;
        const cosPitch =  cam.cosEyePitch  / 65536;

        // Camera world position: flip Y because RS Y is down, Three.js Y is up.
        this.camera.position.set(cam.eyeX, -cam.eyeY, cam.eyeZ);

        // Build the camera world rotation matrix from the RS view transform.
        // The RS view matrix rows are the camera's right/up/forward vectors
        // expressed in RS world space.  We invert Y so they live in Three.js space.
        //
        // RS right   = ( cosYaw,            0,             sinYaw          )
        // RS up      = (-sinYaw*sinPitch,   cosPitch,      cosYaw*sinPitch ) ← negate Y col
        // RS forward = ( sinYaw*cosPitch,   sinPitch,     -cosYaw*cosPitch ) ← negate to flip look dir
        //
        // Three.js matrix convention is column-major; Matrix4.set() takes rows.
        const m = new THREE.Matrix4();
        m.set(
            // col0 (right)      col1 (up)           col2 (back = -forward)  col3 (pos)
             cosYaw,            -sinYaw * sinPitch,  -sinYaw * cosPitch,     cam.eyeX,
             0,                  cosPitch,            sinPitch,              -cam.eyeY,
             sinYaw,             cosYaw  * sinPitch,  cosYaw  * cosPitch,    cam.eyeZ,
             0,                  0,                   0,                     1
        );

        this.camera.matrixAutoUpdate = false;
        this.camera.matrixWorld.copy(m);
        this.camera.matrixWorldInverse.copy(m).invert();
    }

    // =========================================================================
    // Compositing — blit Three.js off-DOM canvas into the 2D game canvas
    // =========================================================================

    private static compositeToGameCanvas(): void {
        const renderer = this.renderer;
        if (!renderer) {
            return;
        }

        const threeCanvas = renderer.domElement;
        const gameCanvas  = document.getElementById('canvas') as HTMLCanvasElement | null;
        const gameCtx     = gameCanvas?.getContext('2d');
        if (!gameCanvas || !gameCtx || threeCanvas.width <= 0 || threeCanvas.height <= 0) {
            return;
        }

        // The Three.js canvas is viewport-sized (512×334 × DPR).
        // Copy the entire Three.js canvas into the viewport slot on the game
        // 2D canvas.  drawImage handles the DPR scaling automatically.
        gameCtx.drawImage(
            threeCanvas,
            0, 0, threeCanvas.width, threeCanvas.height,
            VIEWPORT_X, VIEWPORT_Y, VIEWPORT_WIDTH, VIEWPORT_HEIGHT
        );
    }

    // =========================================================================
    // Public API — identical surface to HDRenderer
    // =========================================================================

    static setEnabled(enabled: boolean): HDRendererStatus {
        this.enabled = enabled;

        if (!enabled) {
            this.frameStarted = false;
            return this.status();
        }

        this.sceneDirty = true;
        this.frameStarted = false;
        this.init();
        return this.status(false);
    }

    static status(syncTerrain: boolean = true): HDRendererStatus {
        void syncTerrain; // terrain sync will be wired up when terrain pass is ported
        return {
            enabled: this.enabled,
            available: this.ready,
            reason: this.reason,
            groundTileCount: this.groundTiles.length,
            terrainVertexCount: 0,
            modelDrawCount: this.modelDrawCount,
            modelVertexCount: this.modelVertexCount,
            modelBatchCount: this.modelBatchCount,
            clippedTriangleCount: this.clippedTriangleCount,
            skippedBackfaceCount: this.skippedBackfaceCount,
            materialCounts: [...this.materialCounts],
            textureAtlasReady: this.textureAtlasReady,
            textureAtlasLoadedCount: this.textureAtlasLoadedCount,
            textureUseCounts: [...this.textureUseCounts],
            untexturedTriangleCount: this.untexturedTriangleCount,
            invalidTextureCount: this.invalidTextureCount,
        };
    }

    static isEnabled(): boolean {
        return this.enabled;
    }

    static startSafeWarmup(frames: number = 120): void {
        this.safeWarmupFrames = Math.max(this.safeWarmupFrames, frames | 0);
    }

    static isSafeWarmupActive(): boolean {
        return this.safeWarmupFrames > 0;
    }

    static prewarmAtlas(): void {
        if (!this.enabled) {
            return;
        }
        this.init();
        this.ensureTextureAtlas();
    }

    // ── Ground tiles ─────────────────────────────────────────────────────────

    static addGroundTile(tile: HDGroundTileInput): void {
        const key = `${tile.level}:${tile.x}:${tile.z}`;
        this.groundTiles.push(tile);
        this.groundTileMap.set(key, tile);
        this.sceneDirty = true;
    }

    static prepareTerrain(): void {
        // Smooth normal generation will be added when terrain pass is ported.
    }

    static queueGroundTile(level: number, x: number, z: number): void {
        if (!this.enabled || !this.frameStarted) {
            return;
        }
        this.visibleGroundKeys.add(`${level}:${x}:${z}`);
    }

    static resetScene(): void {
        this.groundTiles.length = 0;
        this.groundTileMap.clear();
        this.visibleGroundKeys.clear();
        this.groundObjectCache.clear();
        this.smoothNormalCache.clear();
        this.lastCameraRange = null;
        this.sceneDirty = true;
        this.staticFarSceneKey = '';
        this.staticFarGpuDirty = true;
        this.staticFarSceneBuilding = false;
        this.staticFarBatches.clear();
        this.staticFarTransBatches.length = 0;
        this.pendingFarBatches.clear();
        this.pendingFarTransBatches.length = 0;
    }

    // ── Far-scene cache ───────────────────────────────────────────────────────

    static beginStaticFarScene(key: string): boolean {
        if ((globalThis as any).DISABLE_HD_FAR_MODELS === true) {
            return false;
        }
        if (this.staticFarSceneKey === key && !this.staticFarGpuDirty) {
            return false; // reuse existing GPU meshes, skip rebuild
        }
        this.pendingFarBatches.clear();
        this.pendingFarTransBatches.length = 0;
        this.staticFarSceneBuilding = true;
        this.staticFarSceneKey = key;
        return true;
    }

    static endStaticFarScene(): void {
        if (this.staticFarSceneBuilding) {
            this.staticFarBatches = this.pendingFarBatches;
            this.staticFarTransBatches = this.pendingFarTransBatches;
            this.pendingFarBatches = new Map();
            this.pendingFarTransBatches = [];
            this.staticFarGpuDirty = true; // meshes need rebuilding
        }
        this.staticFarSceneBuilding = false;
    }

    static invalidateStaticFarScene(): void {
        this.staticFarSceneKey = '';
        this.staticFarGpuDirty = true;
        this.staticFarBatches.clear();
        this.staticFarTransBatches.length = 0;
    }

    // ── Frame lifecycle ───────────────────────────────────────────────────────

    static beginFrame(camera: HDCameraInput): void {
        if (!this.enabled) {
            return;
        }

        this.init();
        this.currentCamera = camera;
        this.visibleGroundKeys.clear();
        this.modelBatches.clear();
        this.transparentBatches.length = 0;
        this.dynamicModelBatches.clear();
        this.dynamicTransparentBatches.length = 0;
        this.queuedModelKeys.clear();
        this.modelDrawCount = 0;
        this.modelVertexCount = 0;
        this.modelBatchCount = 0;
        this.dynamicModelDrawCount = 0;
        this.dynamicModelVertexCount = 0;
        this.farModelDrawCount = 0;
        this.clippedTriangleCount = 0;
        this.skippedBackfaceCount = 0;
        this.materialCounts = new Array(14).fill(0);
        this.textureUseCounts = new Array(50).fill(0);
        this.untexturedTriangleCount = 0;
        this.invalidTextureCount = 0;
        this.frameStarted = true;
        this.frameNumber++;
    }

    static beginDynamicModelQueue(): void {
        this.dynamicModelQueueing = true;
    }

    static endDynamicModelQueue(): void {
        this.dynamicModelQueueing = false;
    }

    // ── Model queuing ─────────────────────────────────────────────────────────

    static queueModel(
        model: HDModelInput,
        yaw: number,
        relativeX: number,
        relativeY: number,
        relativeZ: number
    ): void {
        if (!this.enabled || !this.frameStarted || !this.currentCamera) return;
        if ((globalThis as any).DISABLE_HD_MODELS === true) return;

        const cam = this.currentCamera;
        const isDynamic = this.dynamicModelQueueing;
        const isFar     = (globalThis as any)._HD_FAR_SCENE_QUEUING === true;

        // Distance budget.
        const maxDist = Number((globalThis as any).HD_MODEL_DISTANCE ?? 6400);
        if (relativeX**2 + relativeY**2 + relativeZ**2 > maxDist**2) return;

        const warmup = this.safeWarmupFrames > 0;

        // Draw-count budget.
        const budget = Number((globalThis as any).HD_MODEL_BUDGET ?? (isFar ? 9000 : (warmup ? 650 : 1600)));
        if (!isDynamic && this.modelDrawCount >= budget) return;
        if (isDynamic) {
            const dynBudget = Number((globalThis as any).HD_DYNAMIC_MODEL_BUDGET ?? 1024);
            if (this.dynamicModelDrawCount >= dynBudget) return;
        }
        if (isFar) {
            const farBudget = Number((globalThis as any).HD_FAR_MODEL_BUDGET ?? (warmup ? 2500 : 9000));
            if (this.farModelDrawCount >= farBudget) return;
        }

        if (!model.vertexX || !model.vertexY || !model.vertexZ ||
            !model.faceVertexA || !model.faceVertexB || !model.faceVertexC ||
            !model.faceColourA) return;

        const faceCount = model.faceCount ?? 0;
        if (faceCount <= 0 || faceCount > Number((globalThis as any).HD_MODEL_MAX_FACES ?? 1200)) return;

        // Vertex budget.
        const vBudget = Number((globalThis as any).HD_MODEL_VERTEX_BUDGET ?? (isFar ? 1800000 : (warmup ? 120000 : 320000)));
        if (isDynamic) {
            const dvb = Number((globalThis as any).HD_DYNAMIC_VERTEX_BUDGET ?? 500000);
            if (this.dynamicModelVertexCount + faceCount * 3 > dvb) return;
        } else if (this.modelVertexCount + faceCount * 3 > vBudget) return;

        // Dedup within frame.
        const modelKey = `${isDynamic?'d':'m'}:${this.modelObjectId(model)}:${yaw}:${relativeX}:${relativeY}:${relativeZ}`;
        if (this.queuedModelKeys.has(modelKey)) return;
        this.queuedModelKeys.add(modelKey);

        // Transform vertices to world space.
        const sinYaw = yaw === 0 ? 0 : this.fixedSin(yaw);
        const cosYaw = yaw === 0 ? 0 : this.fixedCos(yaw);
        const vx = model.vertexX, vy = model.vertexY, vz = model.vertexZ;
        const wx = new Int32Array(model.vertexCount);
        const wy = new Int32Array(model.vertexCount);
        const wz = new Int32Array(model.vertexCount);

        for (let v = 0; v < model.vertexCount; v++) {
            let x = vx[v], z = vz[v];
            if (yaw !== 0) {
                const rx = (z * sinYaw + x * cosYaw) >> 16;
                z        = (z * cosYaw - x * sinYaw) >> 16;
                x = rx;
            }
            wx[v] = cam.eyeX + relativeX + x;
            wy[v] = cam.eyeY + relativeY + vy[v];
            wz[v] = cam.eyeZ + relativeZ + z;
        }

        const cacheFar = this.staticFarSceneBuilding && isFar;
        const targetOpaque = cacheFar   ? this.pendingFarBatches
                           : isDynamic  ? this.dynamicModelBatches
                                        : this.modelBatches;
        const targetTrans  = cacheFar   ? this.pendingFarTransBatches
                           : isDynamic  ? this.dynamicTransparentBatches
                                        : this.transparentBatches;

        for (let f = 0; f < faceCount; f++) {
            if (model.faceRenderType && model.faceRenderType[f] === -1) continue;
            if (model.faceAlpha && model.faceAlpha[f] >= 254) continue;

            const a = model.faceVertexA[f];
            const b = model.faceVertexB[f];
            const c = model.faceVertexC[f];
            const pa: [number,number,number] = [wx[a], wy[a], wz[a]];
            const pb: [number,number,number] = [wx[b], wy[b], wz[b]];
            const pc: [number,number,number] = [wx[c], wy[c], wz[c]];

            const type = model.faceRenderType ? model.faceRenderType[f] & 0x3 : 0;
            const texturedFace = model.faceRenderType ? model.faceRenderType[f] >> 2 : -1;
            const hasBasis = type >= 2 &&
                texturedFace >= 0 &&
                model.faceTextureP !== null && model.faceTextureM !== null && model.faceTextureN !== null &&
                texturedFace < model.faceTextureP.length;
            const texCand = hasBasis && model.faceColour ? model.faceColour[f] : -1;
            const texture = this.isValid254Texture(texCand) ? texCand : -1;

            const cA = this.colourIndexToRgb(model.faceColourA[f]);
            const cB = this.colourIndexToRgb(model.faceColourB ? model.faceColourB[f] : model.faceColourA[f]);
            const cC = this.colourIndexToRgb(model.faceColourC ? model.faceColourC[f] : model.faceColourA[f]);
            const avg = this.averageColour(cA, cB, cC);

            const texMat = this.isValid254Texture(texture) ? this.materialForModelTexture(texture, avg) : HDMaterial.Default;
            const modelTex = texture >= 0 && texMat !== HDMaterial.Default;
            const material = type === 1
                ? HDMaterial.Unlit
                : modelTex
                ? (texMat !== HDMaterial.Default ? texMat : this.materialForModelColour(avg))
                : HDMaterial.Model;

            const norm = this.triangleNormal(pa, pb, pc);
            if (material === HDMaterial.Water && this.faceHeightDelta(pa, pb, pc) > WATER_SURFACE_MAX_HEIGHT_DELTA) continue;

            const alphaByte = model.faceAlpha ? model.faceAlpha[f] : 0;
            const alpha = this.alphaForFace(alphaByte);

            const uvA: [number,number] = [0, 0];
            const uvB: [number,number] = [1, 0];
            const uvC: [number,number] = [0, 1];

            const batchKey = modelTex ? texture : -1;
            const vertsBefore = alpha < 1 ? 0 : (targetOpaque.get(batchKey) ?? []).length;

            const batch = alpha < 1 ? [] : (targetOpaque.get(batchKey) ?? []);
            if (alpha >= 1) targetOpaque.set(batchKey, batch);

            this.pushVertex(batch, pa, norm, cA, material, batchKey, uvA, alpha, HDWaterSource.None);
            this.pushVertex(batch, pb, norm, cB, material, batchKey, uvB, alpha, HDWaterSource.None);
            this.pushVertex(batch, pc, norm, cC, material, batchKey, uvC, alpha, HDWaterSource.None);

            if (alpha < 1) {
                targetTrans.push({
                    depth: this.faceDepth(pa, pb, pc),
                    texture: batchKey,
                    vertices: batch
                });
            }

            const vAdded = 3 * VERTEX_FLOATS;
            if (isDynamic) this.dynamicModelVertexCount += vAdded;
            else           this.modelVertexCount        += vAdded;
            void vertsBefore;
        }

        if (isDynamic) this.dynamicModelDrawCount++;
        else           this.modelDrawCount++;
        if (isFar)     this.farModelDrawCount++;
    }

    // ── Render ────────────────────────────────────────────────────────────────

    static renderFrame(): void {
        if (!this.enabled || !this.renderer || !this.currentCamera) {
            this.frameStarted = false;
            return;
        }

        try {
            const renderer  = this.renderer;
            const cam       = this.currentCamera;

            this.syncRendererSize(renderer);
            this.ensureTextureAtlas();
            this.syncTerrain(cam);
            this.uploadFarSceneModels();
            this.uploadAndDrawModels();
            this.buildLightSpaceMatrix(cam);

            if ((globalThis as any).ENABLE_HD_SHADOWS !== false) {
                this.renderShadowPass();
            }
            this.applyRSCamera(cam);
            this.updateSkybox(cam);
            this.updateTerrainUniforms(cam);

            // Update camera aspect to match the current viewport proportions.
            this.camera.aspect = CAMERA_ASPECT;
            this.camera.updateProjectionMatrix();

            // Render the scene (skybox + future terrain / model passes).
            renderer.render(this.scene, this.camera);

            // Composite the viewport region into the 2D game canvas.
            this.compositeToGameCanvas();

            if (this.safeWarmupFrames > 0) {
                this.safeWarmupFrames--;
            }
        } catch (e) {
            this.reason = e instanceof Error ? e.message : String(e);
            this.enabled = false;
        } finally {
            this.frameStarted = false;
        }
    }

    // ── UI compositing ────────────────────────────────────────────────────────

    private static readonly HD_ALWAYS_VISIBLE_TERRAIN_TILES: Set<string> = new Set([
        '0:3240:3226','0:3241:3226','0:3242:3226','0:3243:3226','0:3244:3226',
        '0:3245:3226','0:3246:3226','0:3247:3226','0:3248:3226','0:3249:3226','0:3250:3226',
        '0:3240:3225','0:3241:3225','0:3242:3225','0:3243:3225','0:3244:3225',
        '0:3245:3225','0:3246:3225','0:3247:3225','0:3248:3225','0:3249:3225','0:3250:3225',
    ]);

    static isAlwaysVisibleTerrainTile(level: number, x: number, z: number): boolean {
        return this.HD_ALWAYS_VISIBLE_TERRAIN_TILES.has(`${level}:${x}:${z}`);
    }

    static isWebglUiMode(): boolean {
        // Return false so the game continues to use PixMap → canvas2d for all 2D
        // UI rendering.  The Three.js canvas is off-DOM; compositing is one-way
        // (Three.js → game 2D canvas) via compositeToGameCanvas().  Returning true
        // here would signal callers to skip the 2D path, which breaks UI.
        return false;
    }

    static presentSoftwareCanvas(): boolean {
        // Not needed for the browser/web flow: PixMap draws 2D UI directly to the
        // visible game 2D canvas; compositeToGameCanvas() already overlays the 3D
        // scene.  Returns false so any caller falls back to its own draw path.
        return false;
    }

    static drawPixMapLayer(_imageData: ImageData, _x: number, _y: number, _keyed: boolean): boolean {
        // Same rationale as presentSoftwareCanvas — no caller in the current
        // codebase, and the 2D canvas path handles all UI layers correctly.
        return false;
    }
}
