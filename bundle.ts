import fs from 'fs';
import path from 'path';

import { minify } from 'terser';

import { nth_identifier } from './identifier.js';

const define = {
    'process.env.SECURE_ORIGIN': JSON.stringify(process.env.SECURE_ORIGIN ?? 'false'),
    // original key, used 2003-2010
    'process.env.LOGIN_RSAE': JSON.stringify(process.env.LOGIN_RSAE ?? '58778699976184461502525193738213253649000149147835990136706041084440742975821'),
    'process.env.LOGIN_RSAN': JSON.stringify(process.env.LOGIN_RSAN ?? '7162900525229798032761816791230527296329313291232324290237849263501208207972894053929065636522363163621000728841182238772712427862772219676577293600221789'),
    'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString())
};

const hdRuntimeDefaults = `(() => {
    const g = globalThis;
	
	// HD ground material tuning
g.HD_GROUND_TEXTURE_STRENGTH ??= 0.65;
g.HD_GROUND_NORMAL_STRENGTH ??= 0.35;
g.HD_GROUND_TEXTURE_SCALE ??= 256.0;
g.HD_GROUND_MACRO_STRENGTH ??= 0.08;

// Force-disable the old PNG colour override path.
// 117/RLHD textures now render from the dedicated HD atlas.
// Leaving this enabled can cause: blurry -> HD flash -> blurry again after login.
g['ENABLE_HD_COLOR_TEXTURE_OVERRIDES'] = false;
g['HD_TEXTURE_OVERRIDES_LOCKED'] = true;

// HD water tuning
g.HD_WATER_TEXTURE_DIFFUSE ??= 0.10;
g.HD_WATER_FRESNEL_STRENGTH ??= 0.95;
g.HD_WATER_SPECULAR_STRENGTH ??= 0.65;
g.HD_WATER_FOAM_STRENGTH ??= 0.25;

// HD environment lighting
g.HD_ENV_AMBIENT_R ??= 0.82;
g.HD_ENV_AMBIENT_G ??= 0.84;
g.HD_ENV_AMBIENT_B ??= 0.88;

g.HD_ENV_SUN_R ??= 1.08;
g.HD_ENV_SUN_G ??= 1.00;
g.HD_ENV_SUN_B ??= 0.86;

g.HD_ENV_FOG_R ??= 0.54;
g.HD_ENV_FOG_G ??= 0.62;
g.HD_ENV_FOG_B ??= 0.70;

g.HD_ENV_SKY_STRENGTH ??= 0.16;
g.HD_ENV_EXPOSURE ??= 1.04;
g.HD_ENV_CONTRAST ??= 1.03;

    g.HD_FAR_TILE_BUDGET ??= 2601;
    g.HD_FAR_MODEL_CANDIDATES ??= 50000;
    g.HD_FAR_MODEL_BUDGET ??= 30000;
    g.HD_MODEL_BUDGET ??= 30000;
    g.HD_MODEL_VERTEX_BUDGET ??= 4000000;
    g.HD_FAR_TIME_BUDGET_MS ??= 0;
})();
`;

// ----

type BunOutput = {
    source: string;
    sourcemap: string;
}

async function bunBuild(entry: string, external: string[] = [], minify = true, drop: string[] = []): Promise<BunOutput> {
    const build = await Bun.build({
        entrypoints: [entry],
        sourcemap: 'external',
        define,
        external,
        minify,
        drop,
    });

    if (!build.success) {
        build.logs.forEach((x: any) => console.log(x));
        process.exit(1);
    }

    return {
        source: await build.outputs[0].text(),
        sourcemap: build.outputs[0].sourcemap ? await build.outputs[0].sourcemap.text() : ''
    };
}

