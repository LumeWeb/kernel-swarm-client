import {
    callModule as callModuleKernel,
    connectModule as connectModuleKernel,
} from "libkernel";
import {
    callModule as callModuleModule,
    connectModule as connectModuleModule,
} from "libkmodule";
import {EventEmitter} from "events";
import {DataFn, ErrTuple} from "libskynet";
import {Buffer} from "buffer";

const DHT_MODULE = "AQD1IgE4lTZkq1fqdoYGojKRNrSk0YQ_wrHbRtIiHDrnow";

let callModule: typeof callModuleModule,
    connectModule: typeof connectModuleModule;

if (typeof window !== "undefined" && window?.document) {
    callModule = callModuleKernel;
    connectModule = connectModuleKernel;
} else {
    callModule = callModuleModule;
    connectModule = connectModuleModule;
}

export class DHT {
    public async connect(pubkey: string): Promise<Socket> {
        const [resp, err] = await callModule(DHT_MODULE, "connect", {pubkey});
        if (err) {
            throw new Error(err);
        }
        return new Socket(resp.id);
    }

    async ready(): Promise<ErrTuple> {
        return callModule(DHT_MODULE, "ready");
    }

    public async addRelay(pubkey: string): Promise<void> {
        const [, err] = await callModule(DHT_MODULE, "addRelay", {pubkey});
        if (err) {
            throw new Error(err);
        }
    }

    public async removeRelay(pubkey: string): Promise<void> {
        const [, err] = await callModule(DHT_MODULE, "removeRelay", {pubkey});
        if (err) {
            throw new Error(err);
        }
    }

    public async clearRelays(): Promise<void> {
        await callModule(DHT_MODULE, "clearRelays");
    }
}

export class Socket extends EventEmitter {
    private id: number;
    private eventUpdates: { [event: string]: DataFn[] } = {};

    constructor(id: number) {
        super();
        this.id = id;
    }

    on(eventName: string, listener: (...args: any[]) => void): this {
        const [update, promise] = connectModule(
            DHT_MODULE,
            "listenSocketEvent",
            {id: this.id, event: eventName},
            (data: any) => {
                this.emit(eventName, data);
            }
        );
        this.trackEvent(eventName, update);

        promise.then(() => {
            this.off(eventName, listener);
        });

        return super.on(eventName, listener);
    }

    off(type: string, listener: any): this {
        const updates = [...this.eventUpdates[type]];
        this.eventUpdates[type] = [];
        for (const func of updates) {
            func({action: "off"});
        }
        return super.off(type, listener);
    }

    write(message: string | Buffer): void {
        callModule(DHT_MODULE, "write", {id: this.id, message});
    }

    end(): void {
        callModule(DHT_MODULE, "close", {id: this.id});
    }

    private ensureEvent(event: string): void {
        if (!(event in this.eventUpdates)) {
            this.eventUpdates[event] = [];
        }
    }

    private trackEvent(event: string, update: DataFn): void {
        this.ensureEvent(event as string);
        this.eventUpdates[event].push(update);
    }
}
