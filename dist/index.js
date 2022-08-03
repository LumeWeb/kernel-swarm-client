import { EventEmitter } from "events";
import { create } from "domain";
const DHT_MODULE = "AQD1IgE4lTZkq1fqdoYGojKRNrSk0YQ_wrHbRtIiHDrnow";
let callModule, connectModule;
async function loadLibs() {
    if (callModule && connectModule) {
        return;
    }
    if (typeof window !== "undefined" && window?.document) {
        const pkg = await import("libkernel");
        callModule = pkg.callModule;
        connectModule = pkg.connectModule;
    }
    else {
        const pkg = await import("libkmodule");
        callModule = pkg.callModule;
        connectModule = pkg.connectModule;
    }
}
export class DHT {
    useDefaultDht;
    id = 0;
    constructor(useDefaultDht = true) {
        this.useDefaultDht = useDefaultDht;
        return create();
    }
    async connect(pubkey) {
        await loadLibs();
        const [resp, err] = await callModule(DHT_MODULE, "connect", { pubkey });
        if (err) {
            throw new Error(err);
        }
        return new Socket(resp.id);
    }
    async ready() {
        await loadLibs();
        const dht = !this.useDefaultDht ? this.id : undefined;
        return callModule(DHT_MODULE, "ready", { dht });
    }
    async addRelay(pubkey) {
        await loadLibs();
        const dht = !this.useDefaultDht ? this.id : undefined;
        const [, err] = await callModule(DHT_MODULE, "addRelay", { pubkey, dht });
        if (err) {
            throw new Error(err);
        }
    }
    async removeRelay(pubkey) {
        await loadLibs();
        const dht = !this.useDefaultDht ? this.id : undefined;
        const [, err] = await callModule(DHT_MODULE, "removeRelay", {
            pubkey,
            dht,
        });
        if (err) {
            throw new Error(err);
        }
    }
    async clearRelays() {
        await loadLibs();
        const dht = !this.useDefaultDht ? this.id : undefined;
        await callModule(DHT_MODULE, "clearRelays", { dht });
    }
    async create() {
        await loadLibs();
        if (this.useDefaultDht) {
            return Promise.resolve();
        }
        const [dht, err] = await callModule(DHT_MODULE, "openDht");
        if (err) {
            throw new Error(err);
        }
        this.id = dht;
    }
    async close() {
        await loadLibs();
        if (this.useDefaultDht) {
            return false;
        }
        const [, err] = await callModule(DHT_MODULE, "closeDht", { dht: this.id });
        if (err) {
            throw new Error(err);
        }
        return true;
    }
}
export class Socket extends EventEmitter {
    id;
    eventUpdates = {};
    constructor(id) {
        super();
        this.id = id;
    }
    on(eventName, listener) {
        const [update, promise] = connectModule(DHT_MODULE, "listenSocketEvent", { id: this.id, event: eventName }, (data) => {
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
        callModule(DHT_MODULE, "write", { id: this.id, message });
    }
    end() {
        callModule(DHT_MODULE, "close", { id: this.id });
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
