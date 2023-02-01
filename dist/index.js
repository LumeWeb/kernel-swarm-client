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
        return this.callModuleReturn("ready", { swarm: this.swarm });
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
    on(eventName, listener) {
        const [update, promise] = this.connectModule("listenSocketEvent", { id: this.id, event: eventName }, (data) => {
            this.emit(eventName, data);
        });
        this.trackEvent(eventName, update);
        promise.then(() => {
            this.off(eventName, listener);
        });
        return super.on(eventName, listener);
    }
    off(type, listener) {
        const updates = [...this.eventUpdates[type]];
        this.eventUpdates[type] = [];
        for (const func of updates) {
            func({ action: "off" });
        }
        return super.off(type, listener);
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
