import Pix3D from '#/dash3d/Pix3D.js';
import Ground from '#/dash3d/Ground.js';

type ShaderSource = {
    vertex: string;
    fragment: string;
};

type TextureAtlasRect = {
    u0: number;
    v0: number;
    u1: number;
    v1: number;
};

type TransparentBatch = {
    depth: number;
    priority: number;
    texture: number;
    vertices: number[];
};

type HDClipVertex = {
    position: [number, number, number];
    colour: [number, number, number];
    uv: [number, number];
    depth: number;
};

const enum HDMaterial {
    Default = 0,
    Water = 1,
    Lava = 2,
    Model = 3,
    Stone = 4,
    Wood = 5,
    Marble = 6,
    Moss = 7,
    Pebble = 8,
    Foliage = 9,
    Metal = 10,
    Roof = 11,
    Unlit = 12,
    Earth = 13
}

const enum HDWaterSource {
    None = 0,
    PlainTerrain = 1,
    ShapedTerrain = 2,
    Model = 3,
    PlainTerrainColour = 4,
    ShapedTerrainColour = 5
}

const VERTEX_FLOATS = 15;
const VIEWPORT_WIDTH = 512;
const VIEWPORT_HEIGHT = 334;
const VIEWPORT_X = 4;
const VIEWPORT_Y = 4;
const TEXTURE_SIZE = 128;
const ATLAS_COLS = 16;
const ATLAS_ROWS = 8;
const ATLAS_SIZE = ATLAS_COLS * ATLAS_ROWS;
const CACHE_TEXTURE_COUNT = 50;
const SHADOW_MAP_SIZE = 1024;
const WATER_SURFACE_MAX_HEIGHT_DELTA = 48;
const TRANSPARENT_MODEL_MAX_HEIGHT_DELTA = 192;
const PLAIN_TERRAIN_SHAPE = 0;
const HD_RENDERER_BUILD = process.env.BUILD_TIME;
const HD_SKY_COLOUR = [0.24, 0.28, 0.31] as const;
const HD_FOG_START = 2600;
const HD_FOG_END = 5200;
const HD_FAR_PLANE = 9000;

const shadowShader: ShaderSource = {
    vertex: `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_lightSpaceMatrix;
void main() {
    gl_Position = u_lightSpaceMatrix * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
precision highp float;
void main() {}
`
};

const GRASS_FLOOR_IDS = new Set([
    28, 47, 50, 92, 95, 98, 99
]);

const EARTH_FLOOR_IDS = new Set([
    9, 13, 14, 15, 16, 20, 21, 22, 33, 35, 43, 48, 49, 51, 52, 53,
    60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 75, 76, 78, 79, 80,
    82, 84, 87, 88, 89, 90, 91, 93, 96, 97, 100
]);

const STONE_FLOOR_IDS = new Set([
    0, 1, 2, 3, 7, 10, 24, 25, 29, 30, 32, 54, 55, 56, 57, 58, 59,
    71, 72, 74, 81, 86, 94
]);

const TERRAIN_ONLY_MODEL_TEXTURE_IDS = new Set([
    1, 24, 25, 31
]);

// Source filenames from LostCityRS-Progressive/Server/content/pack/texture.pack.
// These are packed into the client cache as numeric archives 0.dat..49.dat.
const SERVER_TEXTURE_NAMES: readonly string[] = [
    'door',
    'water',
    'wall',
    'planks',
    'elfdoor',
    'darkwood',
    'roof',
    'damage',
    'leafytree',
    'treestump',
    'leafybase',
    'mossy',
    'railings',
    'painting1',
    'painting2',
    'marble',
    'wood2',
    'fountain',
    'thatched',
    'cargonet',
    'books',
    'elfroof2',
    'elfwood',
    'mossybricks',
    'water_animated',
    'gungywater',
    'web',
    'elfroof',
    'mossydamage',
    'bamboo',
    'willowtex3',
    'lava',
    'bark',
    'mapletree',
    'yewtree',
    'elfbrick',
    'elfwall',
    'chainmail',
    'mummy',
    'elfpainting',
    'jungleleaf4',
    'plant',
    'jungleleaf2',
    'plant2',
    'roof2',
    'door2',
    'pebblefloor',
    'rockwall',
    'glyphs',
    'canvas'
];

// Materials are based on the 2004 source texture at each ID, not just the newer
// RLHD display name. Some OSRS labels describe later reuse of the same vanilla ID.
const SERVER_TEXTURE_MATERIALS: readonly HDMaterial[] = [
    HDMaterial.Wood,    // 0  door
    HDMaterial.Water,   // 1  water
    HDMaterial.Stone,   // 2  wall
    HDMaterial.Wood,    // 3  planks
    HDMaterial.Wood,    // 4  elfdoor
    HDMaterial.Wood,    // 5  darkwood
    HDMaterial.Roof,    // 6  roof
    HDMaterial.Wood,    // 7  damage
    HDMaterial.Foliage, // 8  leafytree
    HDMaterial.Wood,    // 9  treestump
    HDMaterial.Moss,    // 10 leafybase
    HDMaterial.Stone,   // 11 mossy
    HDMaterial.Metal,   // 12 railings
    HDMaterial.Unlit,   // 13 painting1
    HDMaterial.Unlit,   // 14 painting2
    HDMaterial.Marble,  // 15 marble
    HDMaterial.Wood,    // 16 wood2
    HDMaterial.Water,   // 17 fountain
    HDMaterial.Wood,    // 18 thatched
    HDMaterial.Unlit,   // 19 cargonet
    HDMaterial.Wood,    // 20 books
    HDMaterial.Roof,    // 21 elfroof2
    HDMaterial.Wood,    // 22 elfwood
    HDMaterial.Stone,   // 23 mossybricks
    HDMaterial.Water,   // 24 water_animated
    HDMaterial.Water,   // 25 gungywater
    HDMaterial.Unlit,   // 26 web
    HDMaterial.Roof,    // 27 elfroof
    HDMaterial.Moss,    // 28 mossydamage
    HDMaterial.Foliage, // 29 bamboo
    HDMaterial.Foliage, // 30 willowtex3
    HDMaterial.Lava,    // 31 lava
    HDMaterial.Wood,    // 32 bark
    HDMaterial.Foliage, // 33 mapletree
    HDMaterial.Foliage, // 34 yewtree
    HDMaterial.Stone,   // 35 elfbrick
    HDMaterial.Wood,    // 36 elfwall
    HDMaterial.Metal,   // 37 chainmail
    HDMaterial.Default, // 38 mummy
    HDMaterial.Unlit,   // 39 elfpainting
    HDMaterial.Foliage, // 40 jungleleaf4
    HDMaterial.Foliage, // 41 plant
    HDMaterial.Foliage, // 42 jungleleaf2
    HDMaterial.Foliage, // 43 plant2
    HDMaterial.Roof,    // 44 roof2
    HDMaterial.Wood,    // 45 door2
    HDMaterial.Pebble,  // 46 pebblefloor
    HDMaterial.Stone,   // 47 rockwall
    HDMaterial.Stone,   // 48 glyphs
    HDMaterial.Unlit    // 49 canvas
];

const SERVER_TRANSPARENT_TEXTURE_IDS = new Set([
    7, 8, 9, 12, 17, 19, 21, 26, 28, 29, 30, 33, 34, 40, 41, 42, 43
]);

// OSRS/RLHD names for the same numeric vanillaTextureIndex values.
const OSRS_TEXTURE_NAMES: readonly string[] = [
    'WOODEN_DOOR_HANDLE',
    'WATER_FLAT',
    'BRICK',
    'WOOD_PLANKS_1',
    'LARGE_DOOR',
    'DARK_WOOD',
    'ROOF_SHINGLES_1',
    'WOODEN_SCREEN',
    'LEAVES_SIDE',
    'TREE_RINGS',
    'MOSS_BRANCH',
    'CONCRETE',
    'IRON_BARS',
    'PAINTING_LANDSCAPE',
    'PAINTING_KING',
    'MARBLE_DARK',
    'SIMPLE_GRAIN_WOOD',
    'WATER_DROPLETS',
    'HAY',
    'NET',
    'BOOKCASE',
    'ROOF_WOODEN_SLATE',
    'CRATE',
    'BRICK_BROWN',
    'WATER_FLAT_2',
    'SWAMP_WATER_FLAT',
    'WEB',
    'ROOF_SLATE',
    'MOSS',
    'TROPICAL_LEAF',
    'WILLOW_LEAVES',
    'LAVA',
    'TREE_DOOR_BROWN',
    'MAPLE_LEAVES',
    'MAGIC_STARS',
    'SAND_BRICK',
    'DOOR_TEXTURE',
    'BLADE',
    'SANDSTONE',
    'PAINTING_ELF',
    'FIRE_CAPE',
    'LEAVES_DISEASED',
    'MARBLE',
    'CLEAN_TILE',
    'ROOF_SHINGLES_2',
    'ROOF_BRICK_TILE',
    'STONE_PATTERN',
    'TEXTURE_47',
    'HIEROGLYPHICS',
    'TEXTURE_49'
];

// Normal map file for each vanilla texture ID (null = slot stays flat).
// Files are served from /hd/textures/ and loaded asynchronously into the normal atlas.
const NORMAL_MAP_FOR_TEXTURE: readonly (string | null)[] = [
    null,                           // 0  door
    null,                           // 1  water
    'hd_brick_n.png',               // 2  wall
    'hd_wood_planks_1_n.png',       // 3  planks
    'wood_grain_2_n.png',           // 4  elfdoor
    'wood_grain_3_n.png',           // 5  darkwood
    'hd_roof_shingles_n.png',       // 6  roof
    null,                           // 7  damage
    null,                           // 8  leafytree
    null,                           // 9  treestump
    null,                           // 10 leafybase
    'hd_concrete_n.png',            // 11 mossy
    'metallic_1_n.png',             // 12 railings
    null,                           // 13 painting1
    null,                           // 14 painting2
    'marble_4_n.png',               // 15 marble
    'hd_simple_grain_wood_n.png',   // 16 wood2
    null,                           // 17 fountain
    null,                           // 18 thatched
    null,                           // 19 cargonet
    null,                           // 20 books
    'hd_roof_brick_tile_n.png',     // 21 elfroof2
    'wood_grain_2_n.png',           // 22 elfwood
    'hd_brick_brown_n.png',         // 23 mossybricks
    null,                           // 24 water_animated
    null,                           // 25 gungywater
    null,                           // 26 web
    'hd_roof_shingles_n.png',       // 27 elfroof
    null,                           // 28 mossydamage
    null,                           // 29 bamboo
    null,                           // 30 willowtex3
    null,                           // 31 lava
    'bark_n.png',                   // 32 bark
    null,                           // 33 mapletree
    null,                           // 34 yewtree
    'hd_sand_brick_n.png',          // 35 elfbrick
    'wood_grain_2_n.png',           // 36 elfwall
    'metallic_1_n.png',             // 37 chainmail
    null,                           // 38 mummy
    null,                           // 39 elfpainting
    null,                           // 40 jungleleaf4
    null,                           // 41 plant
    null,                           // 42 jungleleaf2
    null,                           // 43 plant2
    'hd_roof_shingles_n.png',       // 44 roof2
    'wood_grain_2_n.png',           // 45 door2
    'gravel_n.png',                 // 46 pebblefloor
    'rock_1_n.png',                 // 47 rockwall
    'hd_stone_pattern_n.png',       // 48 glyphs
    null                            // 49 canvas
];

// Normal map file for each HDMaterial enum value (indexed by HDMaterial ordinal).
// Loaded into atlas slots NORMAL_ATLAS_MATERIAL_SLOT_OFFSET + material_id (50–63).
// Used for untextured terrain surfaces that have no vanilla texture.
const NORMAL_MAP_FOR_MATERIAL: readonly (string | null)[] = [
    'rock_2_n.png',         // 0  Default
    null,                   // 1  Water  (procedural normals)
    null,                   // 2  Lava   (procedural)
    null,                   // 3  Model
    'rock_1_n.png',         // 4  Stone
    'wood_grain_2_n.png',   // 5  Wood
    'marble_4_n.png',       // 6  Marble
    'grunge_1_n.png',       // 7  Moss
    'gravel_n.png',         // 8  Pebble
    null,                   // 9  Foliage
    'metallic_1_n.png',     // 10 Metal
    'hd_roof_shingles_n.png', // 11 Roof
    null,                   // 12 Unlit
    'dirt_1_n.png'          // 13 Earth
];
const NORMAL_ATLAS_MATERIAL_SLOT_OFFSET = 50;

// Runtime texture debugger. Change this in the browser console and re-toggle/move camera:
//   window.HD_TEXTURE_DEBUG_MODE = 'normal'
//   window.HD_TEXTURE_DEBUG_MODE = 'flat'
//   window.HD_TEXTURE_DEBUG_MODE = 'id-colours'
//   window.HD_TEXTURE_DEBUG_MODE = 'single-texture'
//   window.HD_TEXTURE_DEBUG_MODE = 'uv'
//   window.HD_TEXTURE_DEBUG_MODE = 'texture-only'
//   window.HD_TEXTURE_DEBUG_MODE = 'water-source'
// These modes let us tell missing textures apart from wrong texture IDs, bad UVs, and atlas bleed.