function patchClientBundle(script: BunOutput): void {
    // In the original 2004 client, "high detail" also controlled whether audio
    // was loaded. Our launcher now has three modes:
    //   Default    = normal software client, audio on, 50 FPS
    //   Low memory = reduced graphics/memory, audio on, 50 FPS
    //   HD         = WebGL HD renderer, audio on, 60 FPS/render-refresh smoothing
    // Keep the HD renderer toggle separate from the old software high-detail flag.
    const replacements: Array<[string, string]> = [
        [
            'Pix3D.highDetail = enabled;\n        Pix3D.lowDetail = !enabled;\n        window.CLIENT_HD_MODE = enabled;',
            'Pix3D.highDetail = enabled || window.CLIENT_LOW_MEMORY !== true;\n        Pix3D.lowDetail = !Pix3D.highDetail;\n        window.CLIENT_HD_MODE = enabled;'
        ],
        [
            'Pix3D.highDetail = enabled;\n        Pix3D.lowDetail = !enabled;\n        globalThis.CLIENT_HD_MODE = enabled;',
            'Pix3D.highDetail = enabled || globalThis.CLIENT_LOW_MEMORY !== true;\n        Pix3D.lowDetail = !Pix3D.highDetail;\n        globalThis.CLIENT_HD_MODE = enabled;'
        ],
        [
            'Pix3D.highDetail = enabled;\n        Pix3D.lowDetail = !enabled;\n        (window as any).CLIENT_HD_MODE = enabled;',
            'Pix3D.highDetail = enabled || window.CLIENT_LOW_MEMORY !== true;\n        Pix3D.lowDetail = !Pix3D.highDetail;\n        window.CLIENT_HD_MODE = enabled;'
        ],
        [
            'if (Pix3D.highDetail) {\n                    this.areaViewport?.drawKeyed(4, 4, HD_VIEWPORT_KEY);\n                } else {',
            'if (HDRenderer.isEnabled()) {\n                    this.areaViewport?.drawKeyed(4, 4, HD_VIEWPORT_KEY);\n                } else {'
        ],

        // Audio must not be tied to Client.lowMem anymore. Low Memory should reduce
        // graphics/memory only; music tab, music changes and sound effects still work.
        [
            'if (!Client.lowMem) {\n                this.midiSong = 0;',
            'if (true) {\n                this.midiSong = 0;'
        ],
        [
            'if (!Client.lowMem) {\n                const midiCount = this.onDemand.getFileCount(2);',
            'if (true) {\n                const midiCount = this.onDemand.getFileCount(2);'
        ],
        [
            "if (!Client.lowMem) {\n                await this.messageBox('Unpacking sounds', 90);",
            "if (true) {\n                await this.messageBox('Unpacking sounds', 90);"
        ],
        [
            'this.waveEnabled && !Client.lowMem && this.waveCount < 50',
            'this.waveEnabled && this.waveCount < 50'
        ],
        [
            'this.nextMidiSong != id && this.midiActive && !Client.lowMem',
            'this.nextMidiSong != id && this.midiActive'
        ],
        [
            'this.midiActive && !Client.lowMem',
            'this.midiActive'
        ],

        // Keep the old broad compatibility replacements last. These only affect old
        // high-detail/audio prompt paths when the generated JS still contains them.
        [
            'if(!Client.lowMem){',
            'if(!Client.lowMem||globalThis.CLIENT_LOW_MEMORY!==true){'
        ],
        [
            'if (!Client.lowMem) {',
            'if (!Client.lowMem || globalThis.CLIENT_LOW_MEMORY !== true) {'
        ]
    ];

    for (const [from, to] of replacements) {
        script.source = script.source.split(from).join(to);
    }

    script.source = hdRuntimeDefaults + script.source;
}

