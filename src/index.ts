import { Buffer } from "buffer";
import { Client, factory } from "@lumeweb/libkernel/module";
import { DataFn, ErrTuple, hexToBuf, logErr } from "@lumeweb/libkernel";
import { blake2b } from "@noble/hashes/blake2b";
import b4a from "b4a";

// @ts-ignore
import Backoff from "backoff.js";
// @ts-ignore
import Protomux from "protomux";
import { UnsubscribeFn } from "emittery";

export class SwarmClient extends Client {
  private useDefaultSwarm: boolean;
  private id: number = 0;
  private _autoReconnect: boolean;
  private _connectBackoff: any;

  private _ready?: Promise<void>;
  private _connectionListener?: [
    sendUpdate: DataFn,
    response: Promise<ErrTuple>,
  ];

  private _topics: Set<Uint8Array> = new Set<Uint8Array>();
  private _sockets: Map<number, Socket> = new Map<number, Socket>();

  get dht() {
    const self = this;
    return {
      async ready() {
        return self.ready();
      },
    };
  }

  constructor(module: string, useDefaultDht = true, autoReconnect = false) {
    super(module);
    this.useDefaultSwarm = useDefaultDht;
    this._autoReconnect = autoReconnect;
    this._connectBackoff = new Backoff({
      strategy: "fibo",
      maxAttempts: Number.MAX_SAFE_INTEGER,
    });

    this._connectBackoff.on("retry", (error: any) => {
      logErr(error);
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

    let existing = Array.from(this._sockets.values()).filter((socket) => {
      return b4a.equals(socket.remotePublicKey, pubkey as Uint8Array);
    });

    if (existing.length) {
      return existing[0] as Socket;
    }

    throw new Error("not implemented");
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

    await this.ready();
  }

  private async _listen() {
    if (!this._connectionListener) {
      this._connectionListener = this.connectModule(
        "listenConnections",
        { swarm: this.swarm },
        async (socketId: any) => {
          const socket =
            this._sockets.get(socketId) ?? (await createSocket(socketId, this));

          socket.on("close", () => {
            this._sockets.delete(socketId);
          });

          if (!this._sockets.has(socketId)) {
            this._sockets.set(socketId, socket);
          }

          this.emit("connection", socket);
        },
      );
    }

    await this._connectionListener[1];
    this._connectionListener = undefined;
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
  private eventUpdates: { [event: string]: Map<Function, DataFn> } = {};

  private swarm: SwarmClient;
  private userData?: any = null;

  constructor(module: string, id: number, swarm: SwarmClient) {
    super(module);
    this.id = id;
    this.swarm = swarm;
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
    await this.swarm.emit("setup", this);
  }

  on(event: any, listener: any): UnsubscribeFn {
    const parentOn = super.on(event, listener);
    if (this.eventUpdates[event]?.has(listener)) {
      return parentOn;
    }

    const [update, promise] = this.connectModule(
      "socketListenEvent",
      { id: this.id, event: event },
      (data: any) => {
        this.emit(event, data);
      },
    );
    this.trackEvent(event as string, listener, update);

    promise.then(() => {
      this.off(event as string, listener);
    });

    return parentOn;
  }

  off(event: any, listener: any): this {
    if (listener) {
      const updates = this.eventUpdates[event];
      updates?.get(listener)?.();
      updates?.delete(listener);

      return this;
    }

    const updates = [...this.eventUpdates[event as string].values()];
    this.eventUpdates[event as string] = new Map<Function, DataFn>();
    updates.forEach((update) => update());
    super.off(event, listener);

    return this;
  }

  write(message: string | Buffer): void {
    this.callModule("socketExists", { id: this.id }).then(
      ([exists]: ErrTuple) => {
        if (!exists) {
          logErr("tried to write to closed socket");
          return;
        }
        this.callModule("socketWrite", { id: this.id, message });
      },
    );
    this.callModule("socketWrite", { id: this.id, message });
  }

  end(): void {
    this.callModule("socketExists", { id: this.id }).then(
      ([exists]: ErrTuple) => {
        if (!exists) {
          logErr("tried to close a closed socket");
          return;
        }
        this.callModule("socketClose", { id: this.id });
      },
    );
  }

  async getListeners() {
    return this.callModuleReturn("socketListeners", { id: this.id });
  }

  public setKeepAlive(ms: number) {
    this.callModuleReturn("socketSetKeepAlive", {
      id: this.id,
      alive: ms,
    });
  }

  private ensureEvent(event: string): void {
    if (!(event in this.eventUpdates)) {
      this.eventUpdates[event] = new Map<Function, DataFn>();
    }
  }

  private trackEvent(event: string, listener: Function, update: DataFn): void {
    this.ensureEvent(event as string);
    this.eventUpdates[event].set(listener, update);
  }
}

export const MODULE =
  "zA71z3zajvPWYw86YTKiTx8rBybB7GR7HtD4NNR6b45Cs1YB7sL7xCEY5QpDP5uJPao4SL23";

export const createClient = factory<SwarmClient>(SwarmClient, MODULE);

// @ts-ignore
const socketFactory = factory<Socket>(Socket, MODULE);
const createSocket = async (...args: any): Promise<Socket> => {
  const socket = socketFactory(...args);

  await socket.setup();

  return socket;
};
