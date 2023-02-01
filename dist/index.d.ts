/// <reference types="node" />
import { Buffer } from "buffer";
import { Client } from "@lumeweb/libkernel-universal";
import { ErrTuple } from "@siaweb/libweb";
export declare class SwarmClient extends Client {
    private useDefaultSwarm;
    private id;
    get swarm(): number | undefined;
    constructor(useDefaultDht?: boolean);
    connect(pubkey: string | Uint8Array): Promise<Socket>;
    init(): Promise<ErrTuple>;
    ready(): Promise<ErrTuple>;
    addRelay(pubkey: string): Promise<void>;
    removeRelay(pubkey: string): Promise<void>;
    clearRelays(): Promise<void>;
    getRelays(): Promise<string[]>;
    join(topic: Buffer): Promise<void>;
}
export declare class Socket extends Client {
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
export declare const createClient: (...args: any) => SwarmClient;
//# sourceMappingURL=index.d.ts.map