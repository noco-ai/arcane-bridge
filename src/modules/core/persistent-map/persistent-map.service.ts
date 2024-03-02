import {
  EmptyCliOptions,
  LoggerServiceInterface,
  PersistentMapServiceInterface,
  ServicesConstructorInterface,
} from "types";
import { PluginSystem } from "../../../plugin";
import { createClient } from "redis";
import { PersistentMapInstance } from "./persistent-map";

export class PersistentMapService implements PersistentMapServiceInterface {
  private logger: LoggerServiceInterface;
  private client: any;
  private services: ServicesConstructorInterface;
  private mapIndex: Map<string, any>;

  constructor(
    cliParams: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.logger = services["LoggerService"];
    this.services = services;
    this.mapIndex = new Map();
  }

  @PluginSystem
  async start(): Promise<boolean> {
    /*const client = await createClient({
      url: "redis://redis:6379",
    })
      .on("error", (err) => {
        console.log("Redis Client Error", err);
      })
      .connect();

    this.client = client;*/
    return true;
  }

  createMap(name: string) {
    if (this.mapIndex.has(name)) return this.mapIndex.get(name);
    //const newMap = new PersistentMapInstance(this.services, name, this.client);
    const newMap = new PersistentMapInstance(this.services, name, null);
    this.mapIndex.set(name, newMap);
    return newMap;
  }

  @PluginSystem
  async afterConfig(): Promise<boolean> {
    return true;
  }
}

export default PersistentMapService;
