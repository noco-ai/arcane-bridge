import axios, { AxiosResponse } from "axios";
import FormData from "form-data";
import { PhoneNumberUtil, PhoneNumberFormat } from "google-libphonenumber";
import * as fs from "fs";
import {
  AbilityResponseHelperInterface,
  ChatAbilityInterface,
  LoggerServiceInterface,
  ServicesConstructorInterface,
  SocketMessage,
  VaultServiceInterface,
  WorkspaceServiceInterface,
} from "types";
import ChatAbilityBase from "../../spellbook/prompt/chat.ability.base";

interface SmsOptions {
  from: string;
  to: string;
  media_urls?: string[];
  messaging_profile_id?: string;
  subject?: string;
  text: string;
  type: string;
  use_profile_webhooks?: boolean;
  webhook_failover_url?: string;
  webhook_url?: string;
}

class TelnyxSmsSkill extends ChatAbilityBase implements ChatAbilityInterface {
  private workspaceService: WorkspaceServiceInterface;
  private vaultService: VaultServiceInterface;
  private phoneUtil: PhoneNumberUtil;

  constructor(services: ServicesConstructorInterface) {
    super(services);
    this.workspaceService = services["WorkspaceService"];
    this.vaultService = services["VaultService"];
    this.phoneUtil = PhoneNumberUtil.getInstance();
  }

  private async postFileToFileIO(filePath: string): Promise<string> {
    const fileStream = fs.createReadStream(filePath);

    const formData = new FormData();
    formData.append("file", fileStream);

    try {
      const response: AxiosResponse = await axios.post(
        "https://file.io",
        formData,
        {
          headers: formData.getHeaders(),
        }
      );

      if (response.data && response.data.success && response.data.link) {
        return response.data.link;
      } else {
        throw new Error("Failed to retrieve the link from File.io");
      }
    } catch (error) {
      throw new Error(`Error uploading file: ${error.message}`);
    }
  }

  private async sendSMS(
    socketId: string,
    token: string,
    options: SmsOptions
  ): Promise<AxiosResponse> {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const endpoint = "https://api.telnyx.com/v2/messages";

    try {
      const response = await axios.post(endpoint, options, {
        headers: headers,
      });
      return response;
    } catch (error) {
      this.logger.error(error.response.data.errors);
      throw new Error(`error sending sms: ${error.message}`);
    }
  }

  private normalizePhoneNumber(
    input: string,
    defaultRegion: string = "US"
  ): string | null {
    try {
      const number = this.phoneUtil.parseAndKeepRawInput(input, defaultRegion);
      if (this.phoneUtil.isValidNumber(number)) {
        return this.phoneUtil.format(number, PhoneNumberFormat.E164);
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  }

  async execute(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    try {
      const sendTo = this.normalizePhoneNumber(skillData.phone_number);
      if (!sendTo) {
        await responseClass.sendError(
          `The phone number ${skillData.phone_number} is not valid.`,
          socketMessage.socket_id
        );
        return true;
      }

      if (!skillData.message) {
        await responseClass.sendError(
          `No message to send was found.`,
          socketMessage.socket_id
        );
        return true;
      }

      const skillConfig = await this.vaultService.getGroup(
        "chat_ability/telynx_sms"
      );
      if (!skillConfig || !skillConfig.api_key) {
        await responseClass.sendError(
          `No API key configured for Telnyx.`,
          socketMessage.socket_id
        );
        this.logger.error(`no api key configured for telnyx`);
        return true;
      }

      if (!skillConfig.from_number) {
        await responseClass.sendError(
          `No outgoing number set in Telnyx configuration.`,
          socketMessage.socket_id
        );
        this.logger.error(`no outgoing number configured for telnyx`);
        return true;
      }

      let userMessage = `Sent SMS message: <b>${skillData.message}</b> to <a href="tel:${skillData.phone_number}">${skillData.phone_number}</a>`;
      if (skillData.filename) {
        const findFile = await this.workspaceService.checkInWorkspaces(
          socketMessage.socket_id,
          skillData.filename
        );

        if (!findFile) {
          await responseClass.sendError(
            `No file with name ${skillData.filename} was found.`,
            socketMessage.socket_id
          );
          return true;
        }

        const tempLink = await this.postFileToFileIO(findFile);
        const smsOptions: SmsOptions = {
          from: skillConfig.from_number,
          to: sendTo,
          media_urls: [tempLink],
          text: skillData.message,
          type: "MMS",
          use_profile_webhooks: false,
        };
        await this.sendSMS(
          socketMessage.socket_id,
          skillConfig.api_key,
          smsOptions
        );
        userMessage = `Sent MMS message: <b>${skillData.message}</b> to <a href="tel:${skillData.phone_number}">${skillData.phone_number}</a> with file <b>${skillData.filename}</b>`;
      } else {
        const smsOptions: SmsOptions = {
          from: skillConfig.from_number,
          to: sendTo,
          text: skillData.message,
          type: "SMS",
          use_profile_webhooks: false,
        };
        await this.sendSMS(
          socketMessage.socket_id,
          skillConfig.api_key,
          smsOptions
        );
      }

      await responseClass.sendResponse(
        userMessage,
        userMessage,
        socketMessage.socket_id
      );
    } catch (error) {
      await responseClass.sendError(
        `Error sending SMS ${error}.`,
        socketMessage.socket_id
      );
      this.logger.error("Error sending SMS: ", error);
    }
    return true;
  }
}

export default TelnyxSmsSkill;
