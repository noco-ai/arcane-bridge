import {
  AmqpGolemMessage,
  EmptyCliOptions,
  GolemJob,
  LoggerServiceInterface,
  ServicesConstructorInterface,
  SpellbookServiceInterface,
} from "types";

export class GolemService {
  protected services: ServicesConstructorInterface;
  protected logger: LoggerServiceInterface;
  protected spellbookService: SpellbookServiceInterface;
  protected runningJobs: Map<string, GolemJob>;
  protected requestId: number = 0;

  constructor(
    cliOptions: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.spellbookService = services["SpellbookService"];
    this.runningJobs = new Map();
  }

  protected getHeaders(message: AmqpGolemMessage) {
    const headers = message?.properties?.headers || {
      success: false,
      errors: ["Invalid response from amqp received"],
    };
    return headers;
  }

  protected async sendGolemMessage(
    routingKey: string,
    job: string,
    payload: any = {},
    headers: any = {}
  ): Promise<void> {
    if (!routingKey || !job) {
      this.logger.error(`invalid routing key or job provided to golem service`);
      return;
    }
    await this.spellbookService.publishCommand(
      "golem_skill",
      routingKey,
      job,
      payload,
      headers
    );
  }

  protected getOnlineSkill(
    routingKey: string,
    skillType: string,
    allowFallback: boolean = true
  ): string | null {
    const ttsSkills = this.spellbookService.getOnlineSkillFromType(skillType);
    if (!routingKey) {
      return !ttsSkills ? null : ttsSkills[0];
    } else {
      const skill = this.spellbookService.getOnlineSkillFromKey(routingKey);
      if (!skill) return allowFallback && ttsSkills ? ttsSkills[0] : null;
      return routingKey;
    }
  }

  protected createJob(
    routingKey: string,
    resolve: any,
    reject: any,
    userId: number,
    customData?: any
  ): any {
    const requestId = ++this.requestId;
    const sendHeaders = {
      job: `core_llm_service_${requestId}`,
      user_id: userId,
      custom_data: customData || {},
      model: routingKey,
    };

    this.runningJobs.set(`core_llm_service_${requestId}`, {
      resolve: resolve,
      reject: reject,
      unique_id: "",
    });
    return sendHeaders;
  }

  protected handleGolemResponse(
    message: AmqpGolemMessage,
    jobType: string
  ): void {
    const headers = this.getHeaders(message);
    if (!this.runningJobs.has(headers.job)) {
      this.logger.error(
        `no running ${jobType} job with name ${headers.job} found`
      );
      return;
    }

    const currentJob = this.runningJobs.get(headers.job);
    this.runningJobs.delete(headers.job);
    if (!headers.success) {
      currentJob.reject(
        Error(`error from elemental golem: ${headers.errors.join(", ")}`)
      );
      return;
    }

    try {
      const json = JSON.parse(message.content?.toString());
      currentJob.resolve(json);
      return;
    } catch {}

    currentJob.reject(Error(`invalid json for job ${headers.job}`));
  }

  async start(): Promise<boolean> {
    return true;
  }
}

export default GolemService;