const terrainShader: ShaderSource = {
    vertex: `#version 300 es
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
    float viewX = relative.z * u_sinEyeYaw + relative.x * u_cosEyeYaw;
    float viewY = relative.y * u_cosEyePitch - zPrime * u_sinEyePitch;
    float viewZ = relative.y * u_sinEyePitch + zPrime * u_cosEyePitch;
    // Use proper perspective clip coordinates instead of manually dividing x/y by
    // viewZ with w=1. The old path could make near-plane terrain/model triangles
    // fold or vanish at specific camera rotations, especially bridge/walkable
    // surfaces close to the camera. With w=viewZ, WebGL clips the triangle against
    // the near plane consistently while keeping the same screen projection.
    float safeRange = max(u_farPlane - u_nearPlane, 1.0);
    float ndcDepth = ((viewZ - u_nearPlane) / safeRange) * 2.0 - 1.0;

    gl_Position = vec4(
        viewX * u_projectionScale.x,
        -viewY * u_projectionScale.y,
        ndcDepth * viewZ,
        viewZ
    );

    v_worldPos = a_position;
    v_normal = normalize(a_normal);
    v_colour = a_colour;
    v_material = a_material;
    v_distance = max(0.0, viewZ);
    v_uv = a_uv;
    v_texture = int(floor(a_texture + 0.5));
    v_alpha = a_alpha;
    v_waterSource = int(floor(a_waterSource + 0.5));
    v_lightSpacePos = u_lightSpaceMatrix * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
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

out vec4 outColour;

float computeShadow(vec3 normal, vec3 sunDir) {
    vec3 proj = v_lightSpacePos.xyz / v_lightSpacePos.w;
    proj = proj * 0.5 + 0.5;
    if (proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0 || proj.z < 0.0 || proj.z > 1.0) {
        return 0.0;
    }
    float bias = max(0.008 * (1.0 - dot(normal, sunDir)), 0.0005);
    vec2 texelSize = 1.0 / vec2(2048.0);
    float shadow = 0.0;
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            float depth = texture(u_shadowMap, proj.xy + vec2(float(x), float(y)) * texelSize).r;
            shadow += proj.z - bias > depth ? 1.0 : 0.0;
        }
    }
    return shadow / 9.0;
}

vec3 debugTextureColour(int id) {
    if (id < 0) {
        return vec3(0.12, 0.12, 0.12);
    }
    if (id >= u_cacheTextureCount) {
        return vec3(1.0, 0.0, 1.0);
    }
    float f = float(id + 1);
    return fract(vec3(f * 0.1031, f * 0.3677, f * 0.6893));
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 untexturedTerrainDetail(vec3 colour, float material) {
    vec2 p = v_worldPos.xz / 128.0;
    float broad = noise2(p * 2.1);
    float fine = noise2(p * 11.0);
    float grit = hash21(floor(p * 42.0));

    if (material == 9.0 || material == 7.0) {
        vec3 darkGrass = vec3(0.18, 0.31, 0.12);
        vec3 lightGrass = vec3(0.46, 0.58, 0.23);
        vec3 grass = mix(darkGrass, lightGrass, broad * 0.72 + fine * 0.28);
        return mix(colour, grass, material == 7.0 ? 0.38 : 0.52) * (0.88 + fine * 0.22);
    }

    if (material == 13.0) {
        vec3 dirtDark = vec3(0.24, 0.20, 0.15);
        vec3 dirtLight = vec3(0.48, 0.41, 0.30);
        vec3 dirt = mix(dirtDark, dirtLight, broad);
        dirt += (grit > 0.82 ? vec3(0.10) : vec3(0.0));
        return mix(colour, dirt, 0.46) * (0.86 + fine * 0.24);
    }

    if (material == 4.0 || material == 8.0 || material == 0.0) {
        float cracks = smoothstep(0.83, 0.98, noise2(p * 7.5));
        vec3 stone = mix(vec3(0.25, 0.25, 0.23), vec3(0.55, 0.53, 0.47), broad);
        stone = mix(stone, vec3(0.08), cracks * 0.32);
        return mix(colour, stone, material == 0.0 ? 0.24 : 0.42) * (0.9 + fine * 0.18);
    }

    return colour;
}

void main() {
    vec3 normal = normalize(v_normal);
    vec3 viewDir = normalize(u_cameraPosition - v_worldPos);
    vec3 sunDir = normalize(-u_sunDirection);
    float diffuse = max(dot(normal, sunDir), 0.0);
    float shadow = (u_textureDebugMode != 0) ? 0.0 : computeShadow(normal, sunDir);
    float shadowFactor = shadow * u_shadowStrength;
    float light = u_ambient * (1.0 - shadowFactor * 0.55) + diffuse * u_diffuseStrength * (1.0 - shadowFactor);
    float material = floor(v_material + 0.5);

    vec3 baseColour = v_colour;

    bool hasTextureId = v_texture >= 0;
    bool validCacheTexture = hasTextureId && v_texture < u_cacheTextureCount;

    if (u_textureDebugMode == 9) {
        // Shader/uniform proof mode. If F8 works, the whole HD scene turns bright pink.
        outColour = vec4(1.0, 0.0, 1.0, 1.0);
        return;
    }

    if (u_textureDebugMode == 6) {
        // Water-source mode: plain textured terrain water = blue, shaped textured
        // terrain water = yellow, model water = magenta. Colour-inferred terrain
        // water uses cyan/orange so false positives are obvious in screenshots.
        if (material == 1.0) {
            if (v_waterSource == 1) {
                baseColour = vec3(0.05, 0.45, 1.0);
            } else if (v_waterSource == 2) {
                baseColour = vec3(1.0, 0.86, 0.05);
            } else if (v_waterSource == 3) {
                baseColour = vec3(1.0, 0.05, 0.85);
            } else if (v_waterSource == 4) {
                baseColour = vec3(0.0, 0.95, 1.0);
            } else if (v_waterSource == 5) {
                baseColour = vec3(1.0, 0.45, 0.0);
            } else {
                baseColour = vec3(0.0, 1.0, 0.7);
            }
            outColour = vec4(baseColour, 1.0);
            return;
        }

        outColour = vec4(vec3(0.08), 1.0);
        return;
    }

    if (u_textureDebugMode == 2 && hasTextureId) {
        // ID-colour mode: every texture ID gets a unique flat colour.
        // Magenta means the client tried to use a texture outside the 254 cache range.
        baseColour = debugTextureColour(v_texture);
        light = 1.0;
    } else if (u_textureDebugMode == 4 && hasTextureId) {
        // UV mode: shows whether the generated UVs are stable and non-warped.
        baseColour = vec3(fract(v_uv.x), fract(v_uv.y), 0.5);
        light = 1.0;
    } else if (u_textureDebugMode != 1 && validCacheTexture) {
        int atlasTexture = u_textureDebugMode == 3 ? 0 : v_texture;
        vec4 rect = u_atlasRects[atlasTexture];
        vec2 uv = fract(v_uv);
        if (material == 1.0) {
            // Smooth noise distortion in world space — no sin/cos banding on the texture
            vec2 wuvTex = v_worldPos.xz / 640.0;
            float du = noise2(wuvTex * 3.5 + vec2(u_time * 0.05, 0.0)) - 0.5;
            float dv = noise2(wuvTex * 3.5 + vec2(0.0, u_time * 0.04)) - 0.5;
            uv += vec2(du * 0.018, dv * 0.015);
        }
        vec2 atlasUv = mix(rect.xy, rect.zw, fract(uv));
        vec4 texel = texture(u_textureAtlas, atlasUv);
        if (texel.a >= 0.05) {
            baseColour = mix(baseColour, texel.rgb, 0.9);
            if (u_textureDebugMode == 5) {
                outColour = vec4(texel.rgb, 1.0);
                return;
            }
        } else {
            discard;
        }
    }

    if (!validCacheTexture && u_textureDebugMode == 0) {
        baseColour = untexturedTerrainDetail(baseColour, material);
    }

    // Texture-space normal mapping.
    // Textured surfaces (validCacheTexture) use the per-texture atlas slot with the same
    // UV as the colour sample.  Untextured terrain uses a per-material slot (50+material)
    // sampled with world-space planar UVs so the detail tiles independently of tile size.
    if (u_textureDebugMode == 0 && material != 1.0 && material != 2.0 && material != 12.0) {
        int normalSlot;
        vec2 normalUv;
        if (validCacheTexture) {
            normalSlot = v_texture;
            normalUv = v_uv;
        } else {
            normalSlot = 50 + int(material);
            normalUv = v_worldPos.xz / 512.0;
        }
        vec4 normalRect = u_atlasRects[normalSlot];
        vec2 normalAtlasUv = mix(normalRect.xy, normalRect.zw, fract(normalUv));
        vec4 ns = texture(u_normalAtlas, normalAtlasUv);
        vec3 q1 = dFdx(v_worldPos);
        vec3 q2 = dFdy(v_worldPos);
        vec2 st1 = dFdx(normalUv);
        vec2 st2 = dFdy(normalUv);
        float nmDet = st1.x * st2.y - st2.x * st1.y;
        if (abs(nmDet) > 1e-5) {
            vec3 N = normalize(normal);
            vec3 T = normalize((q1 * st2.y - q2 * st1.y) / nmDet);
            T = normalize(T - dot(T, N) * N);
            vec3 B = cross(N, T);
            normal = normalize(mat3(T, B, N) * normalize(ns.rgb * 2.0 - 1.0));
            diffuse = max(dot(normal, sunDir), 0.0);
            light = u_ambient * (1.0 - shadowFactor * 0.55) + diffuse * u_diffuseStrength * (1.0 - shadowFactor);
        }
    }

    float alpha = v_alpha;

    if (material == 12.0) {
        light = 1.0;
    } else if (material == 1.0) {
        // Water: approximate 117HD's default WATER type in this single-pass terrain shader.
        // Alpha stays 1.0 because the 2D composite step cannot safely blend terrain.
        float t = u_time;

        vec2 wuv = v_worldPos.xz / 640.0;
        const float E = 0.04;

        // Two counter-moving layers mirror 117HD's paired normal-map scrolls.
        vec2 flow = vec2(
            noise2(wuv * 15.0 + vec2(t * 0.050, -t * 0.050)),
            noise2(wuv.yx * 15.0 + vec2(-t * 0.050, t * 0.050))
        ) - 0.5;
        vec2 uv1 = wuv.yx * 3.0 - vec2(t / 28.0) + flow * 0.025;
        vec2 uv2 = wuv * 3.0 + vec2(t / 24.0) + flow * 0.025;

        float n1c  = noise2(uv1);
        float n1dx = noise2(uv1 + vec2(E, 0.0)) - noise2(uv1 - vec2(E, 0.0));
        float n1dz = noise2(uv1 + vec2(0.0, E)) - noise2(uv1 - vec2(0.0, E));
        float n2dx = noise2(uv2 + vec2(E, 0.0)) - noise2(uv2 - vec2(E, 0.0));
        float n2dz = noise2(uv2 + vec2(0.0, E)) - noise2(uv2 - vec2(0.0, E));

        vec3 waterNormal = normalize(normal + vec3(
            (n1dx + n2dx) * 0.09,
            0.0,
            (n1dz + n2dz) * 0.09
        ));

        float vDotN = clamp(dot(viewDir, waterNormal), 0.0, 1.0);
        float fresnel = clamp(1.0 - vDotN, 0.0, 1.0);
        float finalFresnel = clamp(mix(0.4, 1.0, fresnel * 1.2), 0.0, 1.0);

        // 117HD-style water: dark surface base with Fresnel sky lift and tight specular.
        vec3 waterColorLight = vec3(0.38, 0.56, 0.72);
        vec3 waterColorMid   = vec3(0.13, 0.26, 0.34);
        vec3 waterColorDark  = vec3(0.018, 0.045, 0.060);
        vec3 surfaceColor = finalFresnel < 0.5
            ? mix(waterColorDark, waterColorMid, finalFresnel * 2.0)
            : mix(waterColorMid, waterColorLight, (finalFresnel - 0.5) * 2.0);

        vec3 waterSurface = vec3(0.18, 0.31, 0.40);
        vec3 baseWater = waterSurface * (u_ambient * 0.95 + diffuse * u_diffuseStrength * 0.38);
        surfaceColor = mix(baseWater, surfaceColor, 0.78);

        // Very subtle procedural foam; 117HD's real foam is shoreline-texture based.
        float foam = pow(max(n1c - 0.74, 0.0) / 0.26, 3.0);
        surfaceColor = mix(surfaceColor, vec3(0.68, 0.78, 0.84), foam * 0.08);

        diffuse = max(dot(waterNormal, sunDir), 0.0);

        // 117HD default WATER uses specularStrength .5 and a tight gloss of 500.
        vec3 halfVec = normalize(viewDir + sunDir);
        float spec = pow(max(dot(waterNormal, halfVec), 0.0), 500.0);
        surfaceColor += vec3(0.88, 0.95, 1.00) * spec * 0.50;

        light = 1.0;
        baseColour = surfaceColor;
        alpha = v_alpha;
        normal = waterNormal;

    } else if (material == 2.0) {
        // Lava: RLHD-inspired dual-layer flow and crack animation
        float t = u_time;
        float flow  = sin(t * 2.8 + v_uv.x * 11.0 + v_uv.y * 8.5) * 0.5 + 0.5;
        float crack = cos(t * 1.5 + v_uv.y * 14.0 - v_uv.x * 10.0) * 0.5 + 0.5;
        float lavaPattern = mix(flow, crack, 0.45);

        vec3 lavaDark = vec3(0.52, 0.03, 0.00);
        vec3 lavaMid  = vec3(0.88, 0.17, 0.01);
        vec3 lavaGlow = vec3(1.00, 0.54, 0.05);
        vec3 lavaColor = lavaPattern < 0.5
            ? mix(lavaDark, lavaMid, lavaPattern * 2.0)
            : mix(lavaMid, lavaGlow, (lavaPattern - 0.5) * 2.0);

        baseColour = mix(baseColour, lavaColor, 0.72);
        light = max(light, 1.05 + lavaPattern * 0.22);

    } else if (material == 4.0 || material == 8.0) {
        // Stone / Pebble
        baseColour = mix(vec3(dot(baseColour, vec3(0.299, 0.587, 0.114))), baseColour, 0.72);
        light *= 0.94;
    } else if (material == 5.0 || material == 11.0) {
        // Wood / Roof
        baseColour *= vec3(1.08, 0.98, 0.82);
        light *= material == 11.0 ? 0.9 : 0.98;
    } else if (material == 6.0) {
        // Marble: subtle Blinn-Phong specular for polished appearance
        baseColour = mix(baseColour, vec3(0.78, 0.78, 0.72), 0.24);
        vec3 halfVec = normalize(viewDir + sunDir);
        float spec = pow(max(dot(normal, halfVec), 0.0), 48.0);
        baseColour += vec3(0.90, 0.88, 0.82) * spec * 0.26;
        light *= 1.04;
    } else if (material == 7.0 || material == 9.0) {
        // Moss / Foliage
        baseColour *= vec3(0.82, 1.08, 0.72);
        light *= 0.96;
    } else if (material == 10.0) {
        // Metal: Blinn-Phong specular using actual view direction (RLHD uses specularStrength/Gloss per material)
        baseColour = mix(baseColour, vec3(0.62, 0.62, 0.58), 0.25);
        vec3 halfVec = normalize(viewDir + sunDir);
        float spec = pow(max(dot(normal, halfVec), 0.0), 32.0);
        baseColour += vec3(0.75, 0.72, 0.68) * spec * 0.42;
    }

    // Sky ambient: RLHD-inspired sky light contribution on upward-facing surfaces.
    // In RS coordinate space, "up" = negative Y direction, so normal.y < 0 = facing sky.
    float skyFacing = max(-normal.y, 0.0);
    vec3 colour = baseColour * light + baseColour * u_skyColour * 0.07 * skyFacing;

    float fogLinear = clamp((v_distance - u_fogStart) / max(u_fogDistance - u_fogStart, 1.0), 0.0, 1.0);
    float fog = smoothstep(0.0, 1.0, fogLinear);
    colour = mix(colour, u_skyColour, fog * 0.95);

    outColour = vec4(colour, alpha);
}
`
};

const uiShader: ShaderSource = {
    vertex: `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_uv;

uniform vec2 u_canvasSize;

out vec2 v_uv;

void main() {
    vec2 clip = vec2(
        (a_position.x / u_canvasSize.x) * 2.0 - 1.0,
        1.0 - (a_position.y / u_canvasSize.y) * 2.0
    );
    gl_Position = vec4(clip, 0.0, 1.0);
    v_uv = a_uv;
}
`,
    fragment: `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_uiTexture;
uniform float u_keyed;
out vec4 outColour;

void main() {
    vec4 texel = texture(u_uiTexture, v_uv);

    // PixMap.drawKeyed uses 0xff00ff as the HD viewport hole.
    // Discard both true alpha and magenta-keyed pixels so the HD world stays visible.
    if (texel.a < 0.05) {
        discard;
    }
    if (u_keyed > 0.5 && texel.r > 0.95 && texel.g < 0.08 && texel.b > 0.95) {
        discard;
    }

    outColour = texel;
}
`
};

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

type HDTextureDiagnostic = {
    id: number;
    name: string;
    serverName: string;
    osrsName: string;
    count: number;
    loaded: boolean;
    hasPalette: boolean;
    width: number;
    height: number;
    material: string;
    transparent: boolean;
};

type HDTextureIdMapEntry = {
    id: number;
    serverName: string;
    osrsName: string;
    material: string;
    transparent: boolean;
};

