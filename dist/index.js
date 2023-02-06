import { Client, factory } from "@lumeweb/libkernel-universal";
import { hexToBuf } from "@siaweb/libweb";
export class SwarmClient extends Client {
    useDefaultSwarm;
    id = 0;
    get swarm() {
        return this.useDefaultSwarm ? undefined : this.id;
    }
    constructor(useDefaultDht = true) {
        super();
        this.useDefaultSwarm = useDefaultDht;
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
        return this.callModuleReturn("init", { swarm: this.swarm });
    }
    async ready() {
        await this.callModuleReturn("ready", { swarm: this.swarm });
        this.connectModule("listenConnections", { swarm: this.swarm }, (socketId) => {
            this.emit("connection", createSocket(socketId));
        });
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
    on(event, fn, context) {
        const [update, promise] = this.connectModule("listenSocketEvent", { id: this.id, event: event }, (data) => {
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
        this.callModule("write", { id: this.id, message });
    }
    end() {
        this.callModule("socketExists", { id: this.id }).then(([exists]) => {
            if (exists) {
                this.callModule("close", { id: this.id });
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
const createSocket = factory(Socket, MODULE);
