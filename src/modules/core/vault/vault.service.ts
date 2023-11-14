const fs = require("fs/promises");
const Vault = require("hashi-vault-js");
import {
  VaultServiceInterface,
  VaultClient,
  VaultCliOptions,
  ServicesConstructorInterface,
  ApplicationSettings,
} from "types";
import { PluginSystem } from "../../../plugin";

export class VaultService implements VaultServiceInterface {
  private client: VaultClient;
  private cliOptions: VaultCliOptions;
  private isServerOnline: boolean;
  private vaultToken: string;
  private appSettings: ApplicationSettings;

  constructor() {
    this.isServerOnline = false;
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
}

export default VaultService;
