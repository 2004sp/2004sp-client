import type { Unzipped } from 'fflate';
import { gunzipSync, unzipSync } from 'fflate';

import type { Client } from '#/client/Client.js';

import LinkList2 from '#/datastruct/LinkList2.js';
import LinkList from '#/datastruct/LinkList.js';

import ClientStream from '#/io/ClientStream.js';
import type Jagfile from '#/io/Jagfile.js';
import OnDemandProvider from '#/io/OnDemandProvider.js';
import OnDemandRequest from '#/io/OnDemandRequest.js';
import Packet from '#/io/Packet.js';

import { downloadUrl, sleep } from '#/util/JsUtil.js';

export default class OnDemand extends OnDemandProvider {
    modernized: boolean = true;
    zip: Unzipped | null = null;

    versions: number[][] = [];
    crcs: number[][] = [];
    priorities: number[][] = [];
    topPriority: number = 0;
    modelUse: number[] = [];
    mapIndex: number[] = [];
    mapLand: number[] = [];
    mapLoc: number[] = [];
    mapMembers: number[] = [];
    animFrameIndex: number[] = [];
    midiJingle: number[] = [];
    running: boolean = true;
    app: Client;
    active: boolean = false;
    importantCount: number = 0;
    requestCount: number = 0;
    requests: LinkList2<OnDemandRequest> = new LinkList2();
    queue: LinkList<OnDemandRequest> = new LinkList();
    missing: LinkList<OnDemandRequest> = new LinkList();
    pending: LinkList<OnDemandRequest> = new LinkList();
    completed: LinkList<OnDemandRequest> = new LinkList();
    prefetches: LinkList<OnDemandRequest> = new LinkList();
    message: string = '';
    buf: Uint8Array = new Uint8Array(500);
    data: Uint8Array = new Uint8Array(65000);
    loadedPrefetchFiles: number = 0;
    totalPrefetchFiles: number = 0;
    partOffset: number = 0;
    partAvailable: number = 0;
    packetCycle: number = 0;
    noTimeoutCycle: number = 0;
    cycle: number = 0;
    socketOpenTime: number = 0;
    current: OnDemandRequest | null = null;
    stream: ClientStream | null = null;

    constructor(versionlist: Jagfile, app: Client) {
        super();

        const version: string[] = ['model_version', 'anim_version', 'midi_version', 'map_version'];
        for (let i = 0; i < 4; i++) {
            const data = versionlist.read(version[i]);
            if (!data) {
                throw new Error();
            }

            const count = data.length / 2;
            const buf = new Packet(data);

            this.versions[i] = new Array(count);
            this.priorities[i] = new Array(count);

            for (let j = 0; j < count; j++) {
                this.versions[i][j] = buf.g2();
            }
        }

        const crc: string[] = ['model_crc', 'anim_crc', 'midi_crc', 'map_crc'];
        for (let i = 0; i < 4; i++) {
            const data = versionlist.read(crc[i]);
            if (!data) {
                throw new Error();
            }

            const count = data.length / 4;
            const buf = new Packet(data);

            this.crcs[i] = new Array(count);

            for (let j = 0; j < count; j++) {
                this.crcs[i][j] = buf.g4();
            }
        }

        let data = versionlist.read('model_index');
        if (data) {
            const count = this.versions[0].length;
            this.modelUse = new Array(count);

            for (let i = 0; i < count; i++) {
                if (i < data.length) {
                    this.modelUse[i] = data[i];
                } else {
                    this.modelUse[i] = 0;
                }
            }
        }

        data = versionlist.read('map_index');
        if (data) {
            const count = data.length / 7;
            const buf = new Packet(data);

            this.mapIndex = new Array(count);
            this.mapLand = new Array(count);
            this.mapLoc = new Array(count);
            this.mapMembers = new Array(count);

            for (let i = 0; i < count; i++) {
                this.mapIndex[i] = buf.g2();
                this.mapLand[i] = buf.g2();
                this.mapLoc[i] = buf.g2();
                this.mapMembers[i] = buf.g1();
            }
        }

        data = versionlist.read('anim_index');
        if (data) {
            const count = data.length / 2;
            const buf = new Packet(data);

            this.animFrameIndex = new Array(count);
            for (let i = 0; i < count; i++) {
                this.animFrameIndex[i] = buf.g2();
            }
        }

        data = versionlist.read('midi_index');
        if (data) {
            const count = data.length;
            const buf = new Packet(data);

            this.midiJingle = new Array(count);
            for (let i = 0; i < count; i++) {
                this.midiJingle[i] = buf.g1();
            }
        }

        this.app = app;
        this.running = true;
    }

    stop() {
        this.running = false;
    }

    getFileCount(archive: number) {
        return this.versions[archive].length;
    }

    getAnimFrameCount() {
        return this.animFrameIndex.length;
    }

