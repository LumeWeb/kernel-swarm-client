import { Client, factory } from "@lumeweb/libkernel-universal";
import { hexToBuf } from "@siaweb/libweb";
import { blake2b } from "@noble/hashes/blake2b";
// @ts-ignore
import Backoff from "backoff.js";
const PROTOCOL = "lumeweb.proxy.handshake";
export class SwarmClient extends Client {
    useDefaultSwarm;
    id = 0;
    _autoReconnect;
    _connectBackoff;
    _ready;
    _topics = new Set();
    constructor(useDefaultDht = true, autoReconnect = false) {
        super();
        this.useDefaultSwarm = useDefaultDht;
        this._autoReconnect = autoReconnect;
        this._connectBackoff = new Backoff({
            strategy: "fibo",
            maxAttempts: Number.MAX_SAFE_INTEGER,
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
        const resp = this.callModuleReturn("connect", {
            pubkey,
            swarm: this.swarm,
        });
        return createSocket(resp.id);
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
        this._connectBackoff.on("retry", (error) => {
            this.logErr(error);
        });
        await this.ready();
    }
    async _listen() {
        const connect = this.connectModule("listenConnections", { swarm: this.swarm }, async (socketId) => {
            this.emit("connection", await createSocket(socketId));
        });
        await connect[1];
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
            topic = blake2b(PROTOCOL);
        }
        this._topics.add(topic);
        this.callModule("join", { id: this.id, topic });
    }
}
export class Socket extends Client {
    id;
    eventUpdates = {};
    constructor(id) {
        super();
        this.id = id;
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
    onSelf(event, fn, context) {
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
    offSelf(event, fn, context, once) {
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
const MODULE = "_A7ClA0mSa1-Pg5c4V3C0H_fnhAFjgccITYT83Euc7t_9A";
export const createClient = factory(SwarmClient, MODULE);
const socketFactory = factory(Socket, MODULE);
const createSocket = async (...args) => {
    const socket = socketFactory(...args);
    await socket.setup();
    return socket;
};
