import fs from 'fs';
import path from 'path';

import { minify } from 'terser';

const define = {
    'process.env.SECURE_ORIGIN': JSON.stringify(process.env.SECURE_ORIGIN ?? 'false'),
    // original key, used 2003-2010
    'process.env.LOGIN_RSAE': JSON.stringify(process.env.LOGIN_RSAE ?? '58778699976184461502525193738213253649000149147835990136706041084440742975821'),
    'process.env.LOGIN_RSAN': JSON.stringify(process.env.LOGIN_RSAN ?? '7162900525229798032761816791230527296329313291232324290237849263501208207972894053929065636522363163621000728841182238772712427862772219676577293600221789'),
    'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString())
};

const hdRuntimeDefaults = `(() => {
    const g = globalThis;
    g.HD_FAR_TILE_BUDGET ??= 2601;
    g.HD_FAR_MODEL_CANDIDATES ??= 50000;
    g.HD_FAR_MODEL_BUDGET ??= 30000;
    g.HD_MODEL_BUDGET ??= 30000;
    g.HD_MODEL_VERTEX_BUDGET ??= 4000000;
    g.HD_FAR_TIME_BUDGET_MS ??= 0;
})();
`;

const fpsSettingsRuntimePatch = `(() => {
    if (globalThis.__RS_FPS_SETTING_PATCH__) return;
    globalThis.__RS_FPS_SETTING_PATCH__ = true;

    const fmt = bytes => bytes > 0 ? (bytes / 1048576).toFixed(1) + ' MB' : 'n/a';
    const memLine = () => {
        const m = performance && performance.memory ? performance.memory : null;
        return m ? ('Memory: ' + fmt(m.usedJSHeapSize) + ' / ' + fmt(m.totalJSHeapSize)) : 'Memory: n/a';
    };

    function setVisible(on) {
        globalThis.RS_PERF_OVERLAY_VISIBLE = !!on;
        try { localStorage.setItem('showFpsOverlay', on ? 'true' : 'false'); } catch (_) {}
        const el = document.getElementById('rs-perf-debug-overlay');
        if (el) el.style.display = on ? 'block' : 'none';
    }

    function patchText() {
        const el = document.getElementById('rs-perf-debug-overlay');
        if (el && el.textContent) {
            const lines = el.textContent.split('\n').filter(line => line.indexOf('F10 toggle') === -1 && !line.startsWith('Memory: '));
            if (lines[0] && lines[0].startsWith('Perf Debug Overlay')) lines[0] = 'Perf Debug Overlay';
            const i = lines.findIndex(line => line.startsWith('Avg frame:'));
            if (i !== -1) lines.splice(i + 1, 0, memLine());
            el.textContent = lines.join('\n');
        }
        requestAnimationFrame(patchText);
    }

    function addSetting() {
        const body = document.querySelector('#settings-panel .st-body');
        if (!body || document.getElementById('misc-fps')) return;
        const section = document.createElement('div');
        section.className = 'st-section';
        section.innerHTML = '<div class="st-section-title">Misc</div><label class="st-check-row"><input type="checkbox" id="misc-fps"> FPS</label>';
        body.appendChild(section);
        const chk = document.getElementById('misc-fps');
        chk.checked = localStorage.getItem('showFpsOverlay') !== 'false';
        setVisible(chk.checked);
        chk.addEventListener('change', () => setVisible(chk.checked));
    }

    document.addEventListener('DOMContentLoaded', addSetting);
    setInterval(addSetting, 500);
    requestAnimationFrame(patchText);
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
        [
            'return shape >= LocShape.ROOF_STRAIGHT && shape <= LocShape.ROOFEDGE_SQUARE_CORNER;',
            'return globalThis.HD_HIDE_ROOF_SHAPES === true && shape >= LocShape.ROOF_STRAIGHT && shape <= LocShape.ROOFEDGE_SQUARE_CORNER;'
        ],
        [
            'return shape >= 12 && shape <= 21;',
            'return globalThis.HD_HIDE_ROOF_SHAPES === true && shape >= 12 && shape <= 21;'
        ],
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

    script.source = hdRuntimeDefaults + fpsSettingsRuntimePatch + script.source;
}

async function applyTerser(script: BunOutput): Promise<boolean> {
    const mini = await minify(script.source, {
        sourceMap: {
            content: script.sourcemap
        },
        toplevel: true,
        compress: {
            ecma: 2020
        },
        mangle: false
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