    getMapFile(x: number, z: number, type: number) {
        const map = (x << 8) + z;

        for (let i = 0; i < this.mapIndex.length; i++) {
            if (this.mapIndex[i] === map) {
                if (type === 0) {
                    return this.mapLand[i];
                } else {
                    return this.mapLoc[i];
                }
            }
        }

        return -1;
    }

    async prefetchMaps(members: boolean) {
        const count = this.mapIndex.length;
        for (let i = 0; i < count; i++) {
            if (members || this.mapMembers[i] !== 0) {
                await this.prefetchPriority(3, this.mapLoc[i], 2);
                await this.prefetchPriority(3, this.mapLand[i], 2);
            }
        }
    }

    hasMapLocFile(file: number) {
        for (let i = 0; i < this.mapIndex.length; i++) {
            if (this.mapLoc[i] === file) {
                return true;
            }
        }

        return false;
    }

    getModelUse(id: number) {
        return this.modelUse[id] & 0xff;
    }

    isMidiJingle(id: number) {
        return this.midiJingle[id] === 1;
    }

    requestModel(id: number) {
        this.request(0, id);
    }

    request(archive: number, file: number) {
        if (archive < 0 || archive > this.versions.length || file < 0 || file > this.versions[archive].length || this.versions[archive][file] === 0) {
            return;
        }

        for (let req = this.requests.head(); req !== null; req = this.requests.next()) {
            if (req.archive === archive && req.file === file) {
                return;
            }
        }

        const req = new OnDemandRequest();
        req.archive = archive;
        req.file = file;
        req.urgent = true;

        this.queue.push(req);
        this.requests.push(req);
    }

    remaining() {
        return this.requests.size();
    }

    loop(): OnDemandRequest | null {
        const req = this.completed.popFront();
        if (req === null) {
            return null;
        }

        req.unlink2();

        if (req.data === null) {
            return req;
        }

        req.data = gunzipSync(req.data.slice(0, req.data.length - 2));
        return req;
    }

    async prefetchPriority(archive: number, file: number, priority: number) {
        if (!this.app.db || this.versions[archive][file] === 0) {
            return;
        }

        const data = await this.app.db.read(archive + 1, file);
        if (this.validate(data, this.crcs[archive][file], this.versions[archive][file])) {
            return;
        }

        this.priorities[archive][file] = priority;
        if (priority > this.topPriority) {
            this.topPriority = priority;
        }

        this.totalPrefetchFiles++;
    }

    clearPrefetches() {
        this.prefetches.clear();
    }

    prefetch(archive: number, file: number) {
        if (!this.app.db || this.versions[archive][file] === 0 || this.priorities[archive][file] === 0 || this.topPriority === 0) {
            return;
        }

        const req = new OnDemandRequest();
        req.archive = archive;
        req.file = file;
        req.urgent = false;

        this.prefetches.push(req);
    }

    async run() {
        if (!this.running) {
            return;
        }

        this.cycle++;

        this.active = true;

        for (let i = 0; i < 100 && this.active; i++) {
            this.active = false;

            await this.handleQueue();
            await this.handlePending();

            if (this.importantCount === 0 && i >= 5) {
                break;
            }

            await this.handleExtras();
            await this.read();
        }

        let loading = false;

        for (let req = this.pending.head(); req !== null; req = this.pending.next()) {
            if (req.urgent) {
                loading = true;
                req.cycle++;

                if (req.cycle > 50) {
                    req.cycle = 0;
                    await this.send(req);
                }
            }
        }

        if (!loading) {
            for (let req = this.pending.head(); req !== null; req = this.pending.next()) {
                loading = true;
                req.cycle++;

                if (req.cycle > 50) {
                    req.cycle = 0;
                    await this.send(req);
                }
            }
        }

        if (loading) {
            this.packetCycle++;

            if (this.packetCycle > 750) {
                if (this.stream) {
                    this.stream.close();
                    this.stream = null;
                }

                this.partAvailable = 0;
            }
        } else {
            this.packetCycle = 0;
            this.message = '';
        }

        if (this.app.ingame && this.stream && (this.topPriority > 0 || !this.app.db)) {
            this.noTimeoutCycle++;

            if (this.noTimeoutCycle > 500) {
                this.noTimeoutCycle = 0;

                this.buf[0] = 0;
                this.buf[1] = 0;
                this.buf[2] = 0;
                this.buf[3] = 10;

                this.stream.write(this.buf, 4);
            }
        }
    }

    async handleQueue() {
        let req = this.queue.popFront();

        while (req !== null) {
            this.active = true;
            let data: Uint8Array | undefined;

            if (this.app.db) {
                data = await this.app.db.read(req.archive + 1, req.file);
            }

            if (!this.validate(data, this.crcs[req.archive][req.file], this.versions[req.archive][req.file])) {
                data = undefined;
            }

            if (!data) {
                this.missing.push(req);
            } else {
                req.data = data;
                this.completed.push(req);
            }

            req = this.queue.popFront();
        }
    }