async function applyTerser(script: BunOutput): Promise<boolean> {
    const mini = await minify(script.source, {
        sourceMap: {
            content: script.sourcemap
        },
        toplevel: true,
        // format: {
        //     beautify: true
        // },
        compress: {
            ecma: 2020
        },
        mangle: {
            nth_identifier: nth_identifier,
            properties: {
                reserved: [
                    // xpTrackerData entry fields (read by un-bundled HTML)
                    'skill',
                    'colour',
                    'gained',
                    'xp',
                    'progressPct',
                    'xpToNext',

                    // world map panel: playerMapPos + postMessage fields
                    'playerMapPos',
                    'tileX',
                    'tileZ',
                    'type',
                    'playerPos',

                    // HD runtime debug/budget globals
                    'HD_FAR_TILE_BUDGET',
                    'HD_FAR_MODEL_CANDIDATES',
                    'HD_FAR_MODEL_BUDGET',
                    'HD_MODEL_BUDGET',
                    'HD_MODEL_VERTEX_BUDGET',
                    'HD_FAR_TIME_BUDGET_MS',
                    'HD_GROUND_TEXTURE_STRENGTH',
                    'HD_GROUND_NORMAL_STRENGTH',
                    'HD_GROUND_TEXTURE_SCALE',
                    'HD_GROUND_MACRO_STRENGTH',
                    'CLIENT_LOW_MEMORY',
                    'CLIENT_HD_MODE',
                    'HD_RENDERER_STATUS',
                    'setClientHdMode',
                    'setClientLowMemoryMode',

                    // stdlib
                    'willReadFrequently',
                    'usedJSHeapSize',

                    // wasm
                    // must be callable:
                    '_abort_js',
                    'emscripten_resize_heap',
                    'fd_close',
                    'fd_seek',
                    'fd_write',
                    // must be an object:
                    'env',
                    'wasi_snapshot_preview1',
                    // is not an object:
                    'instance',
                    // is not a function:
                    'emscripten_stack_init',
                    'emscripten_stack_get_end',
                    '__wasm_call_ctors',
                    // imports:
                    'HEAPU8',
                    // exports:
                    '_emscripten_stack_restore',
                    '_emscripten_stack_alloc',
                    'emscripten_stack_get_current',
                    'memory',
                    '_malloc',
                    'malloc',
                    '_free',
                    'free',
                    '_realloc',
                    'realloc',
                    '__indirect_function_table',
                    '_tsf_load_memory',
                    'tsf_load_memory',
                    '_tsf_close',
                    'tsf_close',
                    '_tsf_reset',
                    'tsf_reset',
                    '_tsf_set_output',
                    'tsf_set_output',
                    '_tsf_channel_set_bank_preset',
                    'tsf_channel_set_bank_preset',
                    '_tml_load_memory',
                    'tml_load_memory',
                    '_midi_render',
                    'midi_render',
                    'setValue',
                    'getValue',
                    'calledRun'
                ]
            }
        }
    });

    script.source = mini.code ?? '';
    script.sourcemap = mini.map?.toString() ?? '';
    return true;
}

// ----

if (!fs.existsSync('out')) {
    fs.mkdirSync('out');
}

fs.copyFileSync('src/3rdparty/tinymidipcm/tinymidipcm.wasm', 'out/tinymidipcm.wasm');

const args = process.argv.slice(2);
const prod = args[0] !== 'dev';

const entrypoints = [
    'src/client/Client.ts',
    'src/mapview/MapView.ts'
];

fs.mkdirSync('out', { recursive: true });
fs.mkdirSync('lostcity-client/frontend/dist', { recursive: true });
fs.mkdirSync('lostcity-client/frontend/public', { recursive: true });

for (const file of entrypoints) {
    const output = path.basename(file).replace('.ts', '.js').toLowerCase();

    const script = await bunBuild(file, [], prod, prod ? ['console'] : []);
    if (script) {
        if (output === 'client.js') {
            patchClientBundle(script);
        }

        if (prod) {
            await applyTerser(script);
        }

        fs.writeFileSync(`out/${output}`, script.source);
        fs.writeFileSync(`out/${output}.map`, script.sourcemap);

        if (output === 'mapview.js') {
            fs.writeFileSync('lostcity-client/frontend/dist/mapview.js', script.source);
        }

        if (output === 'client.js') {
            fs.writeFileSync('lostcity-client/frontend/dist/client.js', script.source);
            fs.writeFileSync('lostcity-client/frontend/public/client.js', script.source);
        }
    }
}
