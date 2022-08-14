/// <reference types="node" />
/// <reference types="node" />
import { EventEmitter } from "events";
import { ErrTuple } from "libskynet";
import { Buffer } from "buffer";
export declare class DHT {
    private useDefaultDht;
    private id;
    constructor(useDefaultDht?: boolean);
    connect(pubkey: string): Promise<Socket>;
    ready(): Promise<ErrTuple>;
    addRelay(pubkey: string): Promise<void>;
    removeRelay(pubkey: string): Promise<void>;
    clearRelays(): Promise<void>;
    getRelays(): Promise<string[]>;
    getRelayServers(): Promise<string[]>;
    private create;
    close(): Promise<boolean>;
    private setup;
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