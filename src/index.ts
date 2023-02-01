import { Buffer } from "buffer";
import { Client, factory } from "@lumeweb/libkernel-universal";
import { hexToBuf, DataFn, ErrTuple } from "@siaweb/libweb";

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
  async ready(): Promise<ErrTuple> {
    return this.callModuleReturn("ready", { swarm: this.swarm });
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

  join(topic: Buffer): void {
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

  on(eventName: string, listener: (...args: any[]) => void): this {
    const [update, promise] = this.connectModule(
      "listenSocketEvent",
      { id: this.id, event: eventName },
      (data: any) => {
        this.emit(eventName, data);
      }
    );
    this.trackEvent(eventName, update);

    promise.then(() => {
      this.off(eventName, listener);
    });

    return super.on(eventName, listener) as this;
  }

  off(type: string, listener: any): this {
    const updates = [...this.eventUpdates[type]];
    this.eventUpdates[type] = [];
    for (const func of updates) {
      func({ action: "off" });
    }
    return super.off(type, listener);
  }

  write(message: string | Buffer): void {
    this.callModule("write", { id: this.id, message });
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
