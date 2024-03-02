import {
  AmqpGolemMessage,
  EmbeddingResponse,
  EmptyCliOptions,
  ServicesConstructorInterface,
} from "types";
import GolemService from "./golem.service";

export class GolemEmbeddingService extends GolemService {
  constructor(
    cliOptions: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    super(cliOptions, services);
    this.services = services;
  }

  async handleEmbeddingResponse(message: AmqpGolemMessage): Promise<boolean> {
    this.handleGolemResponse(message, "embedding");
    return true;
  }

  cosineSimilarity(A, B): number {
    let dotproduct = 0;
    var mA = 0;
    var mB = 0;

    for (var i = 0; i < A.length; i++) {
      dotproduct += A[i] * B[i];
      mA += A[i] * A[i];
      mB += B[i] * B[i];
    }

    mA = Math.sqrt(mA);
    mB = Math.sqrt(mB);
    var similarity = dotproduct / (mA * mB);
    return similarity;
  }

  async generateEmbedding(
    text: string[],
    routingKey: string,
    userId: number,
    customData?: any
  ): Promise<EmbeddingResponse> {
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
        "core_embedding_service",
        {
          text: text,
        },
        sendHeaders
      );
    });
  }
}

export default GolemEmbeddingService;
