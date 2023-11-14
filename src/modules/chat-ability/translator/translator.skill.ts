import { AbilityResponseHelper } from "modules/spellbook/prompt/ability-response.helper";
import ChatAbilityBase from "../../spellbook/prompt/chat.ability.base";
import {
  AbilityResponseHelperInterface,
  AmqpGolemMessage,
  AsyncJob,
  ChatAbilityInterface,
  LoggerServiceInterface,
  ServicesConstructorInterface,
  SocketMessage,
  SpellbookServiceInterface,
} from "types";

class TranslatorSkill extends ChatAbilityBase implements ChatAbilityInterface {
  private spellbookService: SpellbookServiceInterface;
  private jobsBuffer: Map<string, AsyncJob>;

  constructor(services: ServicesConstructorInterface) {
    super(services);
    this.spellbookService = services["SpellbookService"];
    this.jobsBuffer = new Map();
  }

  async translationDone(message: AmqpGolemMessage): Promise<boolean> {
    const headers = message.properties.headers;
    const content = message.content.toString();
    if (content.indexOf(`{"content": "<fragment>"`) !== 0) {
      return true;
    }
    if (!this.jobsBuffer.has(headers.socket_id)) return true;
    const currentJob = this.jobsBuffer.get(headers.socket_id);
    currentJob.resolve(true);
    this.jobsBuffer.delete(headers.socket_id);
    return true;
  }

  async executeSkill(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    if (!socketMessage) return false;

    let lora = "haoranxu/ALMA-13B-Pretrain-LoRA";
    let translator =
      this.spellbookService.getOnlineSkillFromKey("alma_13b_exllama");
    if (!translator) {
      translator =
        this.spellbookService.getOnlineSkillFromKey("alma_7b_exllama");
      lora = "haoranxu/ALMA-7B-Pretrain-LoRA";
    }

    if (!translator) {
      await responseClass.sendError(
        `ALMA translator model is not running. Default models best guess is: ${skillData.translated_text}`,
        socketMessage.socket_id
      );
    }

    return new Promise(async (resolve, reject) => {
      const prompt = `Translate this from ${skillData.input_language} to ${skillData.output_language}:\n${skillData.input_language}: ${skillData.input_text}\n${skillData.output_language}:`;
      this.jobsBuffer.set(socketMessage.socket_id, {
        resolve: resolve,
        reject: reject,
      });

      return await this.spellbookService.publishCommand(
        "golem_skill",
        translator.routing_key,
        "translate_text",
        {
          stream: true,
          raw: prompt,
          messages: [],
          stop_key: "<fragment>",
          lora: lora,
          debug: true,
        },
        {
          socket_id: socketMessage.socket_id,
          job: "translate_text",
        }
      );
    });
  }
}

export default TranslatorSkill;
