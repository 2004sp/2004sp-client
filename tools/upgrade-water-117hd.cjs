#!/usr/bin/env node
/*
  Patches src/hd/HDRenderer.ts to use RLHD-style water map textures:
  - /hd/textures/water_normal.png
  - /hd/textures/water_flow.png
  - /hd/textures/water_foam.png

  Run from the repo root:
    node tools/upgrade-water-117hd.cjs
*/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = process.cwd();
const rendererPath = path.join(root, 'src', 'hd', 'HDRenderer.ts');
if (!fs.existsSync(rendererPath)) {
  console.error('Could not find src/hd/HDRenderer.ts. Run this from the repo root.');
  process.exit(1);
}

let src = fs.readFileSync(rendererPath, 'utf8');
if (src.includes('u_waterNormalMap') && src.includes('waterMapTexture')) {
  console.log('HDRenderer.ts already appears to have the mapped water upgrade.');
} else {
  src = src.replace(
    `uniform sampler2D u_normalAtlas;\nuniform float u_waterTextureDiffuse;`,
    `uniform sampler2D u_normalAtlas;\nuniform float u_waterTextureDiffuse;\nuniform sampler2D u_waterNormalMap;\nuniform sampler2D u_waterFlowMap;\nuniform sampler2D u_waterFoamMap;\nuniform float u_waterMapsReady;`
  );

  src = src.replace(
    `vec3 untexturedTerrainDetail(vec3 colour, float material) {`,
    `vec2 waterWorldUvs(float scale) {\n    return -v_worldPos.xz / (128.0 * scale);\n}\n\nvec3 waterMapNormal(vec2 uv) {\n    vec3 packed = texture(u_waterNormalMap, fract(uv)).rgb * 2.0 - 1.0;\n    return normalize(vec3(packed.x, 0.0, packed.y));\n}\n\nvec2 waterFlowMap(vec2 uv) {\n    vec2 flow = texture(u_waterFlowMap, fract(uv)).rg * 2.0 - 1.0;\n    return flow * 0.055;\n}\n\nfloat waterFoamMap(vec2 uv) {\n    return texture(u_waterFoamMap, fract(uv)).r;\n}\n\nvec3 untexturedTerrainDetail(vec3 colour, float material) {`
  );

  const waterBlockRe = /    } else if \(material == 1\.0\) \{\n        \/\/ Water: ported from RLHD[\s\S]*?\n    } else if \(material == 2\.0\) \{/;
  const waterBlock = `    } else if (material == 1.0) {\n        // Water: RLHD-style mapped water.  Uses world-space UVs, flow map,\n        // dual normal samples, foam mask, Fresnel, specular sparkle and seabed tint.\n        // If the three PNGs are missing, it falls back to the old procedural noise.\n        float t = u_time;\n        float mapsReady = step(0.5, u_waterMapsReady);\n\n        vec2 wuv3  = waterWorldUvs(3.0);\n        vec2 wuv15 = waterWorldUvs(15.0);\n\n        vec2 proceduralFlow = vec2(\n            noise2(wuv15 * 4.0 + vec2(t * 0.0020,  0.0)),\n            noise2(wuv15 * 4.0 + vec2(0.0, -t * 0.0015))\n        ) * 0.025;\n        vec2 mappedFlow = waterFlowMap(wuv15 + vec2(t * 0.006, -t * 0.004));\n        vec2 flowOff = mix(proceduralFlow, mappedFlow, mapsReady);\n\n        vec2 uv1 = wuv3.yx - vec2(t * 0.020, 0.0) + flowOff;\n        vec2 uv2 = wuv3    + vec2(0.0, t * 0.017)  - flowOff.yx;\n\n        const float E = 0.04;\n        float n1c  = noise2(uv1 * 8.0);\n        float n1dx = noise2(uv1 * 8.0 + vec2(E, 0.0)) - noise2(uv1 * 8.0 - vec2(E, 0.0));\n        float n1dz = noise2(uv1 * 8.0 + vec2(0.0, E)) - noise2(uv1 * 8.0 - vec2(0.0, E));\n        float n2dx = noise2(uv2 * 8.0 + vec2(E, 0.0)) - noise2(uv2 * 8.0 - vec2(E, 0.0));\n        float n2dz = noise2(uv2 * 8.0 + vec2(0.0, E)) - noise2(uv2 * 8.0 - vec2(0.0, E));\n        vec3 proceduralNormal = normalize(normal + vec3((n1dx + n2dx) * 0.090, 0.0, (n1dz + n2dz) * 0.090));\n\n        vec3 mappedN1 = waterMapNormal(uv1);\n        vec3 mappedN2 = waterMapNormal(uv2 * 1.37 + vec2(0.21, -0.13));\n        vec3 mappedNormal = normalize(normal + (mappedN1 + mappedN2) * 0.070);\n        vec3 waterNormal = normalize(mix(proceduralNormal, mappedNormal, mapsReady));\n\n        float lightDotN = max(dot(waterNormal, sunDir), 0.0);\n        float viewDotN  = clamp(dot(viewDir, waterNormal), 0.0, 1.0);\n        float baseOpacity  = 0.40;\n        float fresnel      = 1.0 - viewDotN;\n        float finalFresnel = clamp(mix(baseOpacity, 1.0, fresnel * 1.2), 0.0, 1.0);\n\n        vec3 waterColorDark  = vec3(0.035, 0.105, 0.245);\n        vec3 waterColorMid   = vec3(0.160, 0.360, 0.590);\n        vec3 waterColorLight = vec3(0.520, 0.760, 0.910);\n        vec3 surfaceColor = finalFresnel < 0.5\n            ? mix(waterColorDark, waterColorMid, finalFresnel * 2.0)\n            : mix(waterColorMid, waterColorLight, (finalFresnel - 0.5) * 2.0);\n\n        vec3 ambientLightOut = u_skyColour * u_ambient;\n        vec3 dirLight        = vec3(u_diffuseStrength);\n        vec3 lightOut        = lightDotN * dirLight;\n        vec3 halfVec         = normalize(viewDir + sunDir);\n        float sparkleMask    = pow(max(noise2(uv1 * 28.0 + uv2 * 11.0) - 0.62, 0.0) / 0.38, 2.0);\n        float spec           = pow(max(dot(waterNormal, halfVec), 0.0), 420.0) * (0.75 + sparkleMask * 0.45);\n        vec3 lightSpecOut    = dirLight * spec * 0.82;\n        vec3 skyLightOut     = max(-waterNormal.y, 0.0) * u_skyColour * 0.50;\n        vec3 compositeLight  = ambientLightOut + lightOut + lightSpecOut + skyLightOut + surfaceColor * 0.80;\n\n        vec3 waterSurfaceColor = vec3(0.412, 0.502, 0.612);\n        vec3 baseColor = mix(waterSurfaceColor * compositeLight, surfaceColor, 0.85);\n\n        float proceduralFoam = pow(max(noise2(uv1 * 12.0 + uv2 * 8.0 + vec2(t * 0.008, 0.0)) - 0.72, 0.0) / 0.28, 3.0);\n        float mappedFoam = waterFoamMap(uv1 * 0.75 + uv2 * 0.25 + flowOff * 2.0);\n\n        // Shore foam without adjacency data: tile/water edge proximity creates a thin,\n        // broken edge band. This is cheap and stable because it uses world-space tile UVs.\n        vec2 tileUv = fract(v_worldPos.xz / 128.0);\n        float edgeDistance = min(min(tileUv.x, 1.0 - tileUv.x), min(tileUv.y, 1.0 - tileUv.y));\n        float shoreBand = 1.0 - smoothstep(0.020, 0.135, edgeDistance);\n        shoreBand *= smoothstep(0.18, 0.85, noise2(v_worldPos.xz / 92.0 + vec2(t * 0.015, -t * 0.012)));\n\n        float foamAmount = clamp(mix(proceduralFoam, mappedFoam, mapsReady) * 0.50 + shoreBand * 0.42, 0.0, 0.88);\n        vec3 foamColor = vec3(0.93, 0.97, 1.0) * (ambientLightOut + lightOut + vec3(0.18));\n        baseColor = mix(baseColor, foamColor, foamAmount);\n\n        // Underwater/seabed tint: water gets deeper and more blue with alpha-depth.\n        float depthHint = clamp(v_alpha, 0.0, 1.0);\n        vec3 seabedTint = vec3(0.035, 0.105, 0.210);\n        baseColor = mix(baseColor, seabedTint, depthHint * 0.18);\n\n        baseColor += lightSpecOut / 3.0;\n        if (validCacheTexture) {\n            baseColor = mix(baseColor, baseColour, u_waterTextureDiffuse);\n        }\n\n        alpha      = max(baseOpacity, max(foamAmount, max(finalFresnel, length(lightSpecOut / 3.0))));\n        light      = 1.0;\n        baseColour = baseColor;\n        normal     = waterNormal;\n\n    } else if (material == 2.0) {`;
  if (!waterBlockRe.test(src)) {
    console.error('Could not find the current water shader block. Your HDRenderer.ts may have changed.');
    process.exit(1);
  }
  src = src.replace(waterBlockRe, waterBlock);

  src = src.replace(
    `    private static normalAtlas: WebGLTexture | null = null;\n    private static normalAtlasPendingImages: { slot: number; data: Uint8ClampedArray }[] = [];`,
    `    private static normalAtlas: WebGLTexture | null = null;\n    private static normalAtlasPendingImages: { slot: number; data: Uint8ClampedArray }[] = [];\n    private static waterNormalMap: WebGLTexture | null = null;\n    private static waterFlowMap: WebGLTexture | null = null;\n    private static waterFoamMap: WebGLTexture | null = null;\n    private static waterMapsReady: boolean = false;`
  );

  src = src.replace(
    `        this.initNormalAtlas(gl);\n        this.reason = 'ready';`,
    `        this.initNormalAtlas(gl);\n        this.initWaterMaps(gl);\n        this.reason = 'ready';`
  );

  src = src.replace(
    `            'u_lightSpaceMatrix', 'u_shadowMap', 'u_shadowStrength', 'u_normalAtlas',\n            'u_waterTextureDiffuse'`,
    `            'u_lightSpaceMatrix', 'u_shadowMap', 'u_shadowStrength', 'u_normalAtlas',\n            'u_waterTextureDiffuse', 'u_waterNormalMap', 'u_waterFlowMap', 'u_waterFoamMap', 'u_waterMapsReady'`
  );

  src = src.replace(
    `    private static renderShadowPass(): void {`,
    `    private static initWaterMaps(gl: WebGL2RenderingContext): void {\n        if (this.waterNormalMap && this.waterFlowMap && this.waterFoamMap) {\n            return;\n        }\n\n        const makeFallback = (kind: 'normal' | 'flow' | 'foam'): WebGLTexture | null => {\n            const size = 128;\n            const data = new Uint8Array(size * size * 4);\n            for (let y = 0; y < size; y++) {\n                for (let x = 0; x < size; x++) {\n                    const i = (x + y * size) * 4;\n                    const n = ((Math.sin(x * 0.19 + y * 0.07) + Math.sin(x * 0.05 - y * 0.17)) * 0.25 + 0.5);\n                    if (kind === 'normal') {\n                        data[i + 0] = 128 + Math.round((n - 0.5) * 46);\n                        data[i + 1] = 128 + Math.round((0.5 - n) * 46);\n                        data[i + 2] = 255;\n                    } else if (kind === 'flow') {\n                        data[i + 0] = 128 + Math.round(Math.sin(y * 0.09) * 48);\n                        data[i + 1] = 128 + Math.round(Math.cos(x * 0.08) * 48);\n                        data[i + 2] = 128;\n                    } else {\n                        const edge = Math.min(Math.min(x, size - 1 - x), Math.min(y, size - 1 - y)) / size;\n                        data[i + 0] = edge < 0.08 && n > 0.45 ? 235 : Math.round(Math.max(0, n - 0.72) * 255);\n                        data[i + 1] = data[i + 0];\n                        data[i + 2] = data[i + 0];\n                    }\n                    data[i + 3] = 255;\n                }\n            }\n            const tex = gl.createTexture();\n            if (!tex) {\n                return null;\n            }\n            gl.bindTexture(gl.TEXTURE_2D, tex);\n            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);\n            gl.generateMipmap(gl.TEXTURE_2D);\n            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);\n            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);\n            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);\n            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);\n            gl.bindTexture(gl.TEXTURE_2D, null);\n            return tex;\n        };\n\n        this.waterNormalMap = makeFallback('normal');\n        this.waterFlowMap = makeFallback('flow');\n        this.waterFoamMap = makeFallback('foam');\n\n        const load = (url: string, assign: (tex: WebGLTexture) => void): void => {\n            fetch(url)\n                .then(r => r.ok ? r.blob() : Promise.reject(url))\n                .then(blob => createImageBitmap(blob))\n                .then(bitmap => {\n                    const tex = gl.createTexture();\n                    if (!tex) {\n                        bitmap.close();\n                        return;\n                    }\n                    gl.bindTexture(gl.TEXTURE_2D, tex);\n                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);\n                    bitmap.close();\n                    gl.generateMipmap(gl.TEXTURE_2D);\n                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);\n                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);\n                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);\n                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);\n                    gl.bindTexture(gl.TEXTURE_2D, null);\n                    assign(tex);\n                    this.waterMapsReady = Boolean(this.waterNormalMap && this.waterFlowMap && this.waterFoamMap);\n                })\n                .catch(() => {\n                    // Keep procedural/fallback map alive. Missing PNGs should never break HD mode.\n                });\n        };\n\n        load('/hd/textures/water_normal.png', tex => { this.waterNormalMap = tex; });\n        load('/hd/textures/water_flow.png', tex => { this.waterFlowMap = tex; });\n        load('/hd/textures/water_foam.png', tex => { this.waterFoamMap = tex; });\n        this.waterMapsReady = false;\n    }\n\n    private static renderShadowPass(): void {`
  );

  src = src.replace(
    `        gl.uniform1f(u('u_waterTextureDiffuse'), hdWaterTextureDiffuse);\n        gl.uniform1i(u('u_textureDebugMode'), this.textureDebugMode());`,
    `        gl.uniform1f(u('u_waterTextureDiffuse'), hdWaterTextureDiffuse);\n        gl.uniform1f(u('u_waterMapsReady'), this.waterMapsReady ? 1.0 : 0.0);\n        gl.uniform1i(u('u_textureDebugMode'), this.textureDebugMode());`
  );

  src = src.replace(
    `        if (this.normalAtlas) {\n            gl.activeTexture(gl.TEXTURE3);\n            gl.bindTexture(gl.TEXTURE_2D, this.normalAtlas);\n            gl.uniform1i(this.uniformCache.get('u_normalAtlas') ?? null, 3);\n        }`,
    `        if (this.normalAtlas) {\n            gl.activeTexture(gl.TEXTURE3);\n            gl.bindTexture(gl.TEXTURE_2D, this.normalAtlas);\n            gl.uniform1i(this.uniformCache.get('u_normalAtlas') ?? null, 3);\n        }\n\n        if (this.waterNormalMap) {\n            gl.activeTexture(gl.TEXTURE4);\n            gl.bindTexture(gl.TEXTURE_2D, this.waterNormalMap);\n            gl.uniform1i(this.uniformCache.get('u_waterNormalMap') ?? null, 4);\n        }\n        if (this.waterFlowMap) {\n            gl.activeTexture(gl.TEXTURE5);\n            gl.bindTexture(gl.TEXTURE_2D, this.waterFlowMap);\n            gl.uniform1i(this.uniformCache.get('u_waterFlowMap') ?? null, 5);\n        }\n        if (this.waterFoamMap) {\n            gl.activeTexture(gl.TEXTURE6);\n            gl.bindTexture(gl.TEXTURE_2D, this.waterFoamMap);\n            gl.uniform1i(this.uniformCache.get('u_waterFoamMap') ?? null, 6);\n        }`
  );

  fs.writeFileSync(rendererPath, src, 'utf8');
  console.log('Patched src/hd/HDRenderer.ts');
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function writePng(file, width, height, rgba) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(rgba.subarray(y * width * 4, (y + 1) * width * 4)));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
}
function smoothNoise(x, y) {
  return (Math.sin(x * 0.071 + y * 0.113) + Math.sin(x * 0.167 - y * 0.041) + Math.sin((x + y) * 0.037)) / 6 + 0.5;
}
const texDir = path.join(root, 'lostcity-client', 'frontend', 'public', 'hd', 'textures');
const altTexDir = path.join(root, 'frontend', 'public', 'hd', 'textures');
const outDir = fs.existsSync(path.join(root, 'lostcity-client')) ? texDir : altTexDir;
fs.mkdirSync(outDir, { recursive: true });
const size = 256;
for (const kind of ['normal', 'flow', 'foam']) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (x + y * size) * 4;
    const n = smoothNoise(x, y);
    if (kind === 'normal') {
      const nx = smoothNoise(x + 2, y) - smoothNoise(x - 2, y);
      const ny = smoothNoise(x, y + 2) - smoothNoise(x, y - 2);
      data[i] = Math.max(0, Math.min(255, 128 + nx * 220));
      data[i + 1] = Math.max(0, Math.min(255, 128 + ny * 220));
      data[i + 2] = 255;
    } else if (kind === 'flow') {
      data[i] = Math.max(0, Math.min(255, 128 + Math.sin((y + n * 80) * 0.045) * 64));
      data[i + 1] = Math.max(0, Math.min(255, 128 + Math.cos((x - n * 80) * 0.040) * 64));
      data[i + 2] = 128;
    } else {
      const edge = Math.min(Math.min(x, size - 1 - x), Math.min(y, size - 1 - y)) / size;
      const broken = smoothNoise(x * 2, y * 2);
      const foam = (edge < 0.055 && broken > 0.42) ? 235 : Math.max(0, (n - 0.73) / 0.27 * 255);
      data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, foam));
    }
    data[i + 3] = 255;
  }
  writePng(path.join(outDir, `water_${kind}.png`), size, size, data);
  console.log(`Wrote ${path.relative(root, path.join(outDir, `water_${kind}.png`))}`);
}
console.log('Done. Rebuild your client, then test HD water.');
