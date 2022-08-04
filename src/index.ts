import { EventEmitter } from "events";
import { DataFn, ErrTuple } from "libskynet";
import { Buffer } from "buffer";
import { create } from "domain";

const DHT_MODULE = "AQD1IgE4lTZkq1fqdoYGojKRNrSk0YQ_wrHbRtIiHDrnow";

let callModule: any, connectModule: any;

async function loadLibs() {
  if (callModule && connectModule) {
    return;
  }
  if (typeof window !== "undefined" && window?.document) {
    const pkg = await import("libkernel");
    callModule = pkg.callModule;
    connectModule = pkg.connectModule;
  } else {
    const pkg = await import("libkmodule");
    callModule = pkg.callModule;
    connectModule = pkg.connectModule;
  }
}

export class DHT {
  private useDefaultDht: boolean;
  private id: number = 0;

  constructor(useDefaultDht = true) {
    this.useDefaultDht = useDefaultDht;
  }

  public async connect(pubkey: string): Promise<Socket> {
    await this.setup();
    const dht = !this.useDefaultDht ? this.id : undefined;
    const [resp, err] = await callModule(DHT_MODULE, "connect", {
      pubkey,
      dht,
    });
    if (err) {
      throw new Error(err);
    }
    return new Socket(resp.id);
  }

  async ready(): Promise<ErrTuple> {
    await this.setup();
    const dht = !this.useDefaultDht ? this.id : undefined;
    return callModule(DHT_MODULE, "ready", { dht });
  }

  public async addRelay(pubkey: string): Promise<void> {
    await this.setup();
    const dht = !this.useDefaultDht ? this.id : undefined;
    const [, err] = await callModule(DHT_MODULE, "addRelay", { pubkey, dht });
    if (err) {
      throw new Error(err);
    }
  }

  public async removeRelay(pubkey: string): Promise<void> {
    await this.setup();
    const dht = !this.useDefaultDht ? this.id : undefined;
    const [, err] = await callModule(DHT_MODULE, "removeRelay", {
      pubkey,
      dht,
    });
    if (err) {
      throw new Error(err);
    }
  }

  public async clearRelays(): Promise<void> {
    await this.setup();
    const dht = !this.useDefaultDht ? this.id : undefined;
    await callModule(DHT_MODULE, "clearRelays", { dht });
  }

  private async create() {
    await loadLibs();
    if (this.useDefaultDht || this.id > 0) {
      return Promise.resolve();
    }
    const [dht, err] = await callModule(DHT_MODULE, "openDht");
    if (err) {
      throw new Error(err);
    }

    this.id = dht.dht;
  }

  public async close(): Promise<boolean> {
    await this.setup();

    if (this.useDefaultDht) {
      return false;
    }
    const [, err] = await callModule(DHT_MODULE, "closeDht", { dht: this.id });
    if (err) {
      throw new Error(err);
    }

    return true;
  }

  private async setup() {
    await loadLibs();
    await this.create();
  }
}

export class Socket extends EventEmitter {
  private id: number;
  private eventUpdates: { [event: string]: DataFn[] } = {};

  constructor(id: number) {
    super();
    this.id = id;
  }

  on(eventName: string, listener: (...args: any[]) => void): this {
    const [update, promise] = connectModule(
      DHT_MODULE,
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

    return super.on(eventName, listener);
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
    callModule(DHT_MODULE, "write", { id: this.id, message });
  }

  end(): void {
    callModule(DHT_MODULE, "socketExists", { id: this.id }).then(([exists]: ErrTuple) => {
      if (exists) {
        callModule(DHT_MODULE, "close", { id: this.id });
      }
    });
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
