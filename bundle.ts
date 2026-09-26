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

const CLIENT_ENTRY_PATH = 'src/client/Client.ts';

function replaceExactlyOnce(source: string, needle: string, replacement: string, label: string): string {
    const first = source.indexOf(needle);
    if (first < 0) {
        throw new Error(`Grand Exchange client build patch cannot find ${label}`);
    }
    if (source.indexOf(needle, first + needle.length) !== -1) {
        throw new Error(`Grand Exchange client build patch found multiple ${label} occurrences`);
    }
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

function patchGrandExchangeNativeSellInventory(source: string): string {
    // The server keeps a synthetic Sell inventory for Java-client compatibility.
    // The browser already has the native inventory mounted, so swapping to the
    // synthetic copy produces a visible one-frame inventory/icon flash. Keep the
    // native inventory mounted and route its Offer action to the server's existing
    // synthetic inventory component instead.
    source = replaceExactlyOnce(
        source,
        'const GRAND_EXCHANGE_OVERVIEW_ROOT_COMPONENT_ID = 8990;',
        [
            'const GRAND_EXCHANGE_OVERVIEW_ROOT_COMPONENT_ID = 8990;',
            'const GRAND_EXCHANGE_NATIVE_INVENTORY_COMPONENT_ID = 3214;',
            'const GRAND_EXCHANGE_SELL_INVENTORY_ROOT_ID = 8988;',
            'const GRAND_EXCHANGE_SELL_INVENTORY_COMPONENT_ID = 11393;',
            'const GRAND_EXCHANGE_OFFER_TITLE_COMPONENT_ID = 9133;',
            'const GRAND_EXCHANGE_SELECTED_SETUP_ROOT_COMPONENT_ID = 9156;',
            'const GRAND_EXCHANGE_SELL_PROMPT_ROOT_COMPONENT_ID = 9197;',
            'const GRAND_EXCHANGE_DETAIL_ROOT_COMPONENT_ID = 9200;',
        ].join('\n'),
        'GE overview constant anchor'
    );

    // Keep protocol state for the synthetic inventory up to date, but an update
    // to that off-screen component must not repaint the visible native inventory.
    source = replaceExactlyOnce(
        source,
        `            if (this.ptype === ServerProt.UPDATE_INV_FULL) {\n                this.redrawSidebar = true;\n\n                const component: number = this.in.g2();\n                const inv: IfType = IfType.list[component];`,
        `            if (this.ptype === ServerProt.UPDATE_INV_FULL) {\n                const component: number = this.in.g2();\n                const inv: IfType = IfType.list[component];\n                if (\n                    !GRAND_EXCHANGE_ENABLED ||\n                    this.mainModalId !== GRAND_EXCHANGE_OVERVIEW_ROOT_COMPONENT_ID ||\n                    component !== GRAND_EXCHANGE_SELL_INVENTORY_COMPONENT_ID\n                ) {\n                    this.redrawSidebar = true;\n                }`,
        'GE full sell-inventory update redraw'
    );

    source = replaceExactlyOnce(
        source,
        `            if (this.ptype === ServerProt.UPDATE_INV_PARTIAL) {\n                this.redrawSidebar = true;\n\n                const component: number = this.in.g2();\n                const inv: IfType = IfType.list[component];`,
        `            if (this.ptype === ServerProt.UPDATE_INV_PARTIAL) {\n                const component: number = this.in.g2();\n                const inv: IfType = IfType.list[component];\n                if (\n                    !GRAND_EXCHANGE_ENABLED ||\n                    this.mainModalId !== GRAND_EXCHANGE_OVERVIEW_ROOT_COMPONENT_ID ||\n                    component !== GRAND_EXCHANGE_SELL_INVENTORY_COMPONENT_ID\n                ) {\n                    this.redrawSidebar = true;\n                }`,
        'GE partial sell-inventory update redraw'
    );

    // This is the actual visible flicker: IF_SETTAB replaces native inventory:inv
    // with a second, visually identical GE Sell inventory. Consume only that GE
    // replacement packet so the already-drawn inventory never leaves the screen.
    source = replaceExactlyOnce(
        source,
        `                this.sideOverlayId[tab] = com;\n                this.redrawSidebar = true;\n                this.redrawSideicons = true;`,
        `                const suppressGrandExchangeSellTabSwap =\n                    GRAND_EXCHANGE_ENABLED &&\n                    this.mainModalId === GRAND_EXCHANGE_OVERVIEW_ROOT_COMPONENT_ID &&\n                    tab === 3 &&\n                    com === GRAND_EXCHANGE_SELL_INVENTORY_ROOT_ID;\n\n                if (!suppressGrandExchangeSellTabSwap) {\n                    const previousTabInterface = this.sideOverlayId[tab];\n                    this.sideOverlayId[tab] = com;\n                    if (\n                        !GRAND_EXCHANGE_ENABLED ||\n                        this.mainModalId !== GRAND_EXCHANGE_OVERVIEW_ROOT_COMPONENT_ID ||\n                        previousTabInterface !== com\n                    ) {\n                        this.redrawSidebar = true;\n                        this.redrawSideicons = true;\n                    }\n                }`,
        'GE sell inventory-tab swap'
    );

    // Preserve a real tab change, but do not repaint an already-active inventory
    // tab merely because the GE Sell setup repeats the same active-tab packet.
    source = replaceExactlyOnce(
        source,
        `            if (this.ptype === ServerProt.IF_SETTAB_ACTIVE) {\n                this.sideTab = this.in.g1();\n\n                this.redrawSidebar = true;\n                this.redrawSideicons = true;`,
        `            if (this.ptype === ServerProt.IF_SETTAB_ACTIVE) {\n                const tab = this.in.g1();\n                if (\n                    !GRAND_EXCHANGE_ENABLED ||\n                    this.mainModalId !== GRAND_EXCHANGE_OVERVIEW_ROOT_COMPONENT_ID ||\n                    this.sideTab !== tab\n                ) {\n                    this.sideTab = tab;\n                    this.redrawSidebar = true;\n                    this.redrawSideicons = true;\n                }`,
        'GE sell active-tab refresh'
    );

    // Because the synthetic Sell inventory stays hidden, expose its authoritative
    // Offer action on the native inventory and send the same INV_BUTTON1 payload
    // the server already handles for component 11393.
    const inventoryOptionAnchor = '                            if (child.iop) {';
    source = replaceExactlyOnce(
        source,
        inventoryOptionAnchor,
        [
            '                            if (',
            '                                GRAND_EXCHANGE_ENABLED &&',
            '                                child.id === GRAND_EXCHANGE_NATIVE_INVENTORY_COMPONENT_ID &&',
            '                                this.mainModalId === GRAND_EXCHANGE_OVERVIEW_ROOT_COMPONENT_ID &&',
            "                                IfType.list[GRAND_EXCHANGE_OFFER_TITLE_COMPONENT_ID]?.text === 'Sell Offer' &&",
            '                                IfType.list[GRAND_EXCHANGE_DETAIL_ROOT_COMPONENT_ID]?.hide !== false &&',
            '                                (',
            '                                    IfType.list[GRAND_EXCHANGE_SELECTED_SETUP_ROOT_COMPONENT_ID]?.hide === false ||',
            '                                    IfType.list[GRAND_EXCHANGE_SELL_PROMPT_ROOT_COMPONENT_ID]?.hide === false',
            '                                )',
            '                            ) {',
            "                                this.menuOption[this.menuNumEntries] = 'Offer @lre@' + obj.name;",
            '                                this.menuAction[this.menuNumEntries] = MiniMenuAction.INV_BUTTON1;',
            '                                this.menuParamA[this.menuNumEntries] = obj.id;',
            '                                this.menuParamB[this.menuNumEntries] = slot;',
            '                                this.menuParamC[this.menuNumEntries] = GRAND_EXCHANGE_SELL_INVENTORY_COMPONENT_ID;',
            '                                this.menuNumEntries++;',
            '                            }',
            '',
            inventoryOptionAnchor,
        ].join('\n'),
        'native inventory option insertion point'
    );

    for (const required of [
        'GRAND_EXCHANGE_NATIVE_INVENTORY_COMPONENT_ID = 3214',
        'GRAND_EXCHANGE_SELL_INVENTORY_ROOT_ID = 8988',
        'GRAND_EXCHANGE_SELL_INVENTORY_COMPONENT_ID = 11393',
        'suppressGrandExchangeSellTabSwap',
        "this.menuOption[this.menuNumEntries] = 'Offer @lre@' + obj.name;",
        'this.menuParamC[this.menuNumEntries] = GRAND_EXCHANGE_SELL_INVENTORY_COMPONENT_ID;',
    ]) {
        if (!source.includes(required)) {
            throw new Error(`Grand Exchange native Sell patch is missing token: ${required}`);
        }
    }

    return source;
}

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
                    // custom content flags set via inline (non-bundled) script in main.go's
                    // /client-config.js — must keep literal name or CUSTOM_CONTENT?.clans lookups
                    // break after mangling
                    'clans',
                    'middleMouseRotation',
                    'compassReset',
                    'antiMacroRotation',
                    'scrollwheelZoom',
                    'grandExchange',

                    // gamepadInput singleton — accessed by name from the non-bundled HTML panel
                    'gamepadInput',
                    'enabled',
                    'sensitivity',
                    'cameraSensitivity',
                    'invertCameraY',
                    'savePrefs',

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
                    '_tsf_channel_set_bank_preset',
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
    CLIENT_ENTRY_PATH,
    'src/mapview/MapView.ts'
];

for (const file of entrypoints) {
    const output = path.basename(file).replace('.ts', '.js').toLowerCase();
    const originalClientSource = file === CLIENT_ENTRY_PATH ? fs.readFileSync(file, 'utf8') : null;

    try {
        if (originalClientSource !== null) {
            const patchedClientSource = patchGrandExchangeNativeSellInventory(originalClientSource.replace(/\r/g, ''));
            fs.writeFileSync(file, patchedClientSource, 'utf8');
        }

        const script = await bunBuild(file, [], prod, prod ? ['console'] : []);
        if (script) {
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
            }
        }
    } finally {
        if (originalClientSource !== null) {
            fs.writeFileSync(file, originalClientSource, 'utf8');
        }
    }
}