    async handlePending() {
        this.importantCount = 0;
        this.requestCount = 0;

        for (let req = this.pending.head(); req !== null; req = this.pending.next()) {
            if (req.urgent) {
                this.importantCount++;
            } else {
                this.requestCount++;
            }
        }

        while (this.importantCount < 10) {
            const req = this.missing.popFront();
            if (req === null) {
                break;
            }

            if (this.priorities[req.archive][req.file] !== 0) {
                this.loadedPrefetchFiles++;
            }

            this.priorities[req.archive][req.file] = 0;
            this.pending.push(req);
            this.importantCount++;
            await this.send(req);
            this.active = true;
        }
    }

    async handleExtras() {
        while (this.importantCount === 0 && this.requestCount < 10) {
            if (this.topPriority === 0) {
                return;
            }

            let extra = this.prefetches.popFront();
            while (extra !== null) {
                if (this.priorities[extra.archive][extra.file] !== 0) {
                    this.priorities[extra.archive][extra.file] = 0;
                    this.pending.push(extra);
                    await this.send(extra);
                    this.active = true;

                    if (this.loadedPrefetchFiles < this.totalPrefetchFiles) {
                        this.loadedPrefetchFiles++;
                    }

                    this.message = 'Loading extra files - ' + (((this.loadedPrefetchFiles * 100) / this.totalPrefetchFiles) | 0) + '%';
                    this.requestCount++;

                    if (this.requestCount === 10) {
                        return;
                    }
                }

                extra = this.prefetches.popFront();
            }

            for (let archive = 0; archive < 4; archive++) {
                const priorities = this.priorities[archive];
                const count = priorities.length;

                for (let i = 0; i < count; i++) {
                    if (priorities[i] === this.topPriority) {
                        priorities[i] = 0;

                        const req = new OnDemandRequest();
                        req.archive = archive;
                        req.file = i;
                        req.urgent = false;
                        this.pending.push(req);
                        await this.send(req);
                        this.active = true;

                        if (this.loadedPrefetchFiles < this.totalPrefetchFiles) {
                            this.loadedPrefetchFiles++;
                        }

                        this.message = 'Loading extra files - ' + (((this.loadedPrefetchFiles * 100) / this.totalPrefetchFiles) | 0) + '%';
                        this.requestCount++;

                        if (this.requestCount === 10) {
                            return;
                        }
                    }
                }
            }

            this.topPriority--;
        }
    }

    async read() {
        if (this.modernized) {
            for (let req = this.pending.head(); req !== null; req = this.pending.next()) {
                this.current = req;
                break;
            }

            if (this.current) {
                await this.downloadZip();

                if (!this.zip) {
                    return;
                }

                this.current.data = this.zip[`${this.current.archive + 1}.${this.current.file}`];

                if (!this.current.data) {
                    this.current.unlink();
                    this.current = null;
                    return;
                }

                if (this.app.db) {
                    await this.app.db.write(this.current.archive + 1, this.current.file, this.current.data);
                }

                if (!this.current.urgent && this.current.archive === 3) {
                    this.current.urgent = true;
                    this.current.archive = 93;
                }

                if (this.current.urgent) {
                    this.completed.push(this.current);
                } else {
                    this.current.unlink();
                }

                this.current = null;
            }
        } else {
            if (!this.stream) {
                return;
            }

            try {
                const available = this.stream.available;

                if (this.partAvailable === 0 && available >= 6) {
                    this.active = true;

                    await this.stream.readBytes(this.buf, 0, 6);
                    const archive = this.buf[0] & 0xff;
                    const file = ((this.buf[1] & 0xff) << 8) + (this.buf[2] & 0xff);
                    const size = ((this.buf[3] & 0xff) << 8) + (this.buf[4] & 0xff);
                    const part = this.buf[5] & 0xff;

                    this.current = null;

                    for (let req = this.pending.head(); req !== null; req = this.pending.next()) {
                        if (req.archive === archive && req.file === file) {
                            this.current = req;
                        }

                        if (this.current !== null) {
                            req.cycle = 0;
                        }
                    }

                    if (this.current) {
                        this.packetCycle = 0;

                        if (size === 0) {
                            console.error('rej: ' + archive + ',' + file);

                            this.current.data = null;

                            if (this.current.urgent) {
                                this.completed.push(this.current);
                            } else {
                                this.current.unlink();
                            }

                            this.current = null;
                        } else {
                            if (this.current.data === null && part === 0) {
                                this.current.data = new Uint8Array(size);
                            }

                            if (this.current.data === null && part !== 0) {
                                console.error('missing start of file');
                                throw new Error();
                            }
                        }
                    }

                    this.partOffset = part * 500;
                    this.partAvailable = 500;

                    if (this.partAvailable > size - part * 500) {
                        this.partAvailable = size - part * 500;
                    }
                }

                if (this.partAvailable > 0 && available >= this.partAvailable) {
                    this.active = true;

                    let dst = this.buf;
                    let off = 0;

                    if (this.current && this.current.data) {
                        dst = this.current.data;
                        off = this.partOffset;
                    }

                    await this.stream.readBytes(dst, off, this.partAvailable);

                    if (this.partAvailable + this.partOffset >= dst.length && this.current) {
                        if (this.app.db) {
                            await this.app.db.write(this.current.archive + 1, this.current.file, dst);
                        }

                        if (!this.current.urgent && this.current.archive === 3) {
                            this.current.urgent = true;
                            this.current.archive = 93;
                        }

                        if (this.current.urgent) {
                            this.completed.push(this.current);
                        } else {
                            this.current.unlink();
                        }
                    }

                    this.partAvailable = 0;
                }
            } catch (e) {
                console.error(e);

                if (this.stream) {
                    this.stream.close();
                }

                this.stream = null;
                this.partAvailable = 0;
            }
        }
    }

