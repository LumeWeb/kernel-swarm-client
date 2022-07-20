/// <reference types="node" />
/// <reference types="node" />
import { EventEmitter } from "events";
import { ErrTuple } from "libskynet";
import { Buffer } from "buffer";
export declare class DHT {
    connect(pubkey: string): Promise<Socket>;
    ready(): Promise<ErrTuple>;
}
export declare class Socket extends EventEmitter {
    private id;
    private eventUpdates;
    constructor(id: number);
    on(eventName: string, listener: (...args: any[]) => void): this;
    off(type: string, listener: any): this;
    write(message: string | Buffer): void;
    end(): void;
    private ensureEvent;
    private trackEvent;
}
//# sourceMappingURL=index.d.ts.map