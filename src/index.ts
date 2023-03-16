import { Buffer } from "buffer";
import { Client, factory } from "@lumeweb/libkernel-universal";
import { DataFn, ErrTuple, hexToBuf } from "@siaweb/libweb";
import { blake2b } from "@noble/hashes/blake2b";

import type { EventEmitter } from "eventemitter3";

// @ts-ignore
import Backoff from "backoff.js";

export class SwarmClient extends Client {
  private useDefaultSwarm: boolean;
  private id: number = 0;
  private _autoReconnect: boolean;
  private _connectBackoff: any;

  private _ready?: Promise<void>;

  private _topics: Set<Uint8Array> = new Set<Uint8Array>();

  constructor(useDefaultDht = true, autoReconnect = false) {
    super();
    this.useDefaultSwarm = useDefaultDht;
    this._autoReconnect = autoReconnect;
    this._connectBackoff = new Backoff({
      strategy: "fibo",
      maxAttempts: Number.MAX_SAFE_INTEGER,
    });
  }

  get swarm(): number | undefined {
    return this.useDefaultSwarm ? undefined : this.id;
  }

  public async connect(pubkey: string | Uint8Array): Promise<Socket> {
    if (typeof pubkey === "string") {
      const buf = hexToBuf(pubkey);
      pubkey = this.handleErrorOrReturn(buf);
    }

    const resp = this.callModuleReturn("connect", {
      pubkey,
      swarm: this.swarm,
    }) as any;

    return createSocket(resp.id);
  }
  async init(): Promise<ErrTuple> {
    return await this.callModuleReturn("init", { swarm: this.swarm });
  }
  async ready(): Promise<void> {
    if (this._ready) {
      return this._ready;
    }

    this._listen();

    this._ready = this.callModuleReturn("ready", { swarm: this.swarm });

    await this._ready;

    this._ready = undefined;

    for (const topic of this._topics) {
      await this.join(topic);
    }
  }

  async start(): Promise<void> {
    await this._connectBackoff.run(() => this.init());

    this._connectBackoff.on("retry", (error: any) => {
      this.logErr(error);
    });

    await this.ready();
  }

  private async _listen() {
    const connect = this.connectModule(
      "listenConnections",
      { swarm: this.swarm },
      async (socketId: any) => {
        this.emit("connection", await createSocket(socketId));
      }
    );

    await connect[1];
    this.start();
  }

  public async addRelay(pubkey: string): Promise<void> {
    return this.callModuleReturn("addRelay", { pubkey, swarm: this.swarm });
  }

  public async removeRelay(pubkey: string): Promise<void> {
    return this.callModuleReturn("removeRelay", { pubkey, swarm: this.swarm });
  }

  public async clearRelays(): Promise<void> {
    return this.callModuleReturn("clearRelays", { swarm: this.swarm });
  }
  public async getRelays(): Promise<string[]> {
    return this.callModuleReturn("getRelays", { swarm: this.swarm });
  }

  public async join(topic: Buffer | Uint8Array | string): Promise<void> {
    if (typeof topic === "string") {
      topic = blake2b(topic, { dkLen: 32 });
    }

    this._topics.add(topic);
    this.callModule("join", { id: this.id, topic });
  }
}

interface SocketRawStream {
  remoteHost: string;
  remotePort: number;
  remoteFamily: string;
}

export class Socket extends Client {
  private id: number;
  private eventUpdates: { [event: string]: DataFn[] } = {};

  constructor(id: number) {
    super();
    this.id = id;
  }

  private _remotePublicKey?: Uint8Array;

  get remotePublicKey(): Uint8Array {
    return this._remotePublicKey as Uint8Array;
  }

  private _rawStream?: Uint8Array;

  get rawStream(): Uint8Array {
    return this._rawStream as Uint8Array;
  }

  async setup() {
    let info = await this.callModuleReturn("socketGetInfo", { id: this.id });

    this._remotePublicKey = info.remotePublicKey;
    this._rawStream = info.rawStream;
  }

  on<T extends EventEmitter.EventNames<string | symbol>>(
    event: T,
    fn: EventEmitter.EventListener<string | symbol, T>,
    context?: any
  ): this {
    const [update, promise] = this.connectModule(
      "socketListenEvent",
      { id: this.id, event: event },
      (data: any) => {
        this.emit(event, data);
      }
    );
    this.trackEvent(event as string, update);

    promise.then(() => {
      this.off(event as string, fn);
    });

    return super.on(event, fn, context) as this;
  }

  off<T extends EventEmitter.EventNames<string | symbol>>(
    event: T,
    fn?: EventEmitter.EventListener<string | symbol, T>,
    context?: any,
    once?: boolean
  ): this {
    const updates = [...this.eventUpdates[event as string]];
    this.eventUpdates[event as string] = [];
    for (const func of updates) {
      func();
    }
    return super.off(event, fn, context, once);
  }

  write(message: string | Buffer): void {
    this.callModule("socketWrite", { id: this.id, message });
  }

  end(): void {
    this.callModule("socketExists", { id: this.id }).then(
      ([exists]: ErrTuple) => {
        if (exists) {
          this.callModule("socketClose", { id: this.id });
        }
      }
    );
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

const MODULE = "_A5eH4eOmFJF09HWAn5gJZ01Wm8FkYzxtCYustVPwvvBCA";

export const createClient = factory<SwarmClient>(SwarmClient, MODULE);

const socketFactory = factory<Socket>(Socket, MODULE);
const createSocket = async (...args: any): Promise<Socket> => {
  const socket = socketFactory(...args);

  await socket.setup();

  return socket;
};
