import { UserAuthentication } from "./authentication";
import { ServiceInterface } from "./core";

export type User = {
  groups: string[];
  id: number;
  is_admin: boolean;
  is_enabled: boolean;
  password: string;
  password_confirm: string;
  username: string;
};

export type Group = {
  applications: string[];
  chat_abilities: string[];
  description: string;
  name: string;
  skills: string[];
  unique_key: string;
};

export type Users = {
  [key: string]: User;
};

export type Groups = {
  [key: string]: Group;
};

export type UserPermissions = {
  skills: string[];
  applications: string[];
  is_admin: boolean;
};

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
  validateAuthToken(
    token: string,
    socketId: string,
    eventName: string,
    userData?: UserAuthentication
  ): Promise<number>;
  cleanAuthCache(socketId: string): void;
  getAuthUser(token: string): Promise<UserAuthentication>;
  getUserPermissions(userId: number): Promise<UserPermissions>;
}
