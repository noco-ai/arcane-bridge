import * as fs from "fs";
import ChatAbilityBase from "../../spellbook/prompt/chat.ability.base";
import {
  AbilityResponseHelperInterface,
  ChatAbilityInterface,
  LoggerServiceInterface,
  ServicesConstructorInterface,
  SocketMessage,
  WorkspaceServiceInterface,
} from "types";
var Client = require("ftp");

class FtpTransferSkill extends ChatAbilityBase implements ChatAbilityInterface {
  private workspaceService: WorkspaceServiceInterface;
  private client;

  constructor(services: ServicesConstructorInterface) {
    super(services);
    this.workspaceService = services["WorkspaceService"];
    this.client = new Client();
  }

  private connect(skillData: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.once("ready", resolve);
      this.client.once("error", reject);
      this.client.connect({
        host: this.extractDomainOrIP(skillData.dns_name),
        user: skillData.username,
        password: skillData.password,
      });
    });
  }

  private extractDomainOrIP(input: string): string | null {
    // Remove everything before and including the '@'
    const afterAt = input.split("@").pop() || "";
    const domainOrIP = afterAt.split("/")[0];
    if (
      /^([a-z0-9\-]+\.)+[a-z0-9\-]+$/.test(domainOrIP) ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(domainOrIP)
    ) {
      return domainOrIP;
    }
    return null;
  }

  async executeDownloadFile(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    await responseClass.sendError(`Not yet ready.`, socketMessage.socket_id);
    return true;
  }

  async executeSendFile(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    try {
      const findFile = await this.workspaceService.checkInWorkspaces(
        socketMessage.socket_id,
        skillData.filename
      );

      if (!findFile) {
        await responseClass.sendError(
          `Could not find file ${skillData.filename}.`,
          socketMessage.socket_id
        );
        return;
      }
      await this.connect(skillData);
      await new Promise((resolve, reject) => {
        this.client.put(
          fs.createReadStream(findFile),
          skillData.remote_path,
          (err) => {
            if (err) {
              reject(err);
            } else resolve(true);
          }
        );
      });

      const dnsName = this.extractDomainOrIP(skillData.dns_name);
      this.logger.info(`uploaded file ${skillData.filename} to ${dnsName}`, {
        icon: "💾",
      });
      await responseClass.sendResponse(
        `File ${skillData.filename} successfully uploaded. 🚀`,
        `File ${skillData.filename} successfully uploaded.`,
        socketMessage.socket_id
      );
      return true;
    } catch (error) {
      await responseClass.sendError(
        `Error sending file ${skillData.filename} ${error}`,
        socketMessage.socket_id
      );
      this.logger.error("Error sending file:", error);
      return false;
    } finally {
      this.client.end();
    }
  }

  async executeGetFile(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    try {
      await this.connect(skillData);
      await new Promise((resolve, reject) => {
        this.client.get(skillData.remotePath, (err, stream) => {
          if (err) reject(err);
          else {
            stream.once("close", resolve);
            stream.pipe(fs.createWriteStream(skillData.localPath));
          }
        });
      });
      this.logger.info("File retrieved successfully");
      return true;
    } catch (error) {
      this.logger.error("Error retrieving file:", error);
      return false;
    } finally {
      this.client.end();
    }
  }

  async executeListFiles(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    try {
      await this.connect(skillData);
      const files = await new Promise<string[]>((resolve, reject) => {
        this.client.list(skillData.remoteDirectory || "", (err, list) => {
          if (err) reject(err);
          else resolve(list);
        });
      });
      return true;
    } catch (error) {
      this.logger.error("Error listing files:", error);
      return false;
    } finally {
      this.client.end();
    }
  }
}

export default FtpTransferSkill;
