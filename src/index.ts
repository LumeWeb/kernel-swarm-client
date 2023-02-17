import { Buffer } from "buffer";
import { Client, factory } from "@lumeweb/libkernel-universal";
import { hexToBuf, DataFn, ErrTuple } from "@siaweb/libweb";

import type { EventEmitter } from "eventemitter3";

import backoff, { Backoff } from "backoff";

export class SwarmClient extends Client {
  private useDefaultSwarm: boolean;
  private id: number = 0;
  private _autoReconnect: boolean;
  private _connectBackoff: Backoff;

  private _ready?: Promise<void>;

  constructor(useDefaultDht = true, autoReconnect = false) {
    super();
    this.useDefaultSwarm = useDefaultDht;
    this._autoReconnect = autoReconnect;
    this._connectBackoff = backoff.fibonacci();

    this._connectBackoff.on("ready", () => {
      this.start();
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
    const ret = await this.callModuleReturn("init", { swarm: this.swarm });
    this._connectBackoff.reset();

    return ret;
  }
  async ready(): Promise<void> {
    if (this._ready) {
      return this._ready;
    }

    this.connectModule(
      "listenConnections",
      { swarm: this.swarm },
      async (socketId: any) => {
        this.emit("connection", await createSocket(socketId));
      }
    );

    this._ready = this.callModuleReturn("ready", { swarm: this.swarm });

    await this._ready;

    this._ready = undefined;
  }

  async start(): Promise<void> {
    const backoff = () => setImmediate(() => this._connectBackoff.backoff());

    try {
      await this.init();
    } catch (e) {
      this.logErr(e);
      backoff();
      return;
    }

    await this.ready();
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

  public async join(topic: Buffer): Promise<void> {
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

const MODULE = "_A7ClA0mSa1-Pg5c4V3C0H_fnhAFjgccITYT83Euc7t_9A";

export const createClient = factory<SwarmClient>(SwarmClient, MODULE);

const socketFactory = factory<Socket>(Socket, MODULE);
const createSocket = async (...args: any): Promise<Socket> => {
  const socket = socketFactory(...args);

  await socket.setup();

  return socket;
};
