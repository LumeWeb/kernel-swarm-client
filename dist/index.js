import { callModule as callModuleKernel, connectModule as connectModuleKernel, } from "libkernel";
import { callModule as callModuleModule, connectModule as connectModuleModule, } from "libkmodule";
import { EventEmitter } from "events";
const DHT_MODULE = "AQD1IgE4lTZkq1fqdoYGojKRNrSk0YQ_wrHbRtIiHDrnow";
let callModule, connectModule;
if (window.document) {
    callModule = callModuleKernel;
    connectModule = connectModuleKernel;
}
else {
    callModule = callModuleModule;
    connectModule = connectModuleModule;
}
export class DHT {
    async connect(pubkey) {
        const [resp, err] = await callModule(DHT_MODULE, "connect", { pubkey });
        if (err) {
            throw new Error(err);
        }
        return new Socket(resp.id);
    }
    async ready() {
        return callModule(DHT_MODULE, "ready");
    }
    async addRelay(pubkey) {
        const [, err] = await callModule(DHT_MODULE, "addRelay", { pubkey });
        if (err) {
            throw new Error(err);
        }
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