type HDTextureDiagnostics = {
    mode: string;
    atlasReady: boolean;
    atlasLoadedCount: number;
    untexturedTriangleCount: number;
    invalidTextureCount: number;
    textureIdMap: HDTextureIdMapEntry[];
    topTextures: HDTextureDiagnostic[];
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

export default class HDRenderer {
    private static enabled: boolean = false;
    private static canvas: HTMLCanvasElement | null = null;
    private static gl: WebGL2RenderingContext | null = null;
    private static terrainProgram: WebGLProgram | null = null;
    private static terrainBuffer: WebGLBuffer | null = null;
    private static terrainVao: WebGLVertexArrayObject | null = null;
    private static modelBuffers: Map<number, WebGLBuffer> = new Map();
    private static modelVaos: Map<number, WebGLVertexArrayObject> = new Map();
    private static reason: string = 'not initialized';
    private static groundTiles: HDGroundTileInput[] = [];
    private static groundTileMap: Map<string, HDGroundTileInput> = new Map();
    private static visibleGroundKeys: Set<string> = new Set();
    private static sceneDirty: boolean = false;
    private static terrainVertexCount: number = 0;
    private static modelBatches: Map<number, number[]> = new Map();
    private static transparentBatches: TransparentBatch[] = [];
    // Static far-scene cache: expensive 25-tile scenery is built only when the
    // loaded HD tile range changes, then drawn from cached GPU buffers every frame.
    private static staticFarModelBatches: Map<number, number[]> = new Map();
    private static staticFarTransparentBatches: TransparentBatch[] = [];
    private static staticFarModelBuffers: Map<number, WebGLBuffer> = new Map();
    private static staticFarModelVaos: Map<number, WebGLVertexArrayObject> = new Map();
    private static staticFarGpuDirty: boolean = true;
    private static staticFarSceneKey: string = '';
    private static staticFarSceneBuilding: boolean = false;
    private static modelDrawCount: number = 0;
    private static modelVertexCount: number = 0;
    private static modelBatchCount: number = 0;
    private static clippedTriangleCount: number = 0;
    private static skippedBackfaceCount: number = 0;
    private static materialCounts: number[] = [];
    private static textureUseCounts: number[] = [];
    private static untexturedTriangleCount: number = 0;
    private static invalidTextureCount: number = 0;
    private static camera: HDCameraInput | null = null;
    private static frameStarted: boolean = false;
    private static textureAtlas: WebGLTexture | null = null;
    private static textureRects: TextureAtlasRect[] = [];
    private static textureAtlasReady: boolean = false;
    private static textureAtlasLoadedCount: number = 0;
    private static uniformCache: Map<string, WebGLUniformLocation | null> = new Map();
    private static atlasRectLocations: (WebGLUniformLocation | null)[] = [];
    private static uiProgram: WebGLProgram | null = null;
    private static uiBuffer: WebGLBuffer | null = null;
    private static uiVao: WebGLVertexArrayObject | null = null;
    private static uiTexture: WebGLTexture | null = null;
    private static uiUniformCanvasSize: WebGLUniformLocation | null = null;
    private static uiUniformTexture: WebGLUniformLocation | null = null;
    private static uiUniformKeyed: WebGLUniformLocation | null = null;
    private static debugHotkeysInstalled: boolean = false;
    private static debugOverlay: HTMLDivElement | null = null;
    private static diagnosticsOverlay: HTMLPreElement | null = null;
    private static smoothNormalCache: Map<number, readonly [number, number, number]> = new Map();
    private static normalAtlas: WebGLTexture | null = null;
    private static normalAtlasPendingImages: { slot: number; data: Uint8ClampedArray }[] = [];
    private static shadowProgram: WebGLProgram | null = null;
    private static shadowFbo: WebGLFramebuffer | null = null;
    private static shadowDepthTexture: WebGLTexture | null = null;
    private static shadowUniformMatrix: WebGLUniformLocation | null = null;
    private static lightSpaceMatrix: Float32Array = new Float32Array(16);
    private static modelUsedKeys: Set<number> = new Set();
    private static queuedModelKeys: Set<string> = new Set();
    private static staticFarTransparentBuffers: Map<number, WebGLBuffer> = new Map();
    private static staticFarTransparentVaos: Map<number, WebGLVertexArrayObject> = new Map();
    private static farModelDrawCount: number = 0;
    private static modelObjectIds: WeakMap<object, number> = new WeakMap();
    private static nextModelObjectId: number = 1;
    private static lastCameraRange: { minX: number; minZ: number; maxX: number; maxZ: number; maxLevel: number } | null = null;
    private static groundObjectCache: Map<string, Ground> = new Map();
    private static safeWarmupFrames: number = 0;
    private static frameNumber: number = 0;
    private static lastColourTableSignature: number = 0;


    // ── Pre-allocated scratch buffers (zero GC allocations per model/face) ──────
    // World-space vertex coordinates – sized for the largest plausible RS2 model.
    private static _wx: Int32Array = new Int32Array(65536);
    private static _wy: Int32Array = new Int32Array(65536);
    private static _wz: Int32Array = new Int32Array(65536);
    // Per-face positions (reused across faces)
    private static _pa: [number, number, number] = [0, 0, 0];
    private static _pb: [number, number, number] = [0, 0, 0];
    private static _pc: [number, number, number] = [0, 0, 0];
    // Per-face colours (reused across faces)
    private static _ca: [number, number, number] = [0, 0, 0];
    private static _cb: [number, number, number] = [0, 0, 0];
    private static _cc: [number, number, number] = [0, 0, 0];
    private static _avgC: [number, number, number] = [0, 0, 0];
    // Per-face UV coordinates (reused across faces)
    private static _uvA: [number, number] = [0, 0];
    private static _uvB: [number, number] = [0, 1];
    private static _uvC: [number, number] = [1, 0];
    // Input face vertices for clipping (3 slots)
    private static _fv0: HDClipVertex = { position: [0, 0, 0] as [number,number,number], colour: [0, 0, 0] as [number,number,number], uv: [0, 0] as [number,number], depth: 0 };
    private static _fv1: HDClipVertex = { position: [0, 0, 0] as [number,number,number], colour: [0, 0, 0] as [number,number,number], uv: [0, 0] as [number,number], depth: 0 };
    private static _fv2: HDClipVertex = { position: [0, 0, 0] as [number,number,number], colour: [0, 0, 0] as [number,number,number], uv: [0, 0] as [number,number], depth: 0 };
    private static _fvIn: HDClipVertex[] = [HDRenderer._fv0, HDRenderer._fv1, HDRenderer._fv2];
    // Clipped output vertices (max 4 for a triangle clipped against 1 plane)
    private static _fvOut: HDClipVertex[] = [
        { position: [0, 0, 0] as [number,number,number], colour: [0, 0, 0] as [number,number,number], uv: [0, 0] as [number,number], depth: 0 },
        { position: [0, 0, 0] as [number,number,number], colour: [0, 0, 0] as [number,number,number], uv: [0, 0] as [number,number], depth: 0 },
        { position: [0, 0, 0] as [number,number,number], colour: [0, 0, 0] as [number,number,number], uv: [0, 0] as [number,number], depth: 0 },
        { position: [0, 0, 0] as [number,number,number], colour: [0, 0, 0] as [number,number,number], uv: [0, 0] as [number,number], depth: 0 },
    ];
    private static _fvOutLen: number = 0;
    // Shared GPU upload buffer – grows by doubling if needed.
    private static _uploadBuf: Float32Array = new Float32Array(4 * 1024 * 1024);
    // Per-face scratch: triangle normal and texture-basis world-space vectors.
    private static _norm: [number, number, number] = [0, 0, 0];
    private static _tOrigin: [number, number, number] = [0, 0, 0];
    private static _tU: [number, number, number] = [0, 0, 0];
    private static _tV: [number, number, number] = [0, 0, 0];


    static setEnabled(enabled: boolean): HDRendererStatus {
        this.enabled = enabled;

        if (!enabled) {
            if (this.canvas) {
                this.canvas.style.display = 'none';
            }
            this.setSoftwareCanvasHidden(false);
            this.frameStarted = false;
            return this.status();
        }

        this.textureAtlasReady = false;
        this.sceneDirty = true;
        this.frameStarted = false;
        this.installTextureDebugHotkeys();
        (globalThis as any)._hdPhase = 'setEnabled-init';
        this.init();
        return this.status(false);
    }

    static status(syncTerrain: boolean = true): HDRendererStatus {
        if (syncTerrain && this.enabled) {
            this.syncTerrain();
        }

        return {
            enabled: this.enabled,
            available: this.gl !== null && this.terrainProgram !== null,
            reason: this.reason,
            groundTileCount: this.groundTiles.length,
            terrainVertexCount: this.terrainVertexCount,
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
            invalidTextureCount: this.invalidTextureCount
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

    // Call this before mapBuild on first login so the atlas upload happens while
    // the loading screen is still showing, not on the first visible HD frame.
    static prewarmAtlas(): void {
        if (!this.enabled) {
            return;
        }
        this.init();
        this.ensureTextureAtlas();
    }

    static beginStaticFarScene(key: string): boolean {
        if ((globalThis as any).DISABLE_HD_FAR_MODELS === true) {
            return false;
        }

        // Reuse the static far-scene buffers while standing on the same loaded HD
        // tile range. This keeps the 25-tile visual radius without rebuilding every
        // fence/tree/bush model every camera rotation frame.
        if (this.staticFarSceneKey === key && !this.staticFarGpuDirty) {
            return false;
        }

        this.staticFarSceneKey = key;
        this.staticFarModelBatches.clear();
        this.staticFarTransparentBatches.length = 0;
        this.staticFarSceneBuilding = true;
        this.staticFarGpuDirty = true;
        return true;
    }

    static endStaticFarScene(): void {
        this.staticFarSceneBuilding = false;
    }

    private static clearStaticFarScene(): void {
        this.staticFarSceneKey = '';
        this.staticFarModelBatches.clear();
        this.staticFarTransparentBatches.length = 0;
        this.staticFarGpuDirty = true;
        this.staticFarSceneBuilding = false;

        if (this.gl) {
            for (const vao of this.staticFarModelVaos.values()) {
                if (vao) {
                    this.gl.deleteVertexArray(vao);
                }
            }
            for (const buffer of this.staticFarModelBuffers.values()) {
                if (buffer) {
                    this.gl.deleteBuffer(buffer);
                }
            }
            for (const vao of this.staticFarTransparentVaos.values()) {
                if (vao) {
                    this.gl.deleteVertexArray(vao);
                }
            }
            for (const buffer of this.staticFarTransparentBuffers.values()) {
                if (buffer) {
                    this.gl.deleteBuffer(buffer);
                }
            }
        }
        this.staticFarModelVaos.clear();
        this.staticFarModelBuffers.clear();
        this.staticFarTransparentVaos.clear();
        this.staticFarTransparentBuffers.clear();
    }


    static resetScene(): void {
        this.groundTiles.length = 0;
        this.groundTileMap.clear();
        this.visibleGroundKeys.clear();
        this.groundObjectCache.clear();
        this.clearStaticFarScene();
        this.sceneDirty = true;
        this.terrainVertexCount = 0;
        this.lastCameraRange = null;
    }

    static addGroundTile(tile: HDGroundTileInput): void {
        const key = this.groundKey(tile.level, tile.x, tile.z);
        this.groundTiles.push(tile);
        this.groundTileMap.set(key, tile);
        this.sceneDirty = true;
    }

    static prepareTerrain(): void {
        if (this.sceneDirty) {
            this.buildSmoothNormals();
        }
    }

    private static makeGround(tile: HDGroundTileInput): Ground {
        return new Ground(
            tile.x, tile.z,
            tile.shape, tile.rotation,
            tile.texture,
            tile.heights[0], tile.heights[1], tile.heights[2], tile.heights[3],
            tile.colours[0], tile.colours[1], tile.colours[2], tile.colours[3],
            tile.secondaryColours[0], tile.secondaryColours[1], tile.secondaryColours[2], tile.secondaryColours[3],
            tile.overlay, tile.underlay
        );
    }

    private static getGround(tile: HDGroundTileInput): Ground {
        const key = this.groundKey(tile.level, tile.x, tile.z);
        let ground = this.groundObjectCache.get(key);
        if (!ground) {
            ground = this.makeGround(tile);
            this.groundObjectCache.set(key, ground);
        }
        return ground;
    }

    static queueGroundTile(level: number, x: number, z: number): void {
        if (!this.enabled || !this.frameStarted) {
            return;
        }

        this.visibleGroundKeys.add(this.groundKey(level, x, z));
    }

    static beginFrame(camera: HDCameraInput): void {
        if (!this.enabled) {
            return;
        }

        this.init();
        this.ensureTextureAtlas();
        this.camera = camera;
        this.visibleGroundKeys.clear();
        this.modelBatches.clear();
        this.transparentBatches.length = 0;
        this.modelDrawCount = 0;
        this.farModelDrawCount = 0;
        this.modelVertexCount = 0;
        this.modelBatchCount = 0;
        this.clippedTriangleCount = 0;
        this.skippedBackfaceCount = 0;
        this.materialCounts = new Array(14).fill(0);
        this.textureUseCounts = new Array(CACHE_TEXTURE_COUNT).fill(0);
        this.untexturedTriangleCount = 0;
        this.invalidTextureCount = 0;
        this.queuedModelKeys.clear();
        this.frameStarted = true;
        this.frameNumber++;
    }

    static queueModel(model: HDModelInput, yaw: number, relativeX: number, relativeY: number, relativeZ: number): void {
        if (!this.enabled || !this.frameStarted || !this.camera) {
            return;
        }

        // Keep HD models enabled, but heavily budgeted. Full unbounded model batching
        // was the crash point after warmup. This draws nearby objects/players again
        // without allowing one bad model or a huge batch to kill the renderer.
        // DevTools emergency switch: window.DISABLE_HD_MODELS = true
        if ((globalThis as any).DISABLE_HD_MODELS === true) {
            return;
        }

        const warmingUp = this.safeWarmupFrames > 0;
        const isFarSceneModel = (globalThis as any)._HD_FAR_SCENE_QUEUING === true;
        const cacheStaticFarScene = this.staticFarSceneBuilding && isFarSceneModel;
        const targetModelBatches = cacheStaticFarScene ? this.staticFarModelBatches : this.modelBatches;
        const targetTransparentBatches = cacheStaticFarScene ? this.staticFarTransparentBatches : this.transparentBatches;

        if (!model.vertexX || !model.vertexY || !model.vertexZ || !model.faceVertexA || !model.faceVertexB || !model.faceVertexC || !model.faceColourA) {
            return;
        }

        const maxModelDist = Number((globalThis as any).HD_MODEL_DISTANCE ?? 6400);
        const maxModelDistSq = maxModelDist * maxModelDist;
        if (relativeX * relativeX + relativeY * relativeY + relativeZ * relativeZ > maxModelDistSq) {
            return;
        }

        const modelBudget = Number((globalThis as any).HD_MODEL_BUDGET ?? (isFarSceneModel ? 9000 : (warmingUp ? 650 : 1600)));
        if (this.modelDrawCount >= modelBudget) {
            return;
        }

        // The far-scene pass now runs during login warmup so static locs do not pop
        // in 2 seconds late. Keep a separate cap for far models so static scenery
        // cannot consume the whole frame budget before actors/NPCs/player models queue.
        if (isFarSceneModel) {
            const farModelBudget = Number((globalThis as any).HD_FAR_MODEL_BUDGET ?? (warmingUp ? 2500 : 9000));
            if (this.farModelDrawCount >= farModelBudget) {
                return;
            }
        }

        const faceCount = Number(model.faceCount ?? 0);
        const maxFacesPerModel = Number((globalThis as any).HD_MODEL_MAX_FACES ?? 1200);
        if (faceCount <= 0 || faceCount > maxFacesPerModel) {
            return;
        }

        const vertexBudget = Number((globalThis as any).HD_MODEL_VERTEX_BUDGET ?? (isFarSceneModel ? 1800000 : (warmingUp ? 120000 : 320000)));
        if (this.modelVertexCount + faceCount * 3 > vertexBudget) {
            return;
        }

        const modelKey = `${this.modelObjectId(model)}:${yaw}:${relativeX}:${relativeY}:${relativeZ}`;
        if (this.queuedModelKeys.has(modelKey)) {
            return;
        }
        this.queuedModelKeys.add(modelKey);

        const sinYaw = yaw === 0 ? 0 : this.fixedSin(yaw);
        const cosYaw = yaw === 0 ? 0 : this.fixedCos(yaw);

        // Use pre-allocated world-space coordinate arrays (no per-model allocation).
        const wx = this._wx, wy = this._wy, wz = this._wz;
        const eyeX = this.camera.eyeX, eyeY = this.camera.eyeY, eyeZ = this.camera.eyeZ;

        for (let v = 0; v < model.vertexCount; v++) {
            let x = model.vertexX[v];
            const y = model.vertexY[v];
            let z = model.vertexZ[v];

            if (yaw !== 0) {
                const rotatedX = (z * sinYaw + x * cosYaw) >> 16;
                z = (z * cosYaw - x * sinYaw) >> 16;
                x = rotatedX;
            }

            wx[v] = eyeX + relativeX + x;
            wy[v] = eyeY + relativeY + y;
            wz[v] = eyeZ + relativeZ + z;
        }

        // Pre-allocated scratch buffers for per-face work (no per-face allocation).
        const pa = this._pa, pb = this._pb, pc = this._pc;
        const ca = this._ca, cb = this._cb, cc = this._cc, avgC = this._avgC;
        const norm = this._norm;
        const uvA = this._uvA, uvB = this._uvB, uvC = this._uvC;
        const fv0 = this._fv0, fv1 = this._fv1, fv2 = this._fv2;

        for (let f = 0; f < model.faceCount; f++) {
            if (model.faceRenderType && model.faceRenderType[f] === -1) {
                continue;
            }
            if (model.faceAlpha && model.faceAlpha[f] >= 254) {
                continue;
            }

            const priority = model.facePriority ? model.facePriority[f] : model.priority;

            const a = model.faceVertexA[f];
            const b = model.faceVertexB[f];
            const c = model.faceVertexC[f];

            // Populate pre-allocated position tuples in-place (no allocation).
            pa[0] = wx[a]; pa[1] = wy[a]; pa[2] = wz[a];
            pb[0] = wx[b]; pb[1] = wy[b]; pb[2] = wz[b];
            pc[0] = wx[c]; pc[1] = wy[c]; pc[2] = wz[c];

            let type = 0;
            if (model.faceRenderType) {
                type = model.faceRenderType[f] & 0x3;
            }

            const texturedFace = model.faceRenderType ? model.faceRenderType[f] >> 2 : -1;
            const hasTextureBasis = type >= 2 &&
                texturedFace >= 0 &&
                model.faceTextureP !== null &&
                model.faceTextureM !== null &&
                model.faceTextureN !== null &&
                texturedFace < model.faceTextureP.length &&
                texturedFace < model.faceTextureM.length &&
                texturedFace < model.faceTextureN.length;
            const textureCandidate = hasTextureBasis && model.faceColour ? model.faceColour[f] : -1;
            const texture = this.isValid254Texture(textureCandidate) ? textureCandidate : -1;
            this.countTexture(texture);

            // Populate pre-allocated colour tuples in-place (no allocation).
            this.colourIndexToRgbInto(model.faceColourA[f], ca);
            this.colourIndexToRgbInto(model.faceColourB ? model.faceColourB[f] : model.faceColourA[f], cb);
            this.colourIndexToRgbInto(model.faceColourC ? model.faceColourC[f] : model.faceColourA[f], cc);
            this.averageColourInto(ca, cb, cc, avgC);

            const textureMaterial = this.isValid254Texture(texture)
                ? this.materialForModelTexture(texture, avgC)
                : HDMaterial.Default;
            const modelTexture = texture >= 0 && (
                textureMaterial === HDMaterial.Water ||
                textureMaterial === HDMaterial.Lava ||
                !TERRAIN_ONLY_MODEL_TEXTURE_IDS.has(texture)
            );
            const material = type === 1
                ? HDMaterial.Unlit
                : modelTexture
                ? (textureMaterial !== HDMaterial.Default ? textureMaterial : this.materialForModelColour(avgC))
                : HDMaterial.Model;

            // Compute normal in-place (no allocation).
            this.triangleNormalInto(pa, pb, pc, norm);

            if (material === HDMaterial.Water && (this.faceHeightDelta(pa, pb, pc) > WATER_SURFACE_MAX_HEIGHT_DELTA || Math.abs(norm[1]) < 0.35)) {
                continue;
            }
            const alphaByte = model.faceAlpha ? model.faceAlpha[f] : 0;
            const alpha = this.alphaForFace(alphaByte);
            if (alpha < 1 && this.faceHeightDelta(pa, pb, pc) > TRANSPARENT_MODEL_MAX_HEIGHT_DELTA) {
                continue;
            }
            this.countMaterial(material);
            const batchKey = modelTexture ? texture : -1;
            const batch = alpha < 1 ? [] : (targetModelBatches.get(batchKey) ?? []);
            if (alpha >= 1) {
                targetModelBatches.set(batchKey, batch);
            }

            // Set UV coordinates in-place (no allocation).
            uvA[0] = 0; uvA[1] = 0;
            uvB[0] = 1; uvB[1] = 0;
            uvC[0] = 0; uvC[1] = 1;

            if (modelTexture && hasTextureBasis && model.faceTextureP && model.faceTextureM && model.faceTextureN) {
                const tA = model.faceTextureP[texturedFace];
                const tB = model.faceTextureM[texturedFace];
                const tC = model.faceTextureN[texturedFace];
                // Write basis vectors into pre-allocated scratch (no allocation).
                const to = this._tOrigin, tu = this._tU, tv = this._tV;
                to[0] = wx[tA]; to[1] = wy[tA]; to[2] = wz[tA];
                tu[0] = wx[tB]; tu[1] = wy[tB]; tu[2] = wz[tB];
                tv[0] = wx[tC]; tv[1] = wy[tC]; tv[2] = wz[tC];
                this.textureBasisUvsInto(pa, pb, pc, to, tu, tv, uvA, uvB, uvC);
            }

            // Populate pre-allocated clip vertex slots in-place (no allocation).
            fv0.position[0] = pa[0]; fv0.position[1] = pa[1]; fv0.position[2] = pa[2];
            fv0.colour[0] = ca[0]; fv0.colour[1] = ca[1]; fv0.colour[2] = ca[2];
            fv0.uv[0] = uvA[0]; fv0.uv[1] = uvA[1];
            fv0.depth = this.faceVertexDepth(pa);

            fv1.position[0] = pb[0]; fv1.position[1] = pb[1]; fv1.position[2] = pb[2];
            fv1.colour[0] = cb[0]; fv1.colour[1] = cb[1]; fv1.colour[2] = cb[2];
            fv1.uv[0] = uvB[0]; fv1.uv[1] = uvB[1];
            fv1.depth = this.faceVertexDepth(pb);

            fv2.position[0] = pc[0]; fv2.position[1] = pc[1]; fv2.position[2] = pc[2];
            fv2.colour[0] = cc[0]; fv2.colour[1] = cc[1]; fv2.colour[2] = cc[2];
            fv2.uv[0] = uvC[0]; fv2.uv[1] = uvC[1];
            fv2.depth = this.faceVertexDepth(pc);

            if (cacheStaticFarScene) {
                // Static far-scene buffers are reused while the camera rotates. They
                // must therefore be camera-independent. Do NOT near-plane clip or
                // backface-cull here using the current camera angle, otherwise the
                // cached buffer permanently loses faces that should become visible
                // from another rotation. WebGL's real perspective projection clips
                // these raw world-space triangles correctly at draw time.
                const o0 = this._fvOut[0];
                o0.position[0] = fv0.position[0]; o0.position[1] = fv0.position[1]; o0.position[2] = fv0.position[2];
                o0.colour[0] = fv0.colour[0]; o0.colour[1] = fv0.colour[1]; o0.colour[2] = fv0.colour[2];
                o0.uv[0] = fv0.uv[0]; o0.uv[1] = fv0.uv[1]; o0.depth = fv0.depth;
                const o1 = this._fvOut[1];
                o1.position[0] = fv1.position[0]; o1.position[1] = fv1.position[1]; o1.position[2] = fv1.position[2];
                o1.colour[0] = fv1.colour[0]; o1.colour[1] = fv1.colour[1]; o1.colour[2] = fv1.colour[2];
                o1.uv[0] = fv1.uv[0]; o1.uv[1] = fv1.uv[1]; o1.depth = fv1.depth;
                const o2 = this._fvOut[2];
                o2.position[0] = fv2.position[0]; o2.position[1] = fv2.position[1]; o2.position[2] = fv2.position[2];
                o2.colour[0] = fv2.colour[0]; o2.colour[1] = fv2.colour[1]; o2.colour[2] = fv2.colour[2];
                o2.uv[0] = fv2.uv[0]; o2.uv[1] = fv2.uv[1]; o2.depth = fv2.depth;
                this._fvOutLen = 3;
            } else {
                // Clip against near plane into _fvOut (no allocation).
                this.clipPolygonToNearInto(3);
                const outLen = this._fvOutLen;
                if (outLen < 3) {
                    this.clippedTriangleCount++;
                    continue;
                }

                // No CPU backface culling for dynamic models. 2004 RS models have
                // inconsistent winding orders and are pre-lit — culling by screen-space
                // winding makes faces vanish as the camera rotates. Roofs are hidden by
                // World's loc-shape filtering upstream, not here. The GPU z-buffer handles
                // depth correctly without CPU-side face rejection.
            }
            const outLen = this._fvOutLen;

            const beforeFloats = batch.length;
            for (let i = 1; i < outLen - 1; i++) {
                this.pushClippedTriangle(
                    batch,
                    this._fvOut[0], this._fvOut[i], this._fvOut[i + 1],
                    material,
                    modelTexture ? texture : -1,
                    alpha,
                    material === HDMaterial.Water ? HDWaterSource.Model : HDWaterSource.None
                );
            }

            if (alpha < 1) {
                targetTransparentBatches.push({
                    depth: this.faceDepth(pa, pb, pc),
                    priority,
                    texture: batchKey,
                    vertices: batch.slice(beforeFloats)
                });
            }

            this.modelVertexCount += (batch.length - beforeFloats) / VERTEX_FLOATS;
        }

        this.modelDrawCount++;
        if (isFarSceneModel) {
            this.farModelDrawCount++;
        }
        this.modelBatchCount = this.modelBatches.size + this.transparentBatches.length + this.staticFarModelBatches.size + this.staticFarTransparentBatches.length;
    }

    private static modelObjectId(model: HDModelInput): number {
        const objectModel = model as object;
        let id = this.modelObjectIds.get(objectModel);
        if (!id) {
            id = this.nextModelObjectId++;
            this.modelObjectIds.set(objectModel, id);
        }
        return id;
    }

    static isWebglUiMode(): boolean {
        return this.enabled && this.gl !== null;
    }



    static presentSoftwareCanvas(): boolean {
        if (!this.enabled) {
            return false;
        }

        this.init();
        if (!this.gl || !this.canvas) {
            return false;
        }

        const gameCanvas = document.getElementById('canvas') as HTMLCanvasElement | null;
        if (!gameCanvas || gameCanvas.width <= 0 || gameCanvas.height <= 0) {
            return false;
        }

        this.attachCanvas();
        this.resizeCanvasToCss();
        this.showTextureDebugOverlay(this.textureDebugModeName());
        this.ensureUiRenderer();

        if (!this.uiProgram || !this.uiVao || !this.uiBuffer || !this.uiTexture) {
            return false;
        }

        const gl = this.gl;
        const canvas = this.canvas;
        const vertices = new Float32Array([
            0, 0, 0, 0,
            canvas.width, 0, 1, 0,
            0, canvas.height, 0, 1,
            0, canvas.height, 0, 1,
            canvas.width, 0, 1, 0,
            canvas.width, canvas.height, 1, 1
        ]);

        gl.useProgram(this.uiProgram);
        gl.bindVertexArray(this.uiVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.uiBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.uiTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gameCanvas);

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.SCISSOR_TEST);
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.uniform2f(this.uiUniformCanvasSize, canvas.width, canvas.height);
        gl.uniform1i(this.uiUniformTexture, 1);
        gl.uniform1f(this.uiUniformKeyed, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.disable(gl.BLEND);
        gl.depthMask(true);
        gl.bindVertexArray(null);
        return true;
    }

    static drawPixMapLayer(imageData: ImageData, x: number, y: number, keyed: boolean): boolean {
        if (!this.enabled) {
            return false;
        }

        this.init();
        if (!this.gl || !this.canvas) {
            return false;
        }

        this.attachCanvas();
        this.resizeCanvasToCss();
        this.showTextureDebugOverlay(this.textureDebugModeName());
        this.ensureUiRenderer();

        if (!this.uiProgram || !this.uiVao || !this.uiBuffer || !this.uiTexture) {
            return false;
        }

        const gl = this.gl;
        const canvas = this.canvas;
        const scaleX = canvas.width / 765;
        const scaleY = canvas.height / 503;
        const px = Math.round(x * scaleX);
        const py = Math.round(y * scaleY);
        const pw = Math.round(imageData.width * scaleX);
        const ph = Math.round(imageData.height * scaleY);
        const x0 = px;
        const y0 = py;
        const x1 = px + pw;
        const y1 = py + ph;

        const vertices = new Float32Array([
            x0, y0, 0, 0,
            x1, y0, 1, 0,
            x0, y1, 0, 1,
            x0, y1, 0, 1,
            x1, y0, 1, 0,
            x1, y1, 1, 1
        ]);

        gl.useProgram(this.uiProgram);
        gl.bindVertexArray(this.uiVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.uiBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.uiTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.SCISSOR_TEST);
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.uniform2f(this.uiUniformCanvasSize, canvas.width, canvas.height);
        gl.uniform1i(this.uiUniformTexture, 1);
        gl.uniform1f(this.uiUniformKeyed, keyed ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.disable(gl.BLEND);
        gl.depthMask(true);
        gl.bindVertexArray(null);
        return true;
    }

    static renderFrame(): void {
        if (!this.enabled || !this.gl || !this.terrainProgram || !this.camera) {
            this.frameStarted = false;
            return;
        }

        try {
            this.attachCanvas();
            this.resizeCanvasToCss();
            this.showTextureDebugOverlay(this.textureDebugModeName());

            const canvas = this.canvas;
            if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
                this.frameStarted = false;
                return;
            }

            const gl = this.gl;
            const viewport = this.viewportRect(canvas);
            (globalThis as any)._hdPhase = 'renderFrame-syncTerrain';
            this.refreshBrightnessPaletteState();
            const syncStart = performance.now();
            this.syncTerrain(this.camera);
            const syncMs = performance.now() - syncStart;
            if (syncMs > 250) {
                fetch('/debug-log', { method: 'POST', body: '[hd-render] syncTerrain slow ' + syncMs.toFixed(1) + 'ms tiles:' + this.visibleGroundKeys.size + '/' + this.groundTiles.length + ' verts:' + this.terrainVertexCount + ' warmup:' + this.safeWarmupFrames }).catch(() => {});
            }
            (globalThis as any)._hdPhase = 'renderFrame-lightMatrix';
            this.buildLightSpaceMatrix(this.camera);
            (globalThis as any)._hdPhase = 'renderFrame-uploadModels';
            this.uploadModelBuffers();
            this.uploadStaticFarModelBuffers();

            // Keep shadows off by default for now. This keeps HD visibly enabled while
            // avoiding the extra shadow depth pass that can freeze some WebGL drivers.
            // DevTools override for testing: window.ENABLE_HD_SHADOWS = true
            const hdShadowsEnabled = (globalThis as any).ENABLE_HD_SHADOWS === true;
            if (hdShadowsEnabled) {
                (globalThis as any)._hdPhase = 'renderFrame-shadowPass';
                this.renderShadowPass();
            }

            (globalThis as any)._hdPhase = 'renderFrame-mainPass';
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            // Do not clear the whole WebGL canvas here. The 254 UI is drawn later as
            // PixMap layers, and many panels only redraw when dirty just like the
            // original software client. Only clear the 3D viewport every frame.
            gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(viewport.x, viewport.y, viewport.width, viewport.height);
            gl.clearColor(HD_SKY_COLOUR[0], HD_SKY_COLOUR[1], HD_SKY_COLOUR[2], 1);
            gl.clearDepth(1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.disable(gl.CULL_FACE);
            gl.disable(gl.BLEND);
            gl.depthMask(true);

            gl.useProgram(this.terrainProgram);
            this.setCameraUniforms(viewport.width, viewport.height);
            this.bindTextureAtlas();

            if (this.terrainVertexCount > 0 && this.terrainVao) {
                this.drawBuffer(this.terrainVao, this.terrainVertexCount);
            }

            this.drawStaticFarModels();
            this.uploadAndDrawModels();
            gl.flush();
            this.compositeViewportToGameCanvas(viewport);
            gl.disable(gl.SCISSOR_TEST);
            if (this.safeWarmupFrames > 0) {
                this.safeWarmupFrames--;
                if (this.safeWarmupFrames === 0) {
                    fetch('/debug-log', { method: 'POST', body: '[hd-render] safe warmup complete; camera-independent static cache + stable transparent scenery enabled' }).catch(() => {});
                }
            }
            this.publishStatus();
        } catch (error) {
            this.reason = error instanceof Error ? error.message : String(error);
            fetch('/debug-log', {
                method: 'POST',
                body: '[hd-render] failed phase:' + String((globalThis as any)._hdPhase ?? '-') + ' error:' + this.reason.substring(0, 400)
            }).catch(() => {});
            this.enabled = false;
            Pix3D.highDetail = false;
            Pix3D.lowDetail = true;
            this.setSoftwareCanvasHidden(false);
            this.publishStatus();
        } finally {
            this.frameStarted = false;
        }
    }

    private static normalKey(level: number, x: number, z: number): number {
        // Numeric key avoids per-vertex string allocation. Coordinates are scene-unit
        // multiples (max ~13312 for a 104-tile map), so 14-bit z, 14-bit x, 2-bit level
        // all fit within JS safe-integer range.
        return level * 268435456 + x * 16384 + z;
    }

    private static buildSmoothNormals(camera?: HDCameraInput): void {
        this.smoothNormalCache.clear();
        const acc = new Map<number, [number, number, number]>();

        // Extend camera range by 1 tile so shared-edge vertices pick up neighbour normals.
        const minX = camera ? camera.minTileX - 1 : -Infinity;
        const maxX = camera ? camera.maxTileX + 1 : Infinity;
        const minZ = camera ? camera.minTileZ - 1 : -Infinity;
        const maxZ = camera ? camera.maxTileZ + 1 : Infinity;
        const maxLvl = camera ? camera.maxLevel : Infinity;

        for (const tile of this.groundTiles) {
            if (tile.level > maxLvl || tile.x < minX || tile.x > maxX || tile.z < minZ || tile.z > maxZ) {
                continue;
            }
            const ground = this.getGround(tile);

            for (let i = 0; i < ground.faceVertexA.length; i++) {
                const face = this.groundFace(tile, ground, i);
                if (face.skip) {
                    continue;
                }

                const pa = face.pa;
                const pb = face.pb;
                const pc = face.pc;
                const [nx, ny, nz] = this.triangleNormal(pa, pb, pc);

                for (const p of [pa, pb, pc]) {
                    const key = this.normalKey(tile.level, p[0], p[2]);
                    const n = acc.get(key);
                    if (n) {
                        n[0] += nx; n[1] += ny; n[2] += nz;
                    } else {
                        acc.set(key, [nx, ny, nz]);
                    }
                }
            }
        }

        for (const [key, n] of acc) {
            const len = Math.hypot(n[0], n[1], n[2]) || 1;
            this.smoothNormalCache.set(key, [n[0] / len, n[1] / len, n[2] / len]);
        }
    }

    private static colourTableSignature(): number {
        // Pix3D.initColourTable(...) is called when the software brightness slider changes.
        // HD terrain colours are baked into the terrain vertex buffer, so unlike HD models
        // they will not react until the buffer is rebuilt.  Sampling the full 65k table
        // every frame is unnecessary; these spaced samples reliably change when the table
        // is regenerated, and the fallback length term catches table replacement.
        const table = Pix3D.colourTable;
        let sig = table.length | 0;
        const step = Math.max(1, (table.length / 64) | 0);
        for (let i = 0; i < table.length; i += step) {
            sig = (((sig << 5) - sig) ^ table[i]) | 0;
        }
        // Include the final entry because the loop may not land on it exactly.
        if (table.length > 0) {
            sig = (((sig << 5) - sig) ^ table[table.length - 1]) | 0;
        }
        return sig | 0;
    }

    private static refreshBrightnessPaletteState(): void {
        const sig = this.colourTableSignature();
        if (this.lastColourTableSignature === 0) {
            this.lastColourTableSignature = sig || 1;
            return;
        }

        if (sig === this.lastColourTableSignature) {
            return;
        }

        this.lastColourTableSignature = sig || 1;

        // Terrain colour RGB is baked into the VBO through colourIndexToRgb().
        // Rebuild immediately so the whole HD viewport changes brightness while
        // standing still, matching non-HD behaviour.  Ground objects are cached too,
        // so clear them before rebuilding from the original tile colour indices.
        this.groundObjectCache.clear();
        this.sceneDirty = true;
        this.lastCameraRange = null;
        this.terrainVertexCount = 0;
        fetch('/debug-log', { method: 'POST', body: '[hd-render] software brightness changed; rebuilding HD terrain buffer' }).catch(() => {});
    }

    private static syncTerrain(camera?: HDCameraInput): void {
        if (!this.gl || (!this.sceneDirty && !camera)) {
            return;
        }

        const lc = this.lastCameraRange;
        const cameraRangeUnchanged = camera && lc !== null &&
            camera.minTileX === lc.minX &&
            camera.minTileZ === lc.minZ &&
            camera.maxTileX === lc.maxX &&
            camera.maxTileZ === lc.maxZ &&
            camera.maxLevel === lc.maxLevel;

        if (!this.sceneDirty && cameraRangeUnchanged) {
            return;
        }

        if (this.sceneDirty) {
            this.buildSmoothNormals(camera);
            this.sceneDirty = false;
        }

        const vertices = this.buildTerrainVertices(camera);
        this.terrainVertexCount = vertices.length / VERTEX_FLOATS;

        if (!this.terrainBuffer) {
            this.terrainBuffer = this.gl.createBuffer();
        }

        if (!this.terrainBuffer) {
            this.reason = 'terrain buffer allocation failed';
            return;
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.terrainBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);

        if (!this.terrainVao) {
            this.terrainVao = this.setupVao(this.terrainBuffer);
        }

        if (camera) {
            this.lastCameraRange = {
                minX: camera.minTileX,
                minZ: camera.minTileZ,
                maxX: camera.maxTileX,
                maxZ: camera.maxTileZ,
                maxLevel: camera.maxLevel
            };
        }
    }

    private static buildTerrainVertices(camera?: HDCameraInput): Float32Array {
        const floats: number[] = [];

        // IMPORTANT:
        // visibleGroundKeys only contains the tiny set of tiles touched by the old
        // software visibility pass. During the safe HD warmup that can be just a few
        // tiles around the player, which is why the HD view looked like a small island
        // surrounded by grey sky.
        //
        // HD models are disabled by default now, so it is safe to build terrain from
        // the full ground tile list and simply filter it by the HD camera range.
        const tiles = this.groundTiles;

        for (const tile of tiles) {
            if (camera && !this.tileVisibleForCamera(tile, camera)) {
                continue;
            }

            this.pushGroundTile(floats, tile);
        }

        return new Float32Array(floats);
    }

    private static tileVisibleForCamera(tile: HDGroundTileInput, camera: HDCameraInput): boolean {
        return tile.level <= camera.maxLevel &&
            tile.x >= camera.minTileX &&
            tile.z >= camera.minTileZ &&
            tile.x < camera.maxTileX &&
            tile.z < camera.maxTileZ;
    }

    private static pushGroundTile(floats: number[], tile: HDGroundTileInput): void {
        const ground = this.getGround(tile);

        for (let i = 0; i < ground.faceVertexA.length; i++) {
            const face = this.groundFace(tile, ground, i);
            if (face.skip) {
                continue;
            }

            const { pa, pb, pc, colourA, colourB, colourC, material, texture, waterSource } = face;
            this.countTexture(texture);
            this.countMaterial(material);

            const faceNormal = this.triangleNormal(pa, pb, pc);
            // Skip near-vertical terrain faces. The RS terrain mesh has tiles where one
            // corner is at cliff height and the rest at ground level; from a ground-level
            // HD camera these render as tall spiked triangles that never appeared in the
            // fixed-overhead 2D view.
            // faceNormal[1] < 0 = sky-facing (RS Y-down).
            if (faceNormal[1] > -0.15 || this.isSpikeSheetTerrainFace(faceNormal, colourA, colourB, colourC)) {
                continue;
            }
            const normalA = material === HDMaterial.Water
                ? faceNormal
                : (this.smoothNormalCache.get(this.normalKey(tile.level, pa[0], pa[2])) ?? faceNormal);
            const normalB = material === HDMaterial.Water
                ? faceNormal
                : (this.smoothNormalCache.get(this.normalKey(tile.level, pb[0], pb[2])) ?? faceNormal);
            const normalC = material === HDMaterial.Water
                ? faceNormal
                : (this.smoothNormalCache.get(this.normalKey(tile.level, pc[0], pc[2])) ?? faceNormal);

            this.pushTriangle(
                floats,
                pa, pb, pc,
                colourA,
                colourB,
                colourC,
                material,
                texture,
                this.tileUv(pa, tile.x, tile.z), this.tileUv(pb, tile.x, tile.z), this.tileUv(pc, tile.x, tile.z),
                1,
                normalA, normalB, normalC,
                waterSource
            );
        }
    }

    private static groundFace(tile: HDGroundTileInput, ground: Ground, faceIndex: number): {
        pa: [number, number, number];
        pb: [number, number, number];
        pc: [number, number, number];
        colourA: readonly [number, number, number];
        colourB: readonly [number, number, number];
        colourC: readonly [number, number, number];
        material: number;
        texture: number;
        waterSource: HDWaterSource;
        skip: boolean;
    } {
        const a = ground.faceVertexA[faceIndex];
        const b = ground.faceVertexB[faceIndex];
        const c = ground.faceVertexC[faceIndex];
        const pa: [number, number, number] = [ground.vertexX[a], ground.vertexY[a], ground.vertexZ[a]];
        const pb: [number, number, number] = [ground.vertexX[b], ground.vertexY[b], ground.vertexZ[b]];
        const pc: [number, number, number] = [ground.vertexX[c], ground.vertexY[c], ground.vertexZ[c]];
        const textureCandidate = ground.faceTexture && ground.faceTexture[faceIndex] >= 0 ? ground.faceTexture[faceIndex] : -1;
        let texture = this.isValid254Texture(textureCandidate) ? textureCandidate : -1;
        const colourA = this.colourIndexToRgb(ground.faceColourA[faceIndex]);
        const colourB = this.colourIndexToRgb(ground.faceColourB[faceIndex]);
        const colourC = this.colourIndexToRgb(ground.faceColourC[faceIndex]);
        const avg = this.averageColour(colourA, colourB, colourC);

        const texturedOverlayFace = ground.faceTexture !== null && ground.faceTexture[faceIndex] >= 0;
        const isOverlayFace = texturedOverlayFace || this.isColourOverlayFace(tile, avg);
        const material = this.isValid254Texture(texture)
            ? this.materialForTexture(texture, avg)
            : this.materialForFloor(tile, avg, isOverlayFace);

        if (material === HDMaterial.Water && texture === -1) {
            texture = 1;
        }

        let skip = false;
        if (material === HDMaterial.Water) {
            // Skip faces where the terrain itself slopes steeply. Cliff-edge shaped
            // water can otherwise flatten one high corner into a huge triangular plane.
            if (this.faceHeightDelta(pa, pb, pc) > WATER_SURFACE_MAX_HEIGHT_DELTA) {
                skip = true;
            } else {
                const waterY = this.waterPlaneY(tile);
                pa[1] = waterY;
                pb[1] = waterY;
                pc[1] = waterY;
            }
        }

        const waterSource = material === HDMaterial.Water
            ? this.waterSourceForTerrainFace(tile, textureCandidate)
            : HDWaterSource.None;

        return { pa, pb, pc, colourA, colourB, colourC, material, texture, waterSource, skip };
    }

    private static waterSourceForTerrainFace(tile: HDGroundTileInput, textureCandidate: number): HDWaterSource {
        const textured = this.isValid254Texture(textureCandidate);
        if (tile.shape === PLAIN_TERRAIN_SHAPE) {
            return textured ? HDWaterSource.PlainTerrain : HDWaterSource.PlainTerrainColour;
        }

        return textured ? HDWaterSource.ShapedTerrain : HDWaterSource.ShapedTerrainColour;
    }

    private static faceHeightDelta(
        a: readonly [number, number, number],
        b: readonly [number, number, number],
        c: readonly [number, number, number]
    ): number {
        const minY = Math.min(a[1], b[1], c[1]);
        const maxY = Math.max(a[1], b[1], c[1]);
        return maxY - minY;
    }

    private static isColourOverlayFace(tile: HDGroundTileInput, faceColour: readonly [number, number, number]): boolean {
        if (tile.overlayId < 0 || tile.texture >= 0) {
            return false;
        }

        const underlay = this.averageTileColour(tile.colours);
        const overlay = this.averageTileColour(tile.secondaryColours);
        return this.colourDistanceSq(faceColour, overlay) < this.colourDistanceSq(faceColour, underlay);
    }

    private static averageTileColour(colours: readonly [number, number, number, number]): readonly [number, number, number] {
        const a = this.colourIndexToRgb(colours[0]);
        const b = this.colourIndexToRgb(colours[1]);
        const c = this.colourIndexToRgb(colours[2]);
        const d = this.colourIndexToRgb(colours[3]);
        return [
            (a[0] + b[0] + c[0] + d[0]) / 4,
            (a[1] + b[1] + c[1] + d[1]) / 4,
            (a[2] + b[2] + c[2] + d[2]) / 4
        ];
    }

    private static colourDistanceSq(a: readonly [number, number, number], b: readonly [number, number, number]): number {
        const dr = a[0] - b[0];
        const dg = a[1] - b[1];
        const db = a[2] - b[2];
        return dr * dr + dg * dg + db * db;
    }

    private static waterPlaneY(tile: HDGroundTileInput): number {
        return Math.min(tile.heights[0], tile.heights[1], tile.heights[2], tile.heights[3]);
    }

    private static pushTriangle(
        floats: number[],
        a: readonly [number, number, number],
        b: readonly [number, number, number],
        c: readonly [number, number, number],
        colourA: readonly [number, number, number],
        colourB: readonly [number, number, number],
        colourC: readonly [number, number, number],
        material: number,
        texture: number,
        uvA: readonly [number, number],
        uvB: readonly [number, number],
        uvC: readonly [number, number],
        alpha: number = 1,
        normalA?: readonly [number, number, number],
        normalB?: readonly [number, number, number],
        normalC?: readonly [number, number, number],
        waterSource: HDWaterSource = HDWaterSource.None
    ): void {
        const face = this.triangleNormal(a, b, c);
        this.pushVertex(floats, a, normalA ?? face, colourA, material, texture, uvA, alpha, waterSource);
        this.pushVertex(floats, b, normalB ?? face, colourB, material, texture, uvB, alpha, waterSource);
        this.pushVertex(floats, c, normalC ?? face, colourC, material, texture, uvC, alpha, waterSource);
    }

    private static pushVertex(
        floats: number[],
        position: readonly [number, number, number],
        normal: readonly [number, number, number],
        colour: readonly [number, number, number],
        material: number,
        texture: number,
        uv: readonly [number, number],
        alpha: number,
        waterSource: HDWaterSource
    ): void {
        floats.push(
            position[0], position[1], position[2],
            normal[0], normal[1], normal[2],
            colour[0], colour[1], colour[2],
            material,
            uv[0], uv[1],
            texture,
            alpha,
            waterSource
        );
    }

    private static pushClippedTriangle(
        floats: number[],
        a: HDClipVertex,
        b: HDClipVertex,
        c: HDClipVertex,
        material: number,
        texture: number,
        alpha: number,
        waterSource: HDWaterSource
    ): void {
        this.pushTriangle(
            floats,
            a.position, b.position, c.position,
            a.colour, b.colour, c.colour,
            material,
            texture,
            a.uv, b.uv, c.uv,
            alpha,
            undefined, undefined, undefined,
            waterSource
        );
    }

    private static triangleNormal(
        a: readonly [number, number, number],
        b: readonly [number, number, number],
        c: readonly [number, number, number]
    ): readonly [number, number, number] {
        const abx = b[0] - a[0];
        const aby = b[1] - a[1];
        const abz = b[2] - a[2];
        const acx = c[0] - a[0];
        const acy = c[1] - a[1];
        const acz = c[2] - a[2];

        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        const len = Math.hypot(nx, ny, nz) || 1;

        return [nx / len, ny / len, nz / len];
    }

    private static tileUv(position: readonly [number, number, number], tileX: number, tileZ: number): readonly [number, number] {
        return [(position[0] - tileX * 128) / 128, (position[2] - tileZ * 128) / 128];
    }

    private static textureBasisUvs(
        a: readonly [number, number, number],
        b: readonly [number, number, number],
        c: readonly [number, number, number],
        origin: readonly [number, number, number],
        uPoint: readonly [number, number, number],
        vPoint: readonly [number, number, number]
    ): readonly [readonly [number, number], readonly [number, number], readonly [number, number]] {
        const ux = uPoint[0] - origin[0];
        const uy = uPoint[1] - origin[1];
        const uz = uPoint[2] - origin[2];
        const vx = vPoint[0] - origin[0];
        const vy = vPoint[1] - origin[1];
        const vz = vPoint[2] - origin[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const ax = Math.abs(nx);
        const ay = Math.abs(ny);
        const az = Math.abs(nz);

        if (ax >= ay && ax >= az) {
            return [
                this.projectUv2d(a[1], a[2], origin[1], origin[2], uPoint[1], uPoint[2], vPoint[1], vPoint[2]),
                this.projectUv2d(b[1], b[2], origin[1], origin[2], uPoint[1], uPoint[2], vPoint[1], vPoint[2]),
                this.projectUv2d(c[1], c[2], origin[1], origin[2], uPoint[1], uPoint[2], vPoint[1], vPoint[2])
            ];
        }

        if (ay >= az) {
            return [
                this.projectUv2d(a[0], a[2], origin[0], origin[2], uPoint[0], uPoint[2], vPoint[0], vPoint[2]),
                this.projectUv2d(b[0], b[2], origin[0], origin[2], uPoint[0], uPoint[2], vPoint[0], vPoint[2]),
                this.projectUv2d(c[0], c[2], origin[0], origin[2], uPoint[0], uPoint[2], vPoint[0], vPoint[2])
            ];
        }

        return [
            this.projectUv2d(a[0], a[1], origin[0], origin[1], uPoint[0], uPoint[1], vPoint[0], vPoint[1]),
            this.projectUv2d(b[0], b[1], origin[0], origin[1], uPoint[0], uPoint[1], vPoint[0], vPoint[1]),
            this.projectUv2d(c[0], c[1], origin[0], origin[1], uPoint[0], uPoint[1], vPoint[0], vPoint[1])
        ];
    }

    private static projectUv2d(px: number, py: number, ox: number, oy: number, ux: number, uy: number, vx: number, vy: number): readonly [number, number] {
        const uAxisX = ux - ox;
        const uAxisY = uy - oy;
        const vAxisX = vx - ox;
        const vAxisY = vy - oy;
        const det = uAxisX * vAxisY - uAxisY * vAxisX;

        if (Math.abs(det) < 0.001) {
            return [0, 0];
        }

        const dx = px - ox;
        const dy = py - oy;
        const u = (dx * vAxisY - dy * vAxisX) / det;
        const v = (uAxisX * dy - uAxisY * dx) / det;
        return [u, v];
    }

    private static clipPolygonToNear(vertices: HDClipVertex[]): HDClipVertex[] {
        const clipped: HDClipVertex[] = [];

        for (let i = 0; i < vertices.length; i++) {
            const current = vertices[i];
            const previous = vertices[(i + vertices.length - 1) % vertices.length];
            const currentInside = current.depth >= 50;
            const previousInside = previous.depth >= 50;

            if (currentInside !== previousInside) {
                clipped.push(this.interpolateClipVertex(previous, current, (50 - previous.depth) / (current.depth - previous.depth)));
                this.clippedTriangleCount++;
            }

            if (currentInside) {
                clipped.push(current);
            }
        }

        return clipped;
    }

    private static interpolateClipVertex(a: HDClipVertex, b: HDClipVertex, t: number): HDClipVertex {
        return {
            position: [
                a.position[0] + (b.position[0] - a.position[0]) * t,
                a.position[1] + (b.position[1] - a.position[1]) * t,
                a.position[2] + (b.position[2] - a.position[2]) * t
            ],
            colour: [
                a.colour[0] + (b.colour[0] - a.colour[0]) * t,
                a.colour[1] + (b.colour[1] - a.colour[1]) * t,
                a.colour[2] + (b.colour[2] - a.colour[2]) * t
            ],
            uv: [
                a.uv[0] + (b.uv[0] - a.uv[0]) * t,
                a.uv[1] + (b.uv[1] - a.uv[1]) * t
            ],
            depth: 50
        };
    }

    private static isBackface(a: HDClipVertex, b: HDClipVertex, c: HDClipVertex): boolean {
        const screenA = this.projectScreen(a.position);
        const screenB = this.projectScreen(b.position);
        const screenC = this.projectScreen(c.position);

        if (!screenA || !screenB || !screenC) {
            return false;
        }

        const dxAB = screenA[0] - screenB[0];
        const dyAB = screenA[1] - screenB[1];
        const dxCB = screenC[0] - screenB[0];
        const dyCB = screenC[1] - screenB[1];
        return dxAB * dyCB - dyAB * dxCB <= 0;
    }

    private static projectScreen(position: readonly [number, number, number]): readonly [number, number] | null {
        if (!this.camera) {
            return null;
        }

        const relativeX = position[0] - this.camera.eyeX;
        const relativeY = position[1] - this.camera.eyeY;
        const relativeZ = position[2] - this.camera.eyeZ;
        const sinEyePitch = this.camera.sinEyePitch / 65536;
        const cosEyePitch = this.camera.cosEyePitch / 65536;
        const sinEyeYaw = this.camera.sinEyeYaw / 65536;
        const cosEyeYaw = this.camera.cosEyeYaw / 65536;
        const zPrime = relativeZ * cosEyeYaw - relativeX * sinEyeYaw;
        const viewX = relativeZ * sinEyeYaw + relativeX * cosEyeYaw;
        const viewY = relativeY * cosEyePitch - zPrime * sinEyePitch;
        const viewZ = relativeY * sinEyePitch + zPrime * cosEyePitch;

        if (viewZ < 50) {
            return null;
        }

        return [
            VIEWPORT_WIDTH / 2 + (viewX * 512) / viewZ,
            VIEWPORT_HEIGHT / 2 + (viewY * 512) / viewZ
        ];
    }

    private static alphaForFace(alpha: number): number {
        if (alpha <= 0) {
            return 1;
        }

        return Math.max(0.05, Math.min(1, 1 - alpha / 255));
    }

    private static prioritySortGroup(priority: number): number {
        if (priority === 10) {
            return 1;
        }
        if (priority === 11) {
            return 2;
        }
        return priority + 3;
    }

    private static faceVertexDepth(position: readonly [number, number, number]): number {
        if (!this.camera) {
            return 0;
        }

        return this.viewDepth(position[0] - this.camera.eyeX, position[1] - this.camera.eyeY, position[2] - this.camera.eyeZ);
    }

    private static faceDepth(a: readonly [number, number, number], b: readonly [number, number, number], c: readonly [number, number, number]): number {
        if (!this.camera) {
            return 0;
        }

        return (
            this.viewDepth(a[0] - this.camera.eyeX, a[1] - this.camera.eyeY, a[2] - this.camera.eyeZ) +
            this.viewDepth(b[0] - this.camera.eyeX, b[1] - this.camera.eyeY, b[2] - this.camera.eyeZ) +
            this.viewDepth(c[0] - this.camera.eyeX, c[1] - this.camera.eyeY, c[2] - this.camera.eyeZ)
        ) / 3;
    }

    private static viewDepth(relativeX: number, relativeY: number, relativeZ: number): number {
        if (!this.camera) {
            return 0;
        }

        const sinEyePitch = this.camera.sinEyePitch / 65536;
        const cosEyePitch = this.camera.cosEyePitch / 65536;
        const sinEyeYaw = this.camera.sinEyeYaw / 65536;
        const cosEyeYaw = this.camera.cosEyeYaw / 65536;
        const zPrime = relativeZ * cosEyeYaw - relativeX * sinEyeYaw;
        return relativeY * sinEyePitch + zPrime * cosEyePitch;
    }

    private static hslToRgb(hsl: number): readonly [number, number, number] {
        if (hsl < 0) {
            return [0, 0, 0];
        }

        const hue = ((hsl >> 10) & 0x3f) / 64;
        const saturation = ((hsl >> 7) & 0x7) / 8;
        const lightness = (hsl & 0x7f) / 128;

        if (saturation === 0) {
            return [lightness, lightness, lightness];
        }

        const q = lightness < 0.5
            ? lightness * (1 + saturation)
            : lightness + saturation - lightness * saturation;
        const p = 2 * lightness - q;

        return [
            this.hueToRgb(p, q, hue + 1 / 3),
            this.hueToRgb(p, q, hue),
            this.hueToRgb(p, q, hue - 1 / 3)
        ];
    }

    private static colourIndexToRgb(index: number): readonly [number, number, number] {
        if (index < 0) {
            return [0, 0, 0];
        }

        const rgb = Pix3D.colourTable[index & 0xffff];
        if (rgb === 0) {
            return this.hslToRgb(index);
        }

        return [
            ((rgb >> 16) & 0xff) / 255,
            ((rgb >> 8) & 0xff) / 255,
            (rgb & 0xff) / 255
        ];
    }

    private static hueToRgb(p: number, q: number, t: number): number {
        if (t < 0) {
            t += 1;
        } else if (t > 1) {
            t -= 1;
        }

        if (t < 1 / 6) {
            return p + (q - p) * 6 * t;
        }
        if (t < 1 / 2) {
            return q;
        }
        if (t < 2 / 3) {
            return p + (q - p) * (2 / 3 - t) * 6;
        }
        return p;
    }

    private static averageColour(
        a: readonly [number, number, number],
        b: readonly [number, number, number],
        c: readonly [number, number, number]
    ): readonly [number, number, number] {
        return [
            (a[0] + b[0] + c[0]) / 3,
            (a[1] + b[1] + c[1]) / 3,
            (a[2] + b[2] + c[2]) / 3
        ];
    }

    // ── Zero-allocation in-place variants used by queueModel() ───────────────

    private static colourIndexToRgbInto(index: number, out: [number, number, number]): void {
        if (index < 0) { out[0] = out[1] = out[2] = 0; return; }
        const rgb = Pix3D.colourTable[index & 0xffff];
        if (rgb === 0) {
            const c = this.hslToRgb(index);
            out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
            return;
        }
        out[0] = ((rgb >> 16) & 0xff) / 255;
        out[1] = ((rgb >> 8) & 0xff) / 255;
        out[2] = (rgb & 0xff) / 255;
    }

    private static averageColourInto(
        a: [number, number, number],
        b: [number, number, number],
        c: [number, number, number],
        out: [number, number, number]
    ): void {
        out[0] = (a[0] + b[0] + c[0]) / 3;
        out[1] = (a[1] + b[1] + c[1]) / 3;
        out[2] = (a[2] + b[2] + c[2]) / 3;
    }

    private static triangleNormalInto(
        a: [number, number, number],
        b: [number, number, number],
        c: [number, number, number],
        out: [number, number, number]
    ): void {
        const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
        const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        const len = Math.hypot(nx, ny, nz) || 1;
        out[0] = nx / len; out[1] = ny / len; out[2] = nz / len;
    }

    private static projectUv2dInto(px: number, py: number, ox: number, oy: number, ux: number, uy: number, vx: number, vy: number, out: [number, number]): void {
        const uAxisX = ux - ox, uAxisY = uy - oy;
        const vAxisX = vx - ox, vAxisY = vy - oy;
        const det = uAxisX * vAxisY - uAxisY * vAxisX;
        if (Math.abs(det) < 0.001) { out[0] = 0; out[1] = 0; return; }
        const dx = px - ox, dy = py - oy;
        out[0] = (dx * vAxisY - dy * vAxisX) / det;
        out[1] = (uAxisX * dy - uAxisY * dx) / det;
    }

    private static textureBasisUvsInto(
        a: [number, number, number], b: [number, number, number], c: [number, number, number],
        origin: [number, number, number], uPoint: [number, number, number], vPoint: [number, number, number],
        outA: [number, number], outB: [number, number], outC: [number, number]
    ): void {
        const ux = uPoint[0] - origin[0], uy = uPoint[1] - origin[1], uz = uPoint[2] - origin[2];
        const vx = vPoint[0] - origin[0], vy = vPoint[1] - origin[1], vz = vPoint[2] - origin[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        if (ax >= ay && ax >= az) {
            this.projectUv2dInto(a[1], a[2], origin[1], origin[2], uPoint[1], uPoint[2], vPoint[1], vPoint[2], outA);
            this.projectUv2dInto(b[1], b[2], origin[1], origin[2], uPoint[1], uPoint[2], vPoint[1], vPoint[2], outB);
            this.projectUv2dInto(c[1], c[2], origin[1], origin[2], uPoint[1], uPoint[2], vPoint[1], vPoint[2], outC);
        } else if (ay >= az) {
            this.projectUv2dInto(a[0], a[2], origin[0], origin[2], uPoint[0], uPoint[2], vPoint[0], vPoint[2], outA);
            this.projectUv2dInto(b[0], b[2], origin[0], origin[2], uPoint[0], uPoint[2], vPoint[0], vPoint[2], outB);
            this.projectUv2dInto(c[0], c[2], origin[0], origin[2], uPoint[0], uPoint[2], vPoint[0], vPoint[2], outC);
        } else {
            this.projectUv2dInto(a[0], a[1], origin[0], origin[1], uPoint[0], uPoint[1], vPoint[0], vPoint[1], outA);
            this.projectUv2dInto(b[0], b[1], origin[0], origin[1], uPoint[0], uPoint[1], vPoint[0], vPoint[1], outB);
            this.projectUv2dInto(c[0], c[1], origin[0], origin[1], uPoint[0], uPoint[1], vPoint[0], vPoint[1], outC);
        }
    }

    private static interpolateClipVertexInto(a: HDClipVertex, b: HDClipVertex, t: number, out: HDClipVertex): void {
        const ap = a.position, bp = b.position;
        out.position[0] = ap[0] + (bp[0] - ap[0]) * t;
        out.position[1] = ap[1] + (bp[1] - ap[1]) * t;
        out.position[2] = ap[2] + (bp[2] - ap[2]) * t;
        const ac = a.colour, bc = b.colour;
        out.colour[0] = ac[0] + (bc[0] - ac[0]) * t;
        out.colour[1] = ac[1] + (bc[1] - ac[1]) * t;
        out.colour[2] = ac[2] + (bc[2] - ac[2]) * t;
        const au = a.uv, bu = b.uv;
        out.uv[0] = au[0] + (bu[0] - au[0]) * t;
        out.uv[1] = au[1] + (bu[1] - au[1]) * t;
        out.depth = 50;
    }

    /** Clips the 3 vertices in _fvIn[0..2] against the near plane.
     *  Results are written into _fvOut; _fvOutLen is set to the output count. */
    private static clipPolygonToNearInto(inLen: number): void {
        this._fvOutLen = 0;
        for (let i = 0; i < inLen; i++) {
            const current = this._fvIn[i];
            const previous = this._fvIn[(i + inLen - 1) % inLen];
            const currentInside = current.depth >= 50;
            const previousInside = previous.depth >= 50;
            if (currentInside !== previousInside) {
                const t = (50 - previous.depth) / (current.depth - previous.depth);
                this.interpolateClipVertexInto(previous, current, t, this._fvOut[this._fvOutLen++]);
                this.clippedTriangleCount++;
            }
            if (currentInside) {
                const out = this._fvOut[this._fvOutLen++];
                const cp = current.position, co = current.colour, cu = current.uv;
                out.position[0] = cp[0]; out.position[1] = cp[1]; out.position[2] = cp[2];
                out.colour[0] = co[0]; out.colour[1] = co[1]; out.colour[2] = co[2];
                out.uv[0] = cu[0]; out.uv[1] = cu[1];
                out.depth = current.depth;
            }
        }
    }

    private static textureDebugModeName(): string {
        const g = globalThis as unknown as { HD_TEXTURE_DEBUG_MODE?: string; window?: { HD_TEXTURE_DEBUG_MODE?: string } };
        const fromWindow = typeof window !== 'undefined'
            ? (window as unknown as { HD_TEXTURE_DEBUG_MODE?: string }).HD_TEXTURE_DEBUG_MODE
            : undefined;
        return String(g.HD_TEXTURE_DEBUG_MODE ?? fromWindow ?? 'normal').toLowerCase();
    }

    private static textureDebugMode(): number {
        const value = this.textureDebugModeName();
        switch (value) {
            case 'flat':
            case 'off':
            case 'no-textures':
                return 1;
            case 'id':
            case 'ids':
            case 'id-colour':
            case 'id-colours':
            case 'id-colors':
                return 2;
            case 'single':
            case 'single-texture':
            case 'force-zero':
                return 3;
            case 'uv':
            case 'uvs':
                return 4;
            case 'texture':
            case 'textures':
            case 'texture-only':
            case 'raw-texture':
            case 'raw-textures':
                return 5;
            case 'water':
            case 'water-source':
            case 'water-sources':
            case 'water-debug':
                return 6;
            case 'shader-test':
            case 'pink':
            case 'magenta':
                return 9;
            case 'normal':
            default:
                return 0;
        }
    }

    private static setTextureDebugMode(mode: string): void {
        const normalised = mode.toLowerCase();
        (globalThis as unknown as { HD_TEXTURE_DEBUG_MODE?: string }).HD_TEXTURE_DEBUG_MODE = normalised;
        if (typeof window !== 'undefined') {
            (window as unknown as { HD_TEXTURE_DEBUG_MODE?: string }).HD_TEXTURE_DEBUG_MODE = normalised;
        }
        this.showTextureDebugOverlay(normalised);
        // Force cached scene data to be rebuilt on the next render for modes that
        // also affect CPU-side batches in older builds.
        this.sceneDirty = true;
        this.modelBatches.clear();
        this.modelVaos.forEach((vao) => {
            if (this.gl && vao) {
                this.gl.deleteVertexArray(vao);
            }
        });
        this.modelVaos.clear();
        this.modelBuffers.forEach((buffer) => {
            if (this.gl && buffer) {
                this.gl.deleteBuffer(buffer);
            }
        });
        this.modelBuffers.clear();
        this.transparentBatches = [];
        this.clearStaticFarScene();
    }

    private static installTextureDebugHotkeys(): void {
        if (this.debugHotkeysInstalled || typeof window === 'undefined') {
            return;
        }
        this.debugHotkeysInstalled = true;

        const modes = ['normal', 'flat', 'id-colours', 'single-texture', 'uv', 'texture-only', 'water-source'];
        window.addEventListener('keydown', (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            if (event.ctrlKey && event.shiftKey && key === 'd') {
                event.preventDefault();
                event.stopPropagation();
                this.showTextureDiagnosticsOverlay();
            } else if (event.ctrlKey && event.shiftKey && key === 'a') {
                event.preventDefault();
                event.stopPropagation();
                this.showTextureAtlasPreview();
            } else if (event.key === 'F6') {
                event.preventDefault();
                event.stopPropagation();
                const current = this.textureDebugModeName();
                const index = Math.max(0, modes.indexOf(current));
                const delta = event.shiftKey ? -1 : 1;
                const next = modes[(index + delta + modes.length) % modes.length];
                this.setTextureDebugMode(next);
            } else if (event.key === 'F7') {
                event.preventDefault();
                event.stopPropagation();
                this.setTextureDebugMode('normal');
            } else if (event.key === 'F8') {
                event.preventDefault();
                event.stopPropagation();
                this.setTextureDebugMode('shader-test');
            } else if (event.key === 'F9') {
                event.preventDefault();
                event.stopPropagation();
                this.setTextureDebugMode('flat');
            } else if (event.key === 'F10') {
                event.preventDefault();
                event.stopPropagation();
                this.showTextureDiagnosticsOverlay();
            } else if (event.key === 'F11') {
                event.preventDefault();
                event.stopPropagation();
                this.showTextureAtlasPreview();
            }
        }, true);

        this.showTextureDebugOverlay(this.textureDebugModeName());
    }

    private static showTextureDebugOverlay(mode: string): void {
        if (typeof document === 'undefined') {
            return;
        }
        if (!this.debugOverlay) {
            const overlay = document.createElement('div');
            overlay.id = 'hd-texture-debug-overlay';
            overlay.style.position = 'fixed';
            overlay.style.left = '8px';
            overlay.style.top = '8px';
            overlay.style.zIndex = '999999';
            overlay.style.pointerEvents = 'none';
            overlay.style.padding = '4px 6px';
            overlay.style.background = 'rgba(0, 0, 0, 0.75)';
            overlay.style.color = '#ffff00';
            overlay.style.font = '12px monospace';
            overlay.style.border = '1px solid rgba(255, 255, 0, 0.8)';
            document.body.appendChild(overlay);
            this.debugOverlay = overlay;
        }
        this.debugOverlay.textContent = `HD ${HD_RENDERER_BUILD} | texture debug: ${mode}  |  F6 cycle, Shift+F6 back, F7 normal, F8 pink, F9 flat, F10/Ctrl+Shift+D diag, F11/Ctrl+Shift+A atlas | water: blue plain, yellow shaped, magenta model, cyan/orange inferred`;
        this.debugOverlay.style.display = this.enabled ? 'block' : 'none';
    }

    private static isValid254Texture(texture: number): boolean {
        return Number.isInteger(texture) && texture >= 0 && texture < CACHE_TEXTURE_COUNT;
    }

    private static materialForTexture(texture: number, colour: readonly [number, number, number] = [0.5, 0.5, 0.5]): number {
        const material = SERVER_TEXTURE_MATERIALS[texture];
        if (material !== undefined && material !== HDMaterial.Default) {
            return material;
        }

        return this.materialForColour(colour, HDMaterial.Default);
    }

    private static materialForModelTexture(texture: number, colour: readonly [number, number, number] = [0.5, 0.5, 0.5]): number {
        const material = this.materialForTexture(texture, colour);
        if (material === HDMaterial.Water || material === HDMaterial.Lava) {
            return HDMaterial.Model;
        }

        return material;
    }

    private static materialForModelColour(colour: readonly [number, number, number]): number {
        const material = this.materialForColour(colour, HDMaterial.Model);
        return material === HDMaterial.Water || material === HDMaterial.Lava
            ? HDMaterial.Model
            : material;
    }

    private static isSpikeSheetTerrainFace(
        normal: readonly [number, number, number],
        colourA: readonly [number, number, number],
        colourB: readonly [number, number, number],
        colourC: readonly [number, number, number]
    ): boolean {
        if (normal[1] <= -0.65) {
            return false;
        }

        const [r, g, b] = this.averageColour(colourA, colourB, colourC);
        const brightness = (r + g + b) / 3;
        return brightness > 0.32 && g > r * 1.03 && b > r * 0.78;
    }

    private static materialForColour(colour: readonly [number, number, number], fallback: number = HDMaterial.Default): number {
        const [r, g, b] = colour;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max - min;
        const brightness = (r + g + b) / 3;

        if (b > r * 1.15 && b > g * 1.1 && saturation > 0.08) {
            return HDMaterial.Water;
        }

        if (r > 0.50 && r > g * 1.8 && b < g * 0.6 && brightness > 0.35) {
            return HDMaterial.Lava;
        }

        if (g > r * 1.08 && g > b * 1.08 && saturation > 0.08) {
            return brightness < 0.42 ? HDMaterial.Moss : HDMaterial.Foliage;
        }

        if (r > 0.34 && g < 0.3 && b < 0.25) {
            return HDMaterial.Roof;
        }

        if (r > g * 1.08 && g > b * 1.05 && brightness < 0.58) {
            return HDMaterial.Wood;
        }

        if (saturation < 0.08 && brightness > 0.56) {
            return HDMaterial.Marble;
        }

        if (saturation < 0.12 && brightness > 0.36) {
            return HDMaterial.Metal;
        }

        if (saturation < 0.14) {
            return HDMaterial.Stone;
        }

        return fallback;
    }

    private static materialForTerrainColour(colour: readonly [number, number, number]): number {
        const [r, g, b] = colour;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max - min;
        const brightness = (r + g + b) / 3;

        if (b > r * 1.15 && b > g * 1.1 && saturation > 0.08) {
            return HDMaterial.Water;
        }

        if (r > 0.50 && r > g * 1.8 && b < g * 0.6 && brightness > 0.35) {
            return HDMaterial.Lava;
        }

        if (g > r * 1.04 && g > b * 1.04 && saturation > 0.05) {
            return brightness < 0.42 ? HDMaterial.Moss : HDMaterial.Foliage;
        }

        if (r > g * 1.03 && g >= b * 0.9 && brightness < 0.62) {
            return HDMaterial.Earth;
        }

        if (saturation < 0.16) {
            return brightness > 0.52 ? HDMaterial.Stone : HDMaterial.Earth;
        }

        return this.materialForColour(colour, HDMaterial.Earth);
    }

    private static materialForFloor(tile: HDGroundTileInput, colour: readonly [number, number, number], isOverlayFace: boolean = true): number {
        const floorId = isOverlayFace
            ? (tile.overlayId >= 0 ? tile.overlayId : tile.underlayId)
            : (tile.underlayId >= 0 ? tile.underlayId : tile.overlayId);
        if (GRASS_FLOOR_IDS.has(floorId)) {
            return HDMaterial.Foliage;
        }
        if (EARTH_FLOOR_IDS.has(floorId)) {
            return HDMaterial.Earth;
        }
        if (STONE_FLOOR_IDS.has(floorId)) {
            return HDMaterial.Stone;
        }

        return this.materialForTerrainColour(colour);
    }

    private static countMaterial(material: number): void {
        const index = Math.max(0, Math.min(this.materialCounts.length - 1, material | 0));
        this.materialCounts[index] = (this.materialCounts[index] ?? 0) + 1;
    }

    private static countTexture(texture: number): void {
        if (!this.isValid254Texture(texture)) {
            if (texture === -1) {
                this.untexturedTriangleCount++;
            } else {
                this.invalidTextureCount++;
            }
            return;
        }

        this.textureUseCounts[texture] = (this.textureUseCounts[texture] ?? 0) + 1;
    }

    private static materialName(material: number): string {
        switch (material) {
            case HDMaterial.Default:
                return 'Default';
            case HDMaterial.Water:
                return 'Water';
            case HDMaterial.Lava:
                return 'Lava';
            case HDMaterial.Model:
                return 'Model';
            case HDMaterial.Stone:
                return 'Stone';
            case HDMaterial.Wood:
                return 'Wood';
            case HDMaterial.Marble:
                return 'Marble';
            case HDMaterial.Moss:
                return 'Moss';
            case HDMaterial.Pebble:
                return 'Pebble';
            case HDMaterial.Foliage:
                return 'Foliage';
            case HDMaterial.Metal:
                return 'Metal';
            case HDMaterial.Roof:
                return 'Roof';
            case HDMaterial.Unlit:
                return 'Unlit';
            case HDMaterial.Earth:
                return 'Earth';
            default:
                return String(material);
        }
    }

    private static keyedTextureAlpha(rgb: number, hasTransparency: boolean): number {
        if (!hasTransparency) {
            return 255;
        }

        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = rgb & 0xff;
        return r < 16 && g < 16 && b < 16 ? 0 : 255;
    }

    private static textureDiagnostics(limit: number = 12): HDTextureDiagnostics {
        const topTextures = this.textureUseCounts
            .map((count, id) => ({ id, count }))
            .filter(entry => entry.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, limit)
            .map(({ id, count }) => {
                const texture = Pix3D.textures[id];
                const material = this.materialForTexture(id);
                const serverName = SERVER_TEXTURE_NAMES[id] ?? `texture_${id}`;
                const osrsName = OSRS_TEXTURE_NAMES[id] ?? `TEXTURE_${id}`;
                return {
                    id,
                    name: `${serverName} / ${osrsName}`,
                    serverName,
                    osrsName,
                    count,
                    loaded: texture !== null && texture !== undefined,
                    hasPalette: Pix3D.texPal[id] !== null && Pix3D.texPal[id] !== undefined,
                    width: texture?.wi ?? 0,
                    height: texture?.hi ?? 0,
                    material: this.materialName(material),
                    transparent: SERVER_TRANSPARENT_TEXTURE_IDS.has(id)
                };
            });

        const textureIdMap = Array.from({ length: CACHE_TEXTURE_COUNT }, (_, id) => {
            const material = this.materialForTexture(id);
            return {
                id,
                serverName: SERVER_TEXTURE_NAMES[id] ?? `texture_${id}`,
                osrsName: OSRS_TEXTURE_NAMES[id] ?? `TEXTURE_${id}`,
                material: this.materialName(material),
                transparent: SERVER_TRANSPARENT_TEXTURE_IDS.has(id)
            };
        });

        return {
            mode: this.textureDebugModeName(),
            atlasReady: this.textureAtlasReady,
            atlasLoadedCount: this.textureAtlasLoadedCount,
            untexturedTriangleCount: this.untexturedTriangleCount,
            invalidTextureCount: this.invalidTextureCount,
            textureIdMap,
            topTextures
        };
    }

    private static showTextureAtlasPreview(): string | null {
        if (typeof document === 'undefined') {
            return null;
        }

        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = ATLAS_COLS * TEXTURE_SIZE;
        canvas.height = ATLAS_ROWS * TEXTURE_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }

        const image = ctx.createImageData(canvas.width, canvas.height);
        for (let id = 0; id < CACHE_TEXTURE_COUNT; id++) {
            const texture = Pix3D.textures[id];
            const palette = Pix3D.texPal[id] ?? texture?.bpal ?? null;
            if (!texture || !palette) {
                continue;
            }

            const col = id % ATLAS_COLS;
            const row = (id / ATLAS_COLS) | 0;
            const hasTransparency = SERVER_TRANSPARENT_TEXTURE_IDS.has(id);

            for (let y = 0; y < TEXTURE_SIZE; y++) {
                const srcY = Math.min(texture.hi - 1, Math.floor((y * texture.hi) / TEXTURE_SIZE));
                for (let x = 0; x < TEXTURE_SIZE; x++) {
                    const srcX = Math.min(texture.wi - 1, Math.floor((x * texture.wi) / TEXTURE_SIZE));
                    const paletteIndex = texture.data[srcX + srcY * texture.wi] & 0xff;
                    const rgb = (palette[paletteIndex] ?? 0) & 0xf8f8ff;
                    const off = ((col * TEXTURE_SIZE + x) + (row * TEXTURE_SIZE + y) * canvas.width) * 4;
                    image.data[off] = (rgb >> 16) & 0xff;
                    image.data[off + 1] = (rgb >> 8) & 0xff;
                    image.data[off + 2] = rgb & 0xff;
                    image.data[off + 3] = this.keyedTextureAlpha(rgb, hasTransparency);
                }
            }
        }
        ctx.putImageData(image, 0, 0);

        let preview = document.getElementById('hd-texture-atlas-preview') as HTMLDivElement | null;
        if (!preview) {
            preview = document.createElement('div');
            preview.id = 'hd-texture-atlas-preview';
            preview.style.position = 'fixed';
            preview.style.right = '8px';
            preview.style.bottom = '8px';
            preview.style.zIndex = '999999';
            preview.style.background = 'rgba(0, 0, 0, 0.82)';
            preview.style.border = '1px solid #ffff00';
            preview.style.padding = '6px';
            preview.style.color = '#ffff00';
            preview.style.font = '12px monospace';
            document.body.appendChild(preview);
        }

        preview.textContent = '';
        const label = document.createElement('div');
        label.textContent = `HD texture atlas: ${this.textureAtlasLoadedCount}/${CACHE_TEXTURE_COUNT} loaded`;
        const view = canvas.cloneNode(false) as HTMLCanvasElement;
        view.width = canvas.width;
        view.height = canvas.height;
        view.style.width = `${canvas.width / scale}px`;
        view.style.height = `${canvas.height / scale}px`;
        view.style.imageRendering = 'pixelated';
        view.getContext('2d')?.drawImage(canvas, 0, 0);
        preview.appendChild(label);
        preview.appendChild(view);

        return canvas.toDataURL('image/png');
    }

    private static showTextureDiagnosticsOverlay(): void {
        if (typeof document === 'undefined') {
            return;
        }

        if (!this.diagnosticsOverlay) {
            const overlay = document.createElement('pre');
            overlay.id = 'hd-texture-diagnostics-overlay';
            overlay.style.position = 'fixed';
            overlay.style.left = '8px';
            overlay.style.bottom = '8px';
            overlay.style.zIndex = '999999';
            overlay.style.maxWidth = '760px';
            overlay.style.maxHeight = '70vh';
            overlay.style.overflow = 'auto';
            overlay.style.pointerEvents = 'auto';
            overlay.style.whiteSpace = 'pre-wrap';
            overlay.style.padding = '8px 10px';
            overlay.style.margin = '0';
            overlay.style.background = 'rgba(0, 0, 0, 0.88)';
            overlay.style.color = '#ffff00';
            overlay.style.font = '12px Consolas, monospace';
            overlay.style.border = '1px solid rgba(255, 255, 0, 0.8)';
            document.body.appendChild(overlay);
            this.diagnosticsOverlay = overlay;
        }

        const diagnostics = this.textureDiagnostics(20);
        this.diagnosticsOverlay.textContent = [
            'HD texture diagnostics',
            'F10 refresh, click this box to hide, F11 atlas preview',
            '',
            JSON.stringify(diagnostics, null, 2)
        ].join('\n');
        this.diagnosticsOverlay.style.display = 'block';
        this.diagnosticsOverlay.onclick = () => {
            if (this.diagnosticsOverlay) {
                this.diagnosticsOverlay.style.display = 'none';
            }
        };
    }

    private static publishStatus(): void {
        if (typeof window === 'undefined') {
            return;
        }

        const target = window as unknown as {
            HD_RENDERER_STATUS?: HDRendererStatus;
            HD_TEXTURE_DIAGNOSTICS?: () => HDTextureDiagnostics;
            HD_TEXTURE_ATLAS_PREVIEW?: () => string | null;
        };
        target.HD_RENDERER_STATUS = this.status(false);
        target.HD_TEXTURE_DIAGNOSTICS = () => this.textureDiagnostics();
        target.HD_TEXTURE_ATLAS_PREVIEW = () => this.showTextureAtlasPreview();
    }

    private static initShadowMap(): void {
        const gl = this.gl;
        if (!gl || this.shadowFbo) {
            return;
        }

        const program = this.createProgram(gl, shadowShader);
        if (!program) {
            return;
        }
        this.shadowProgram = program;
        this.shadowUniformMatrix = gl.getUniformLocation(program, 'u_lightSpaceMatrix');

        const size = SHADOW_MAP_SIZE;
        this.shadowDepthTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, size, size, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);

        this.shadowFbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowDepthTexture, 0);
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    private static initNormalAtlas(gl: WebGL2RenderingContext): void {
        if (this.normalAtlas) {
            return;
        }

        // Fill the entire atlas with a flat tangent-space normal: (0.5, 0.5, 1.0) → rgb (128,128,255).
        // A flat normal produces TBN * (0,0,1) = geometric normal, so surface lighting is unchanged
        // until real normal map images are asynchronously uploaded into their slots.
        const width = ATLAS_COLS * TEXTURE_SIZE;
        const height = ATLAS_ROWS * TEXTURE_SIZE;
        const data = new Uint8Array(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            data[i * 4 + 0] = 128;
            data[i * 4 + 1] = 128;
            data[i * 4 + 2] = 255;
            data[i * 4 + 3] = 255;
        }

        const texture = gl.createTexture();
        if (!texture) {
            return;
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        this.normalAtlas = texture;

        this.startNormalAtlasLoads();
    }

    private static startNormalAtlasLoads(): void {
        const loads: [number, string][] = [];

        for (let id = 0; id < NORMAL_MAP_FOR_TEXTURE.length; id++) {
            const file = NORMAL_MAP_FOR_TEXTURE[id];
            if (file) {
                loads.push([id, file]);
            }
        }

        for (let m = 0; m < NORMAL_MAP_FOR_MATERIAL.length; m++) {
            const file = NORMAL_MAP_FOR_MATERIAL[m];
            if (file) {
                loads.push([NORMAL_ATLAS_MATERIAL_SLOT_OFFSET + m, file]);
            }
        }

        for (const [slot, file] of loads) {
            fetch(`/hd/textures/${file}`)
                .then(r => r.ok ? r.blob() : Promise.reject(`${r.status} /hd/textures/${file}`))
                .then(blob => createImageBitmap(blob))
                .then(bitmap => {
                    const tmp = new OffscreenCanvas(TEXTURE_SIZE, TEXTURE_SIZE);
                    const ctx = tmp.getContext('2d')!;
                    ctx.drawImage(bitmap, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
                    bitmap.close();
                    const imageData = ctx.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
                    this.normalAtlasPendingImages.push({ slot, data: imageData.data });
                })
                .catch(() => {
                    // Missing file — slot stays flat, no normal perturbation for this texture
                });
        }
    }

    private static renderShadowPass(): void {
        const gl = this.gl;
        if (!gl || !this.shadowProgram || !this.shadowFbo || this.terrainVertexCount === 0 || !this.terrainVao) {
            return;
        }

        const size = SHADOW_MAP_SIZE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
        gl.viewport(0, 0, size, size);
        gl.disable(gl.SCISSOR_TEST);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.colorMask(false, false, false, false);

        gl.useProgram(this.shadowProgram);
        gl.uniformMatrix4fv(this.shadowUniformMatrix, false, this.lightSpaceMatrix);
        this.drawBuffer(this.terrainVao, this.terrainVertexCount);

        for (const [texture, vertices] of this.modelBatches) {
            if (vertices.length === 0) {
                continue;
            }
            const vao = this.modelVaos.get(texture);
            if (vao) {
                this.drawBuffer(vao, vertices.length / VERTEX_FLOATS);
            }
        }

        gl.colorMask(true, true, true, true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    private static buildLightSpaceMatrix(camera: HDCameraInput): void {
        // u_sunDirection = (-0.45, 0.8, -0.35) is the light-ray direction (sun → scene).
        // In OSRS, -Y is up. The sun is above the scene at +X, -Y, +Z from the camera.
        // sunDir (from surface toward sun) = (0.45, -0.8, 0.35). lightEye = camera + sunDir * dist.
        const rx = 0.45, ry = 0.8, rz = 0.35;
        const len = Math.hypot(rx, ry, rz);
        const dist = 5000;
        const lightEye: [number, number, number] = [
            camera.eyeX + (rx / len) * dist,
            camera.eyeY - (ry / len) * dist,
            camera.eyeZ + (rz / len) * dist
        ];
        const center: [number, number, number] = [camera.eyeX, camera.eyeY, camera.eyeZ];
        const up: [number, number, number] = [0, 0, 1];

        const view = this.mat4LookAt(lightEye, center, up);
        const half = 6000;
        const ortho = this.mat4Ortho(-half, half, -half, half, 1, 14000);
        this.lightSpaceMatrix.set(this.mat4Multiply(ortho, view));
    }

    private static mat4LookAt(
        eye: [number, number, number],
        center: [number, number, number],
        up: [number, number, number]
    ): Float32Array {
        const fx = center[0] - eye[0], fy = center[1] - eye[1], fz = center[2] - eye[2];
        const flen = Math.hypot(fx, fy, fz) || 1;
        const f = [fx / flen, fy / flen, fz / flen];

        const rx = f[1] * up[2] - f[2] * up[1];
        const ry = f[2] * up[0] - f[0] * up[2];
        const rz = f[0] * up[1] - f[1] * up[0];
        const rlen = Math.hypot(rx, ry, rz) || 1;
        const r = [rx / rlen, ry / rlen, rz / rlen];

        const u = [
            r[1] * f[2] - r[2] * f[1],
            r[2] * f[0] - r[0] * f[2],
            r[0] * f[1] - r[1] * f[0]
        ];

        const m = new Float32Array(16);
        m[0] = r[0];  m[4] = r[1];  m[8]  = r[2];  m[12] = -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]);
        m[1] = u[0];  m[5] = u[1];  m[9]  = u[2];  m[13] = -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]);
        m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2]; m[14] =   f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2];
        m[3] = 0;     m[7] = 0;     m[11] = 0;     m[15] = 1;
        return m;
    }

    private static mat4Ortho(l: number, r: number, b: number, t: number, n: number, f: number): Float32Array {
        const m = new Float32Array(16);
        m[0]  = 2 / (r - l);
        m[5]  = 2 / (t - b);
        m[10] = -2 / (f - n);
        m[12] = -(r + l) / (r - l);
        m[13] = -(t + b) / (t - b);
        m[14] = -(f + n) / (f - n);
        m[15] = 1;
        return m;
    }

    private static mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
        const m = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) {
                    sum += a[k * 4 + i] * b[j * 4 + k];
                }
                m[j * 4 + i] = sum;
            }
        }
        return m;
    }

    private static init(): void {
        this.installTextureDebugHotkeys();
        if (this.gl && this.terrainProgram) {
            return;
        }

        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2', {
            alpha: true,
            antialias: true,
            depth: true,
            powerPreference: 'high-performance',
            premultipliedAlpha: false,
            preserveDrawingBuffer: true
        });

        if (!gl) {
            this.reason = 'WebGL2 is not available';
            return;
        }

        const program = this.createProgram(gl, terrainShader);
        if (!program) {
            this.reason = 'HD terrain shader failed to compile';
            return;
        }

        this.canvas = canvas;
        this.gl = gl;
        this.terrainProgram = program;
        this.cacheUniforms();
        this.initShadowMap();
        this.initNormalAtlas(gl);
        this.reason = 'ready';
    }

    private static cacheUniforms(): void {
        if (!this.gl || !this.terrainProgram) {
            return;
        }

        const gl = this.gl;
        const p = this.terrainProgram;
        this.uniformCache.clear();

        for (const name of [
            'u_cameraPosition', 'u_projectionScale', 'u_sinEyePitch', 'u_cosEyePitch',
            'u_sinEyeYaw', 'u_cosEyeYaw', 'u_nearPlane', 'u_farPlane',
            'u_sunDirection', 'u_skyColour', 'u_ambient', 'u_diffuseStrength',
            'u_fogStart', 'u_fogDistance', 'u_time', 'u_textureAtlas',
            'u_textureDebugMode', 'u_cacheTextureCount',
            'u_lightSpaceMatrix', 'u_shadowMap', 'u_shadowStrength', 'u_normalAtlas'
        ]) {
            this.uniformCache.set(name, gl.getUniformLocation(p, name));
        }

        this.atlasRectLocations = [];
        for (let i = 0; i < ATLAS_SIZE; i++) {
            this.atlasRectLocations[i] = gl.getUniformLocation(p, `u_atlasRects[${i}]`);
        }
    }

    private static setSoftwareCanvasHidden(_hidden: boolean): void {
        const gameCanvas = document.getElementById('canvas') as HTMLCanvasElement | null;
        if (!gameCanvas) {
            return;
        }

        // Reverted WebGL UI presentation: the original 254/Pix2D canvas must stay
        // visible because it owns chat, menus, click crosses, fonts, sprites, etc.
        gameCanvas.style.opacity = '';
        gameCanvas.style.pointerEvents = '';
    }

    private static attachCanvas(): void {
        // Reverted WebGL UI presentation: keep the WebGL canvas off-DOM so it
        // cannot cover the software Pix2D UI. renderFrame() composites only the
        // 3D viewport into #canvas, then the normal client can draw UI on top.
        if (!this.canvas) {
            return;
        }

        this.canvas.id = 'hd-canvas';
        this.canvas.setAttribute('aria-hidden', 'true');
        if (this.canvas.isConnected) {
            this.canvas.remove();
        }
    }

    private static resizeCanvasToCss(): void {
        const gameCanvas = document.getElementById('canvas') as HTMLCanvasElement | null;
        if (!this.canvas || !gameCanvas) {
            return;
        }

        const rect = gameCanvas.getBoundingClientRect();
        const scale = Math.min(window.devicePixelRatio || 1, 2.5);
        const width = Math.max(1, Math.round(rect.width * scale));
        const height = Math.max(1, Math.round(rect.height * scale));

        if (this.canvas.width !== width) {
            this.canvas.width = width;
        }
        if (this.canvas.height !== height) {
            this.canvas.height = height;
        }

        this.setSoftwareCanvasHidden(false);
    }

    private static viewportRect(canvas: HTMLCanvasElement): { x: number; y: number; width: number; height: number } {
        const x = Math.round((VIEWPORT_X / 765) * canvas.width);
        const width = Math.round((VIEWPORT_WIDTH / 765) * canvas.width);
        const height = Math.round((VIEWPORT_HEIGHT / 503) * canvas.height);
        const top = Math.round((VIEWPORT_Y / 503) * canvas.height);
        return {
            x,
            y: canvas.height - top - height,
            width,
            height
        };
    }

    private static setCameraUniforms(_viewportWidth: number, _viewportHeight: number): void {
        if (!this.gl || !this.camera) {
            return;
        }

        const gl = this.gl;
        const u = (name: string): WebGLUniformLocation | null => this.uniformCache.get(name) ?? null;
        const focalLength = 512;

        gl.uniform3f(u('u_cameraPosition'), this.camera.eyeX, this.camera.eyeY, this.camera.eyeZ);
        gl.uniform2f(u('u_projectionScale'), (2 * focalLength) / VIEWPORT_WIDTH, (2 * focalLength) / VIEWPORT_HEIGHT);
        gl.uniform1f(u('u_sinEyePitch'), this.camera.sinEyePitch / 65536);
        gl.uniform1f(u('u_cosEyePitch'), this.camera.cosEyePitch / 65536);
        gl.uniform1f(u('u_sinEyeYaw'), this.camera.sinEyeYaw / 65536);
        gl.uniform1f(u('u_cosEyeYaw'), this.camera.cosEyeYaw / 65536);
        gl.uniform1f(u('u_nearPlane'), 50);
        gl.uniform1f(u('u_farPlane'), HD_FAR_PLANE);
        gl.uniform3f(u('u_sunDirection'), -0.45, 0.8, -0.35);
        gl.uniform3f(u('u_skyColour'), HD_SKY_COLOUR[0], HD_SKY_COLOUR[1], HD_SKY_COLOUR[2]);
        // Brighter default lighting for the 2004 scene. Shadows are disabled by
        // default, so the base scene should not look like a permanent night filter.
        const hdAmbient = Number.isFinite(Number((globalThis as any).HD_AMBIENT)) ? Number((globalThis as any).HD_AMBIENT) : 0.78;
        const hdDiffuse = Number.isFinite(Number((globalThis as any).HD_DIFFUSE)) ? Number((globalThis as any).HD_DIFFUSE) : 0.48;
        const hdFogStart = Number.isFinite(Number((globalThis as any).HD_FOG_START)) ? Number((globalThis as any).HD_FOG_START) : HD_FOG_START;
        const hdFogEnd = Number.isFinite(Number((globalThis as any).HD_FOG_END)) ? Number((globalThis as any).HD_FOG_END) : HD_FOG_END;
        gl.uniform1f(u('u_ambient'), hdAmbient);
        gl.uniform1f(u('u_diffuseStrength'), hdDiffuse);
        gl.uniform1f(u('u_fogStart'), hdFogStart);
        gl.uniform1f(u('u_fogDistance'), hdFogEnd);
        gl.uniform1f(u('u_time'), performance.now() / 1000);
        gl.uniform1i(u('u_textureDebugMode'), this.textureDebugMode());
        gl.uniform1i(u('u_cacheTextureCount'), CACHE_TEXTURE_COUNT);

        gl.uniformMatrix4fv(u('u_lightSpaceMatrix'), false, this.lightSpaceMatrix);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTexture ?? this.textureAtlas);
        gl.uniform1i(u('u_shadowMap'), 2);
        gl.uniform1f(u('u_shadowStrength'), ((globalThis as any).ENABLE_HD_SHADOWS === true && this.shadowFbo) ? 0.55 : 0.0);
    }

    private static setupVao(buffer: WebGLBuffer): WebGLVertexArrayObject | null {
        if (!this.gl) {
            return null;
        }

        const gl = this.gl;
        const vao = gl.createVertexArray();
        if (!vao) {
            return null;
        }

        const stride = VERTEX_FLOATS * 4;
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(0);
        gl.enableVertexAttribArray(1);
        gl.enableVertexAttribArray(2);
        gl.enableVertexAttribArray(3);
        gl.enableVertexAttribArray(4);
        gl.enableVertexAttribArray(5);
        gl.enableVertexAttribArray(6);
        gl.enableVertexAttribArray(7);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 6 * 4);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 9 * 4);
        gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 10 * 4);
        gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 12 * 4);
        gl.vertexAttribPointer(6, 1, gl.FLOAT, false, stride, 13 * 4);
        gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 14 * 4);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        return vao;
    }

    private static drawBuffer(vao: WebGLVertexArrayObject, vertexCount: number): void {
        if (!this.gl) {
            return;
        }

        const gl = this.gl;
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
        gl.bindVertexArray(null);
    }

    private static compositeViewportToGameCanvas(viewport: { x: number; y: number; width: number; height: number }): void {
        if (!this.gl || !this.canvas || viewport.width <= 0 || viewport.height <= 0) {
            return;
        }

        const gameCanvas = document.getElementById('canvas') as HTMLCanvasElement | null;
        const gameCtx = gameCanvas?.getContext('2d');
        if (!gameCanvas || !gameCtx) {
            return;
        }

        // Convert viewport from OpenGL coords (Y from bottom) to canvas image coords (Y from top).
        const srcX = viewport.x;
        const srcY = this.canvas.height - viewport.y - viewport.height;
        gameCtx.drawImage(this.canvas, srcX, srcY, viewport.width, viewport.height, VIEWPORT_X, VIEWPORT_Y, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    }

    private static uploadModelBuffers(): void {
        const gl = this.gl;
        this.modelUsedKeys.clear();
        if (!gl) {
            return;
        }

        for (const [texture, vertices] of this.modelBatches) {
            if (vertices.length === 0) {
                continue;
            }

            this.modelUsedKeys.add(texture);

            let buffer = this.modelBuffers.get(texture);
            if (!buffer) {
                buffer = gl.createBuffer();
                if (!buffer) {
                    continue;
                }
                this.modelBuffers.set(texture, buffer);
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            // Use pre-allocated upload buffer (grow by doubling if needed, avoids per-flush allocation).
            const n = vertices.length;
            if (n > this._uploadBuf.length) {
                this._uploadBuf = new Float32Array(n * 2);
            }
            this._uploadBuf.set(vertices, 0);
            gl.bufferData(gl.ARRAY_BUFFER, this._uploadBuf.subarray(0, n), gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);

            if (!this.modelVaos.has(texture)) {
                const vao = this.setupVao(buffer);
                if (vao) {
                    this.modelVaos.set(texture, vao);
                }
            }
        }
    }

    private static uploadStaticFarModelBuffers(): void {
        const gl = this.gl;
        if (!gl || !this.staticFarGpuDirty) {
            return;
        }

        const liveKeys = new Set<number>();
        for (const [texture, vertices] of this.staticFarModelBatches) {
            if (vertices.length === 0) {
                continue;
            }
            liveKeys.add(texture);

            let buffer = this.staticFarModelBuffers.get(texture);
            if (!buffer) {
                buffer = gl.createBuffer();
                if (!buffer) {
                    continue;
                }
                this.staticFarModelBuffers.set(texture, buffer);
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            const n = vertices.length;
            if (n > this._uploadBuf.length) {
                this._uploadBuf = new Float32Array(n * 2);
            }
            this._uploadBuf.set(vertices, 0);
            gl.bufferData(gl.ARRAY_BUFFER, this._uploadBuf.subarray(0, n), gl.STATIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);

            if (!this.staticFarModelVaos.has(texture)) {
                const vao = this.setupVao(buffer);
                if (vao) {
                    this.staticFarModelVaos.set(texture, vao);
                }
            }
        }

        for (const [texture, vao] of this.staticFarModelVaos) {
            if (!liveKeys.has(texture)) {
                if (vao) {
                    gl.deleteVertexArray(vao);
                }
                this.staticFarModelVaos.delete(texture);
            }
        }
        for (const [texture, buffer] of this.staticFarModelBuffers) {
            if (!liveKeys.has(texture)) {
                if (buffer) {
                    gl.deleteBuffer(buffer);
                }
                this.staticFarModelBuffers.delete(texture);
            }
        }

        this.staticFarGpuDirty = false;
    }

    private static drawStaticFarModels(): void {
        const gl = this.gl;
        if (!gl) {
            return;
        }

        for (const [texture, vertices] of this.staticFarModelBatches) {
            if (vertices.length === 0) {
                continue;
            }
            const vao = this.staticFarModelVaos.get(texture);
            if (vao) {
                this.drawBuffer(vao, vertices.length / VERTEX_FLOATS);
            }
        }

        // Static far-scene foliage, nets, rails and some scenery use transparent
        // faces. These are cached with the static scene too, so draw them here;
        // otherwise they only appear from the old per-frame/software-visible path
        // and flicker on/off when the camera rotates.
        if (this.staticFarTransparentBatches.length > 0) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            this.staticFarTransparentBatches.sort((a, b) => {
                const ap = this.prioritySortGroup(a.priority);
                const bp = this.prioritySortGroup(b.priority);
                if (ap !== bp) {
                    return ap - bp;
                }
                return b.depth - a.depth;
            });

            for (const batch of this.staticFarTransparentBatches) {
                if (batch.vertices.length === 0) {
                    continue;
                }

                // Use dedicated far-scene transparent buffers so dynamic models
                // (uploadAndDrawModels) cannot overwrite the same GPU buffer for
                // the same texture key, which would cause fences/foliage to flicker.
                let buffer = this.staticFarTransparentBuffers.get(batch.texture);
                if (!buffer) {
                    buffer = gl.createBuffer();
                    if (!buffer) {
                        continue;
                    }
                    this.staticFarTransparentBuffers.set(batch.texture, buffer);
                }

                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                if (batch.vertices.length > this._uploadBuf.length) {
                    this._uploadBuf = new Float32Array(batch.vertices.length * 2);
                }
                this._uploadBuf.set(batch.vertices, 0);
                gl.bufferData(gl.ARRAY_BUFFER, this._uploadBuf.subarray(0, batch.vertices.length), gl.DYNAMIC_DRAW);
                gl.bindBuffer(gl.ARRAY_BUFFER, null);

                let vao = this.staticFarTransparentVaos.get(batch.texture);
                if (!vao) {
                    const created = this.setupVao(buffer);
                    if (!created) {
                        continue;
                    }
                    vao = created;
                    this.staticFarTransparentVaos.set(batch.texture, vao);
                }

                this.drawBuffer(vao, batch.vertices.length / VERTEX_FLOATS);
            }

            gl.depthMask(true);
            gl.disable(gl.BLEND);
        }
    }

    private static uploadAndDrawModels(): void {
        const gl = this.gl;
        if (!gl || (this.modelBatches.size === 0 && this.transparentBatches.length === 0)) {
            this.pruneModelGpuObjects(gl, new Set());
            return;
        }

        // Opaque models: buffers already uploaded by uploadModelBuffers() — just draw.
        for (const [texture, vertices] of this.modelBatches) {
            if (vertices.length === 0) {
                continue;
            }
            const vao = this.modelVaos.get(texture);
            if (vao) {
                this.drawBuffer(vao, vertices.length / VERTEX_FLOATS);
            }
        }

        // Transparent models: upload and draw each batch inline (depth-sorted, per-batch buffer).
        if (this.transparentBatches.length > 0) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            this.transparentBatches.sort((a, b) => {
                const ap = this.prioritySortGroup(a.priority);
                const bp = this.prioritySortGroup(b.priority);
                if (ap !== bp) {
                    return ap - bp;
                }
                return b.depth - a.depth;
            });

            for (const batch of this.transparentBatches) {
                if (batch.vertices.length === 0) {
                    continue;
                }

                this.modelUsedKeys.add(batch.texture);

                let buffer = this.modelBuffers.get(batch.texture);
                if (!buffer) {
                    buffer = gl.createBuffer();
                    if (!buffer) {
                        continue;
                    }
                    this.modelBuffers.set(batch.texture, buffer);
                }

                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batch.vertices), gl.DYNAMIC_DRAW);
                gl.bindBuffer(gl.ARRAY_BUFFER, null);

                let vao = this.modelVaos.get(batch.texture);
                if (!vao) {
                    const created = this.setupVao(buffer);
                    if (!created) {
                        continue;
                    }
                    vao = created;
                    this.modelVaos.set(batch.texture, vao);
                }

                this.drawBuffer(vao, batch.vertices.length / VERTEX_FLOATS);
            }

            gl.depthMask(true);
            gl.disable(gl.BLEND);
        }

        this.pruneModelGpuObjects(gl, this.modelUsedKeys);
    }

    private static pruneModelGpuObjects(gl: WebGL2RenderingContext | null, activeKeys: Set<number>): void {
        if (!gl) {
            return;
        }
        for (const [key, buffer] of this.modelBuffers) {
            if (!activeKeys.has(key)) {
                gl.deleteBuffer(buffer);
                this.modelBuffers.delete(key);
                const vao = this.modelVaos.get(key);
                if (vao) {
                    gl.deleteVertexArray(vao);
                    this.modelVaos.delete(key);
                }
            }
        }
    }

    private static ensureTextureAtlas(): void {
        if (!this.gl || this.textureAtlasReady) {
            return;
        }

        const gl = this.gl;
        const width = ATLAS_COLS * TEXTURE_SIZE;
        const height = ATLAS_ROWS * TEXTURE_SIZE;
        const atlas = new Uint8Array(width * height * 4);
        this.textureRects = [];
        let loadedCount = 0;

        for (let id = 0; id < ATLAS_SIZE; id++) {
            const texture = id < CACHE_TEXTURE_COUNT ? Pix3D.textures[id] : null;
            const palette = Pix3D.texPal[id] ?? texture?.bpal ?? null;
            const col = id % ATLAS_COLS;
            const row = (id / ATLAS_COLS) | 0;
            const rect: TextureAtlasRect = {
                u0: (col * TEXTURE_SIZE + 0.5) / width,
                v0: (row * TEXTURE_SIZE + 0.5) / height,
                u1: ((col + 1) * TEXTURE_SIZE - 0.5) / width,
                v1: ((row + 1) * TEXTURE_SIZE - 0.5) / height
            };
            this.textureRects[id] = rect;

            if (!texture || !palette) {
                continue;
            }

            loadedCount++;
            const hasTransparency = SERVER_TRANSPARENT_TEXTURE_IDS.has(id);
            for (let y = 0; y < TEXTURE_SIZE; y++) {
                const srcY = Math.min(texture.hi - 1, Math.floor((y * texture.hi) / TEXTURE_SIZE));
                for (let x = 0; x < TEXTURE_SIZE; x++) {
                    const srcX = Math.min(texture.wi - 1, Math.floor((x * texture.wi) / TEXTURE_SIZE));
                    const paletteIndex = texture.data[srcX + srcY * texture.wi] & 0xff;
                    const rgb = (palette[paletteIndex] ?? 0) & 0xf8f8ff;
                    const off = ((col * TEXTURE_SIZE + x) + (row * TEXTURE_SIZE + y) * width) * 4;
                    atlas[off] = (rgb >> 16) & 0xff;
                    atlas[off + 1] = (rgb >> 8) & 0xff;
                    atlas[off + 2] = rgb & 0xff;
                    atlas[off + 3] = this.keyedTextureAlpha(rgb, hasTransparency);
                }
            }
        }

        this.textureAtlas = gl.createTexture();
        if (!this.textureAtlas) {
            return;
        }

        gl.bindTexture(gl.TEXTURE_2D, this.textureAtlas);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.bindTexture(gl.TEXTURE_2D, null);

        // Don't mark ready if no textures were loaded — retry next frame when they arrive
        if (loadedCount > 0) {
            this.textureAtlasReady = true;
        }
        this.textureAtlasLoadedCount = loadedCount;
    }

    private static bindTextureAtlas(): void {
        if (!this.gl || !this.textureAtlas) {
            return;
        }

        const gl = this.gl;

        // Upload any normal map images that finished loading since the last frame.
        if (this.normalAtlas && this.normalAtlasPendingImages.length > 0) {
            gl.bindTexture(gl.TEXTURE_2D, this.normalAtlas);
            for (const { slot, data } of this.normalAtlasPendingImages) {
                const col = slot % ATLAS_COLS;
                const row = (slot / ATLAS_COLS) | 0;
                gl.texSubImage2D(
                    gl.TEXTURE_2D, 0,
                    col * TEXTURE_SIZE, row * TEXTURE_SIZE,
                    TEXTURE_SIZE, TEXTURE_SIZE,
                    gl.RGBA, gl.UNSIGNED_BYTE, data
                );
            }
            this.normalAtlasPendingImages.length = 0;
            gl.bindTexture(gl.TEXTURE_2D, null);
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.textureAtlas);
        gl.uniform1i(this.uniformCache.get('u_textureAtlas') ?? null, 0);

        if (this.normalAtlas) {
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, this.normalAtlas);
            gl.uniform1i(this.uniformCache.get('u_normalAtlas') ?? null, 3);
        }

        for (let id = 0; id < ATLAS_SIZE; id++) {
            const rect = this.textureRects[id] ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
            gl.uniform4f(this.atlasRectLocations[id] ?? null, rect.u0, rect.v0, rect.u1, rect.v1);
        }
    }

    private static ensureUiRenderer(): void {
        if (!this.gl) {
            return;
        }
        if (this.uiProgram && this.uiVao && this.uiBuffer && this.uiTexture) {
            return;
        }

        const gl = this.gl;
        const program = this.createProgram(gl, uiShader);
        if (!program) {
            this.reason = 'HD UI shader failed to compile';
            return;
        }

        const buffer = gl.createBuffer();
        const vao = gl.createVertexArray();
        const texture = gl.createTexture();
        if (!buffer || !vao || !texture) {
            this.reason = 'HD UI resource allocation failed';
            return;
        }

        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
        gl.bindVertexArray(null);

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);

        this.uiProgram = program;
        this.uiBuffer = buffer;
        this.uiVao = vao;
        this.uiTexture = texture;
        this.uiUniformCanvasSize = gl.getUniformLocation(program, 'u_canvasSize');
        this.uiUniformTexture = gl.getUniformLocation(program, 'u_uiTexture');
        this.uiUniformKeyed = gl.getUniformLocation(program, 'u_keyed');
    }

    private static fixedSin(angle: number): number {
        return Math.round(Math.sin((angle & 0x7ff) * Math.PI / 1024) * 65536);
    }

    private static fixedCos(angle: number): number {
        return Math.round(Math.cos((angle & 0x7ff) * Math.PI / 1024) * 65536);
    }

    private static groundKey(level: number, x: number, z: number): string {
        return `${level}:${x}:${z}`;
    }

    private static createProgram(gl: WebGL2RenderingContext, source: ShaderSource): WebGLProgram | null {
        const vertex = this.compileShader(gl, gl.VERTEX_SHADER, source.vertex);
        const fragment = this.compileShader(gl, gl.FRAGMENT_SHADER, source.fragment);

        if (!vertex || !fragment) {
            return null;
        }

        const program = gl.createProgram();
        if (!program) {
            return null;
        }

        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            this.reason = gl.getProgramInfoLog(program) || 'program link failed';
            gl.deleteProgram(program);
            return null;
        }

        return program;
    }

    private static compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
        const shader = gl.createShader(type);
        if (!shader) {
            return null;
        }

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            this.reason = gl.getShaderInfoLog(shader) || 'shader compile failed';
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }
}
