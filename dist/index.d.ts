/// <reference types="node" />
import { Buffer } from "buffer";
import { Client } from "@lumeweb/libkernel-universal";
import { ErrTuple } from "@siaweb/libweb";
import type { EventEmitter } from "eventemitter3";
export declare class SwarmClient extends Client {
    private useDefaultSwarm;
    private id;
    private _autoReconnect;
    private _connectBackoff;
    private _ready?;
    private _topics;
    constructor(useDefaultDht?: boolean, autoReconnect?: boolean);
    get swarm(): number | undefined;
    connect(pubkey: string | Uint8Array): Promise<Socket>;
    init(): Promise<ErrTuple>;
    ready(): Promise<void>;
    start(): Promise<void>;
    private _listen;
    addRelay(pubkey: string): Promise<void>;
    removeRelay(pubkey: string): Promise<void>;
    clearRelays(): Promise<void>;
    getRelays(): Promise<string[]>;
    join(topic: Buffer | Uint8Array): Promise<void>;
}
export declare class Socket extends Client {
    private id;
    private eventUpdates;
    constructor(id: number);
    private _remotePublicKey?;
    get remotePublicKey(): Uint8Array;
    private _rawStream?;
    get rawStream(): Uint8Array;
    setup(): Promise<void>;
    on<T extends EventEmitter.EventNames<string | symbol>>(event: T, fn: EventEmitter.EventListener<string | symbol, T>, context?: any): this;
    onSelf<T extends EventEmitter.EventNames<string | symbol>>(event: T, fn: EventEmitter.EventListener<string | symbol, T>, context?: any): this;
    off<T extends EventEmitter.EventNames<string | symbol>>(event: T, fn?: EventEmitter.EventListener<string | symbol, T>, context?: any, once?: boolean): this;
    offSelf<T extends EventEmitter.EventNames<string | symbol>>(event: T, fn?: EventEmitter.EventListener<string | symbol, T>, context?: any, once?: boolean): this;
    write(message: string | Buffer): void;
    end(): void;
    private ensureEvent;
    private trackEvent;
}
export declare const createClient: (...args: any) => SwarmClient;
//# sourceMappingURL=index.d.ts.map