    validate(src: Uint8Array | undefined, expectedCrc: number, expectedVersion: number) {
        if (typeof src === 'undefined' || src.length < 2) {
            return false;
        }

        const trailerPos = src.length - 2;

        const version = ((src[trailerPos] & 0xff) << 8) + (src[trailerPos + 1] & 0xff);
        const crc = Packet.getcrc(src, 0, src.length - 2);

        return version === expectedVersion && crc === expectedCrc;
    }

    async send(req: OnDemandRequest) {
        if (this.modernized) {
            // handled by the reader
            return;
        }

        try {
            if (this.stream === null) {
                const now = performance.now();
                if (now - this.socketOpenTime < 5000) {
                    return;
                }

                this.socketOpenTime = now;
                const serverHost = typeof window.SERVER_HOST !== 'undefined' ? window.SERVER_HOST : window.location.host;
                const serverSecured = typeof window.SERVER_SECURED !== 'undefined' ? window.SERVER_SECURED : window.location.protocol === 'https:';
                this.stream = new ClientStream(await ClientStream.openSocket(serverHost, serverSecured));

                this.buf[0] = 15;
                this.stream.write(this.buf, 1);

                for (let i = 0; i < 8; i++) {
                    await this.stream.read();
                }

                this.packetCycle = 0;
            }

            this.buf[0] = req.archive;
            this.buf[1] = req.file >> 8;
            this.buf[2] = req.file;

            if (req.urgent) {
                this.buf[3] = 2;
            } else if (this.app.ingame) {
                this.buf[3] = 0;
            } else {
                this.buf[3] = 1;
            }

            this.stream.write(this.buf, 4);
            this.noTimeoutCycle = 0;
        } catch (e) {
            console.error(e);

            this.stream = null;
            this.partAvailable = 0;
        }
    }

    lastZipError: string = '';

    async downloadZip() {
        if (this.zip) {
            return;
        }
        try {
            const data = await downloadUrl('/ondemand.zip');
            this.zip = unzipSync(data);
            this.lastZipError = '';
        } catch (e) {
            // Don't retry here — let the caller retry on the next tick
            // so the game loop is not blocked for 1000ms per attempt.
            this.lastZipError = String(e);
        }
    }

    async prefetchAll() {
        let success = false;
        for (let retry = 0; retry < 3 && !success; retry++) {
            if (!this.app.db) {
                return;
            }

            const remote = await downloadUrl('/build');
            const local = await this.app.db.cacheload('build');

            if (typeof local !== 'undefined' && local[0] === remote[0] && local[1] === remote[1] && local[2] === remote[2] && local[3] === remote[3]) {
                break;
            }

            await this.app.db.cachesave('build', remote);

            try {
                const zip = unzipSync(await downloadUrl('/ondemand.zip'));

                const start = performance.now();
                for (let archive = 0; archive < 4; archive++) {
                    const count = this.versions[archive].length;

                    for (let file = 0; file < count; file++) {
                        const data = zip[`${archive + 1}.${file}`];
                        if (typeof data === 'undefined') {
                            continue;
                        }

                        const existing = await this.app.db.read(archive + 1, file);
                        if (!existing || !this.validate(existing, this.crcs[archive][file], this.versions[archive][file])) {
                            await this.app.db.write(archive + 1, file, data);
                        }

                        if (file % 100 === 0 && performance.now() - start > 15_000) {
                            // user's CPU or I/O is too slow, since this is blocking playing it's better to operate in memory only
                            this.app.db = null;
                            return;
                        }
                    }
                }

                success = true;
            } catch (e) {
                console.error(e);
            }
        }
    }
}
