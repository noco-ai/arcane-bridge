import {
  AbilityResponseHelperInterface,
  ChatMessage,
  LoggerServiceInterface,
  ProgressBarUpdate,
  ServicesConstructorInterface,
  SpellbookServiceInterface,
} from "types";

export class AbilityResponseHelper implements AbilityResponseHelperInterface {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private spellbookService: SpellbookServiceInterface;
  private promptClass: any;

  constructor(services: ServicesConstructorInterface, promptClass: any) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.spellbookService = services["SpellbookService"];
    this.promptClass = promptClass;
  }

  async sendError(error, socketId): Promise<boolean> {
    return await this.promptClass.sendChatAbilityError(error, socketId);
  }

  async clearEmbeddings(): Promise<void> {
    await this.promptClass.handleClearEmbeddings();
  }

  simpleChatPayload(systemPrompt: string, userPrompt: string): ChatMessage[] {
    return [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ];
  }

  async updateProgressBar(
    progressData: ProgressBarUpdate,
    socketId: string
  ): Promise<boolean> {
    return await this.promptClass.handleChatProgress({
      content: JSON.stringify(progressData),
      properties: {
        headers: {
          socket_id: socketId,
        },
      },
    });
  }

  async sendResponseWithCursor(
    response: string,
    cursor: string,
    socketId: string
  ): Promise<boolean> {
    if (!response || !socketId) {
      this.logger.error(
        `could not send chat ability response, invalid socket id`
      );
      return false;
    }

    return await this.promptClass.handlePromptFragmentWithCursor(
      {
        content: response,
        properties: {
          headers: {
            socket_id: socketId,
          },
        },
      },
      cursor
    );
  }

  mergeConfig(skillConfig: Object, payload: Object) {
    if (!skillConfig) return payload;
    for (let key in skillConfig) {
      if (skillConfig.hasOwnProperty(key)) {
        payload[key] = skillConfig[key];
      }
    }
    return payload;
  }

  async resetCursor(socketId: string): Promise<boolean> {
    return await this.promptClass.resetCursor(socketId);
  }

  async getActiveConversationParameter(
    socketId: string,
    parameter: string
  ): Promise<any> {
    const conversation = this.promptClass.getActivateConversation(socketId);
    if (!conversation || !conversation[parameter]) return null;
    return conversation[parameter];
  }

  async sendResponse(
    response: string,
    textOnlyResponse: string | null,
    socketId: string
  ): Promise<boolean> {
    if (!response || !socketId) {
      this.logger.error(
        `could not send chat ability response, invalid socket id`
      );
      return false;
    }

    return await this.promptClass.handlePromptFragment({
      content: response,
      properties: {
        headers: {
          socket_id: socketId,
        },
      },
    });
  }
}
