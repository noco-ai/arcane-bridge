const fs = require("fs/promises");
const Vault = require("hashi-vault-js");
import {
  VaultServiceInterface,
  VaultClient,
  VaultCliOptions,
  ServicesConstructorInterface,
  ApplicationSettings,
  UserAuthentication,
  Users,
  Groups,
  User,
} from "types";
import { PluginSystem } from "../../../plugin";
import jwt from "jsonwebtoken";

interface CacheRecord {
  id: number;
  password_hash: string;
}

export class VaultService implements VaultServiceInterface {
  private client: VaultClient;
  private cliOptions: VaultCliOptions;
  private isServerOnline: boolean;
  private vaultToken: string;
  private appSettings: ApplicationSettings;
  private authCache: Map<string, UserAuthentication>;
  private tokenSecret: string = null;

  constructor() {
    this.isServerOnline = false;
    this.authCache = new Map();
  }

  @PluginSystem
  isOnline(): boolean {
    return this.isServerOnline;
  }

  @PluginSystem
  async start(
    cliOptions: VaultCliOptions,
    services: ServicesConstructorInterface
  ): Promise<boolean> {
    this.isServerOnline = false;
    try {
      this.cliOptions = cliOptions;
      const isHttps =
        cliOptions.vaultHost.indexOf("https://") === 0 ? true : false;
      const vaultTokenRaw = await fs.readFile(cliOptions.vaultToken);
      this.vaultToken = vaultTokenRaw.toString().trim();

      // Initialize the Vault client
      this.client = await new Vault({
        https: isHttps,
        baseUrl: cliOptions.vaultHost.replace(/\/+$/, "") + "/v1",
        token: cliOptions.vaultToken,
        rootPath: cliOptions.vaultRoot,
        apiVersion: "v1",
      });

      const status = await this.client.healthCheck();
      if (status.initialized == true && status.sealed == false) {
        const getCheck = await this.getGroup("core/settings");
        if (getCheck && getCheck.base_url) {
          this.appSettings = getCheck;
          console.log(
            `🔑 ${status.cluster_name} running v${status.version} 🔑`
          );
          this.isServerOnline = true;
        } else {
          console.error(
            `${status.cluster_name} is running but I could not retrieve core settings.`
          );
        }
      }
    } catch (error) {
      console.error("failed to start vault");
    }
    return this.isServerOnline;
  }

  @PluginSystem
  async getGroup(groupPath: string): Promise<any> {
    try {
      const result = await this.client.readKVSecret(this.vaultToken, groupPath);
      return result.data;
    } catch (error) {}
    return null;
  }

  @PluginSystem
  getApplicationSetting(value: string): number | string | boolean {
    if (!this.appSettings[value]) return null;
    return this.appSettings[value];
  }

  @PluginSystem
  getBaseUrl(): string {
    return this.appSettings["base_url"].replace(/\/$/, "") + "/";
  }

  @PluginSystem
  getWorkspaceUrl(): string {
    const workspaceUrl = this.appSettings["workspace_url"];
    const baseUrl = this.appSettings["base_url"].replace(/\/$/, "") + "/";
    return workspaceUrl ? workspaceUrl.replace(/\/$/, "") + "/" : baseUrl;
  }

  @PluginSystem
  async getValue(path: string): Promise<any> {
    try {
      const result = await this.client.readKVSecret(this.vaultToken, path);
      return result.data;
    } catch (error) {}
    return null;
  }

  @PluginSystem
  async setGroup(secretPath: string, data: Object): Promise<boolean> {
    try {
      const currentValues = await this.getGroup(secretPath);
      for (const key in data) {
        if (data[key] === "SECRET") {
          data[key] = currentValues[key];
        }
      }

      const result = await this.client.updateKVSecret(
        this.vaultToken,
        secretPath,
        data
      );
      return true;
    } catch (error) {
      console.error("failed to set value: ", error);
    }
    return false;
  }

  @PluginSystem
  async getAuthUser(token: string): Promise<UserAuthentication> {
    if (!token) return null;
    const parts = token.replace("Bearer ", "").split("::");
    if (parts.length != 2) return null;

    if (!this.tokenSecret) {
      const metadata = await this.getGroup("core/users_metadata");
      this.tokenSecret = metadata.secret;
    }

    const activeTokens = (await this.getGroup("core/auth_tokens")) || {};
    if (!activeTokens[parts[0]]) return null;

    const userId = activeTokens[parts[0]].id;
    const passwordHash = activeTokens[parts[0]].password_hash;
    try {
      const isValidToken = await jwt.verify(
        parts[1],
        this.tokenSecret + passwordHash
      );
      return {
        id: userId,
        password_hash: passwordHash,
        username: parts[0],
      };
    } catch (ex) {}
    return null;
  }

  @PluginSystem
  async validateAuthToken(
    token: string,
    socketId: string | null,
    eventName: string | null,
    userData: UserAuthentication | null
  ): Promise<number> {
    if (!token) return 0;
    const parts = token.replace("Bearer ", "").split("::");
    if (parts.length != 2) return 0;

    // load token secret to cache
    if (!this.tokenSecret) {
      const metadata = await this.getGroup("core/users_metadata");
      this.tokenSecret = metadata.secret;
    }

    // check local cache first
    if (socketId && this.authCache.has(socketId)) {
      const tokenCmp = this.authCache.get(socketId);
      try {
        const isValidToken = await jwt.verify(
          parts[1],
          this.tokenSecret + tokenCmp.password_hash
        );
        return tokenCmp.id;
      } catch (ex) {
        return 0;
      }
    }

    let userId = 0;
    let passwordHash = null;
    if (userData) {
      userId = userData.id;
      passwordHash = userData.password_hash;
    } else {
      // get user data from vault
      const activeTokens = (await this.getGroup("core/auth_tokens")) || {};
      if (!activeTokens[parts[0]]) return 0;
      userId = activeTokens[parts[0]].id;
      passwordHash = activeTokens[parts[0]].password_hash;
    }

    try {
      const isValidToken = await jwt.verify(
        parts[1],
        this.tokenSecret + passwordHash
      );
      if (socketId)
        this.authCache.set(socketId, {
          id: userId,
          password_hash: passwordHash,
          username: parts[0],
        });
      return userId;
    } catch (ex) {
      if (socketId && this.authCache.has(socketId))
        this.authCache.delete(socketId);
    }
    return 0;
  }

  @PluginSystem
  cleanAuthCache(socketId: string): void {
    if (this.authCache.has(socketId)) this.authCache.delete(socketId);
  }

  @PluginSystem
  async getUserPermissions(
    userId: number
  ): Promise<{ skills: string[]; applications: string[]; is_admin: boolean }> {
    let permissions = {
      skills: new Set<string>(),
      applications: new Set<string>(),
    };
    const users = (await this.getGroup("core/users")) || {};
    const groups = (await this.getGroup("core/user_groups")) || {};

    let user: any = Object.values(users).find((u: User) => u.id == userId);
    if (user && user.groups) {
      user.groups.forEach((groupName) => {
        const group = groups[groupName];
        if (group) {
          group.skills.forEach((skill) => permissions.skills.add(skill));
          group.applications.forEach((app) =>
            permissions.applications.add(app)
          );
          group.chat_abilities.forEach((ability) =>
            permissions.applications.add(ability)
          );
        }
      });
    }

    return {
      skills: Array.from(permissions.skills),
      applications: Array.from(permissions.applications),
      is_admin: user.is_admin,
    };
  }
}

export default VaultService;
