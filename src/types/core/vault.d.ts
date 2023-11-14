import { ServiceInterface } from "./core";

export interface VaultCliOptions {
  vaultHost: string;
  vaultToken: string;
  vaultRoot: string;
}

export interface ApplicationSettings {
  base_url: string;
  workspace_url: string;
}

export interface VaultClient {
  healthCheck(): Promise<any>;
  readKVSecret(token: string, path: string): Promise<any>;
  updateKVSecret(token: string, path: string, data: any): Promise<any>;
}

export interface VaultServiceInterface extends ServiceInterface {
  isOnline(): boolean;
  start(cliOptions: VaultCliOptions, services: any): Promise<boolean>;
  getGroup(groupPath: string): Promise<any>;
  getValue(path: string): Promise<any>;
  setGroup(secretPath: string, data: any): Promise<boolean>;
  getApplicationSetting(value: string): number | string | boolean;
  getBaseUrl(): string;
  getWorkspaceUrl(): string;
}
