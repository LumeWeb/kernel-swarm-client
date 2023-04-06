import { Client, factory } from "@lumeweb/libkernel-universal";
import { hexToBuf } from "@siaweb/libweb";
import { blake2b } from "@noble/hashes/blake2b";
import b4a from "b4a";
// @ts-ignore
import Backoff from "backoff.js";
import { Mutex } from "async-mutex";
// @ts-ignore
import Protomux from "protomux";
import defer from "p-defer";
export class SwarmClient extends Client {
    useDefaultSwarm;
    id = 0;
    _autoReconnect;
    _connectBackoff;
    _ready;
    _connectionListener;
    _topics = new Set();
    _sockets = new Map();
    get dht() {
        const self = this;
        return {
            async ready() {
                return self.ready();
            },
        };
    }
    constructor(useDefaultDht = true, autoReconnect = false) {
        super();
        this.useDefaultSwarm = useDefaultDht;
        this._autoReconnect = autoReconnect;
        this._connectBackoff = new Backoff({
            strategy: "fibo",
            maxAttempts: Number.MAX_SAFE_INTEGER,
        });
        this._connectBackoff.on("retry", (error) => {
            this.logErr(error);
        });
    }
    get swarm() {
        return this.useDefaultSwarm ? undefined : this.id;
    }
    async connect(pubkey) {
        if (typeof pubkey === "string") {
            const buf = hexToBuf(pubkey);
            pubkey = this.handleErrorOrReturn(buf);
        }
        let existing = Array.from(this._sockets.values()).filter((socket) => {
            return b4a.equals(socket.remotePublicKey, pubkey);
        });
        if (existing.length) {
            return existing[0];
        }
        throw new Error("not implemented");
    }
    async init() {
        return await this.callModuleReturn("init", { swarm: this.swarm });
    }
    async ready() {
        if (this._ready) {
            return this._ready;
        }
        this._listen();
        this._ready = this.callModuleReturn("ready", { swarm: this.swarm });
        await this._ready;
        this._ready = undefined;
        for (const topic of this._topics) {
            await this.join(topic);
        }
    }
    async start() {
        await this._connectBackoff.run(() => this.init());
        await this.ready();
    }
    async _listen() {
        if (!this._connectionListener) {
            this._connectionListener = this.connectModule("listenConnections", { swarm: this.swarm }, async (socketId) => {
                const socket = this._sockets.get(socketId) ?? (await createSocket(socketId, this));
                socket.on("close", () => {
                    this._sockets.delete(socketId);
                });
                if (!this._sockets.has(socketId)) {
                    this._sockets.set(socketId, socket);
                }
                this.emit("connection", socket);
            });
        }
        await this._connectionListener[1];
        this._connectionListener = undefined;
        this.start();
    }
    async addRelay(pubkey) {
        return this.callModuleReturn("addRelay", { pubkey, swarm: this.swarm });
    }
    async removeRelay(pubkey) {
        return this.callModuleReturn("removeRelay", { pubkey, swarm: this.swarm });
    }
    async clearRelays() {
        return this.callModuleReturn("clearRelays", { swarm: this.swarm });
    }
    async getRelays() {
        return this.callModuleReturn("getRelays", { swarm: this.swarm });
    }
    async join(topic) {
        if (typeof topic === "string") {
            topic = blake2b(topic, { dkLen: 32 });
        }
        this._topics.add(topic);
        this.callModule("join", { id: this.id, topic });
    }
}
export class Socket extends Client {
    id;
    eventUpdates = {};
    syncMutex = new Mutex();
    swarm;
    userData = null;
    constructor(id, swarm) {
        super();
        this.id = id;
        this.swarm = swarm;
    }
    _remotePublicKey;
    get remotePublicKey() {
        return this._remotePublicKey;
    }
    _rawStream;
    get rawStream() {
        return this._rawStream;
    }
    async setup() {
        let info = await this.callModuleReturn("socketGetInfo", { id: this.id });
        this._remotePublicKey = info.remotePublicKey;
        this._rawStream = info.rawStream;
        this._initSync();
    }
    async _initSync() {
        this.userData = null;
        const mux = Protomux.from(this);
        let updateSent = defer();
        let updateReceived = defer();
        const setup = defer();
        const [update] = this.connectModule("syncProtomux", { id: this.id }, async (data) => {
            if (data === true) {
                updateSent.resolve();
                updateSent = defer();
                return;
            }
            await this.syncMutex.acquire();
            ["remote", "local"].forEach((field) => {
                const rField = `_${field}`;
                data[field].forEach((item) => {
                    if (!mux[rField][item]) {
                        while (item > mux[rField].length) {
                            mux[rField].push(null);
                        }
                    }
                    if (!mux[rField][item]) {
                        mux[rField][item] = null;
                    }
                });
            });
            data.free.forEach((index) => {
                if (mux._free[index] === null) {
                    mux._free[index] = undefined;
                }
            });
            mux._free = mux._free.filter((item) => item !== undefined);
            this.syncMutex.release();
            setup.resolve();
            updateReceived.resolve();
        });
        const send = async (mux) => {
            update({
                remote: Object.keys(mux._remote),
                local: Object.keys(mux._local),
                free: mux._free,
            });
            updateReceived = defer();
            await updateSent.promise;
            await updateReceived.promise;
        };
        mux.syncState = send.bind(undefined, mux);
        await setup.promise;
        this.swarm.emit("setup", this);
    }
    on(event, fn, context) {
        const [update, promise] = this.connectModule("socketListenEvent", { id: this.id, event: event }, (data) => {
            this.emit(event, data);
        });
        this.trackEvent(event, update);
        promise.then(() => {
            this.off(event, fn);
        });
        return super.on(event, fn, context);
    }
    off(event, fn, context, once) {
        const updates = [...this.eventUpdates[event]];
        this.eventUpdates[event] = [];
        for (const func of updates) {
            func();
        }
        return super.off(event, fn, context, once);
    }
    write(message) {
        this.callModule("socketWrite", { id: this.id, message });
    }
    end() {
        this.callModule("socketExists", { id: this.id }).then(([exists]) => {
            if (exists) {
                this.callModule("socketClose", { id: this.id });
            }
        });
    }
    ensureEvent(event) {
        if (!(event in this.eventUpdates)) {
            this.eventUpdates[event] = [];
        }
    }
    trackEvent(event, update) {
        this.ensureEvent(event);
        this.eventUpdates[event].push(update);
    }
}
const MODULE = "_AVKgzVYC8Sb_qiTA6kw5BDzQ4Ch-8D4sldQJl8dXF9oTw";
export const createClient = factory(SwarmClient, MODULE);
const socketFactory = factory(Socket, MODULE);
const createSocket = async (...args) => {
    const socket = socketFactory(...args);
    await socket.setup();
    return socket;
};
