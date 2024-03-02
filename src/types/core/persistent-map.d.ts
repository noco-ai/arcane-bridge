export interface PersistentMapServiceInterface {
  start();
  afterConfig(): Promise<boolean>;
  createMap(mapName: string): any;
}
