import {
  AmqpGolemMessage,
  EmbeddingResponse,
  EmptyCliOptions,
  GenerateImageResponse,
  GolemImageServiceInterface,
  ServicesConstructorInterface,
} from "types";
import GolemService from "./golem.service";

export class GolemImageService
  extends GolemService
  implements GolemImageServiceInterface
{
  constructor(
    cliOptions: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    super(cliOptions, services);
    this.services = services;
  }

  async handleImageResponse(message: AmqpGolemMessage): Promise<boolean> {
    this.handleGolemResponse(message, "image_generation");
    return true;
  }

  async generateImage(
    userId: number,
    prompt: string,
    routingKey: string = "",
    negativePrompt: string = "",
    guidanceScale: number = 7.5,
    steps: number = 40,
    seed: number = -1,
    height: number = 1024,
    width: number = 1024
  ): Promise<GenerateImageResponse> {
    return new Promise(async (resolve, reject) => {
      const allowFallback = !routingKey ? true : false;
      const useRoutingKey = this.getOnlineSkill(
        routingKey,
        "image_generation",
        allowFallback
      );
      if (!useRoutingKey) {
        const error = !allowFallback
          ? `skill ${routingKey} is not online`
          : `no skills of type image_generation is not online`;
        reject(Error(error));
        return;
      }

      const sendHeaders = this.createJob(routingKey, resolve, reject, userId);
      await this.sendGolemMessage(
        routingKey,
        "core_image_service",
        {
          prompt: prompt,
          guidance_scale: guidanceScale,
          steps: steps,
          seed: seed,
          height: height,
          width: width,
          negative_prompt: negativePrompt,
        },
        sendHeaders
      );
    });
  }
}

export default GolemImageService;
