import { Buffer } from "buffer";
import { Client, factory } from "@lumeweb/libkernel-universal";
import { hexToBuf, DataFn, ErrTuple } from "@siaweb/libweb";

import type { EventEmitter } from "eventemitter3";

export class SwarmClient extends Client {
  private useDefaultSwarm: boolean;
  private id: number = 0;

  get swarm(): number | undefined {
    return this.useDefaultSwarm ? undefined : this.id;
  }

  constructor(useDefaultDht = true) {
    super();
    this.useDefaultSwarm = useDefaultDht;
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
    return this.callModuleReturn("init", { swarm: this.swarm });
  }
  async ready(): Promise<void> {
    await this.callModuleReturn("ready", { swarm: this.swarm });

    this.connectModule(
      "listenConnections",
      { swarm: this.swarm },
      (socketId: any) => {
        this.emit("connection", createSocket(socketId));
      }
    );
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

export class Socket extends Client {
  private id: number;
  private eventUpdates: { [event: string]: DataFn[] } = {};

  constructor(id: number) {
    super();
    this.id = id;
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
          this.callModule("close", { id: this.id });
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
const createSocket = factory<Socket>(Socket, MODULE);
