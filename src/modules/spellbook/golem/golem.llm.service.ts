import {
  AmqpGolemMessage,
  EmptyCliOptions,
  GolemLlmServiceInterface,
  LlmGenerationSettings,
  LlmMessage,
  LlmResponse,
  ServicesConstructorInterface,
} from "types";
import GolemService from "./golem.service";

export class GolemLlmService
  extends GolemService
  implements GolemLlmServiceInterface
{
  constructor(
    cliOptions: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    super(cliOptions, services);
    this.services = services;
  }

  generateCompletion(prompt: string, routingKey: string): Promise<LlmResponse> {
    return new Promise((resolve, reject) => {});
  }

  async handleGenerateResponse(message: AmqpGolemMessage): Promise<boolean> {
    this.handleGolemResponse(message, "llm");
    return true;
  }

  async generate(
    messages: LlmMessage[],
    routingKey: string,
    userId: number,
    generationSettings: LlmGenerationSettings,
    customData?: any
  ): Promise<LlmResponse> {
    return new Promise(async (resolve, reject) => {
      if (!this.spellbookService.getOnlineSkillFromKey(routingKey)) {
        reject(Error(`skill with routing key ${routingKey} is not online`));
      }

      const sendHeaders = this.createJob(
        routingKey,
        resolve,
        reject,
        userId,
        customData
      );

      await this.sendGolemMessage(
        routingKey,
        "core_llm_service",
        { messages: messages, stream: false },
        sendHeaders
      );
    });
  }

  async generateFromPayload(
    payload: any,
    routingKey: string,
    userId: number,
    customData?: any
  ): Promise<LlmResponse> {
    return new Promise(async (resolve, reject) => {
      if (!this.spellbookService.getOnlineSkillFromKey(routingKey)) {
        reject(Error(`skill with routing key ${routingKey} is not online`));
      }

      const sendHeaders = this.createJob(
        routingKey,
        resolve,
        reject,
        userId,
        customData
      );

      await this.sendGolemMessage(
        routingKey,
        "core_llm_service",
        payload,
        sendHeaders
      );
    });
  }

  getReasoningAgent(type: ""): string | null {
    return "";
  }
}

export default GolemLlmService;
