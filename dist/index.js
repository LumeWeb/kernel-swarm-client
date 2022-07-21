import { EventEmitter } from "events";
const DHT_MODULE = "AQD1IgE4lTZkq1fqdoYGojKRNrSk0YQ_wrHbRtIiHDrnow";
let callModule, connectModule;
async function loadLibs() {
    if (callModule && connectModule) {
        return;
    }
    if (typeof window !== "undefined" && window?.document) {
        const pkg = (await import("libkernel"));
        callModule = pkg.callModule;
        connectModule = pkg.connectModule;
    }
    else {
        const pkg = (await import("libkmodule"));
        callModule = pkg.callModule;
        connectModule = pkg.connectModule;
    }
}
export class DHT {
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
        return callModule(DHT_MODULE, "ready");
    }
    async addRelay(pubkey) {
        await loadLibs();
        const [, err] = await callModule(DHT_MODULE, "addRelay", { pubkey });
        if (err) {
            throw new Error(err);
        }
    }
    async removeRelay(pubkey) {
        await loadLibs();
        const [, err] = await callModule(DHT_MODULE, "removeRelay", { pubkey });
        if (err) {
            throw new Error(err);
        }
    }
    async clearRelays() {
        await loadLibs();
        await callModule(DHT_MODULE, "clearRelays");
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
