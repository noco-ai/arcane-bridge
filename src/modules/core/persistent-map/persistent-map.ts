import { createClient } from "redis";
import { LoggerServiceInterface, ServicesConstructorInterface } from "types";

export class PersistentMapInstance<K, V> {
  private map: Map<K, V>;
  private redisClient: any;
  private mapName: string;

  constructor(
    services: ServicesConstructorInterface,
    mapName: string,
    redisClient: any
  ) {
    this.map = new Map<K, V>();
    this.mapName = mapName;
    //this.redisClient = redisClient;
  }

  async set(key: K, value: V): Promise<this> {
    this.map.set(key, value);
    /*await this.redisClient.set(
      `${this.mapName}_${key.toString()}`,
      JSON.stringify(value)
    );*/
    return this;
  }

  async get(key: K): Promise<V | undefined> {
    return this.map.get(key);
    /*if (this.map.has(key)) return this.map.get(key);
    const value = await this.redisClient.get(
      `${this.mapName}_${key.toString()}`
    );
    if (value !== null) {
      const deserializedValue = JSON.parse(value) as V;
      this.map.set(key, deserializedValue);
      return deserializedValue;
    }
    return undefined;*/
  }

  async has(key: K): Promise<boolean> {
    return this.map.has(key);
    /*if (this.map.has(key)) {
      return true;
    }

    const value = await this.redisClient.get(
      `${this.mapName}_${key.toString()}`
    );
    if (value !== null) {
      this.map.set(key, JSON.parse(value) as V);
      return true;
    }
    return false;*/
  }

  async delete(key: K): Promise<boolean> {
    const result = this.map.delete(key);
    //await this.redisClient.del(`${this.mapName}_${key.toString()}`);

    // Fetch keys with the specified prefix
    /*const stream = this.redisClient.scanStream({
      match: `${this.mapName}_`,
      count: 100,
    });

    let keysToDelete: string[] = [];
    stream.on("data", function (keys) {
      keysToDelete.push(...keys);
    });

    stream.on("end", async function () {
      if (keysToDelete.length > 0) {
        // Delete all keys found
        await this.redisClient.del(keysToDelete);
        console.log(`Deleted keys: ${keysToDelete.join(", ")}`);
      } else {
        console.log("No keys found with the specified prefix.");
      }
    });*/

    return result;
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any
  ): void {
    this.map.forEach(callbackfn, thisArg);
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.map[Symbol.iterator]();
  }

  get [Symbol.toStringTag](): string {
    return this.map[Symbol.toStringTag];
  }
}
