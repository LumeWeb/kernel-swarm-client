/// <reference types="node" />
import { Buffer } from "buffer";
import { Client } from "@lumeweb/libkernel-universal";
import { ErrTuple } from "@siaweb/libweb";
import type { eventNS, event, ListenerFn, OnOptions, Listener } from "eventemitter2";
export declare class SwarmClient extends Client {
    private useDefaultSwarm;
    private id;
    private _autoReconnect;
    private _connectBackoff;
    private _ready?;
    private _connectionListener?;
    private _topics;
    private _sockets;
    get dht(): {
        ready(): Promise<void>;
    };
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
    join(topic: Buffer | Uint8Array | string): Promise<void>;
}
export declare class Socket extends Client {
    private id;
    private eventUpdates;
    private syncMutex;
    private swarm;
    private userData?;
    constructor(id: number, swarm: SwarmClient);
    private _remotePublicKey?;
    get remotePublicKey(): Uint8Array;
    private _rawStream?;
    get rawStream(): Uint8Array;
    setup(): Promise<void>;
    on(event: event | eventNS, listener: ListenerFn, options?: boolean | OnOptions): this | Listener;
    off(event: event | eventNS, listener: ListenerFn): this;
    write(message: string | Buffer): void;
    end(): void;
    private ensureEvent;
    private trackEvent;
}
export declare const MODULE = "_AU-CzTIzrnnJSoVjfWG_d3cAb8_hONuZ1XaqbFlygrFlg";
export declare const createClient: (...args: any) => SwarmClient;
//# sourceMappingURL=index.d.ts.map