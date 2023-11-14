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
  VaultServiceInterface,
  WorkspaceServiceInterface,
} from "types";

class TextToSpeechSkill
  extends ChatAbilityBase
  implements ChatAbilityInterface
{
  private spellbookService: SpellbookServiceInterface;
  private runningJobs: Map<string, AsyncJob>;
  private vaultService: VaultServiceInterface;
  private workspaceService: WorkspaceServiceInterface;
  private responseClass: AbilityResponseHelperInterface;

  constructor(services: ServicesConstructorInterface) {
    super(services);
    this.spellbookService = services["SpellbookService"];
    this.vaultService = services["VaultService"];
    this.workspaceService = services["WorkspaceService"];
    this.runningJobs = new Map();
  }

  async handleWav(message: AmqpGolemMessage): Promise<boolean> {
    const headers = message.properties.headers;
    const socketId = headers.socket_id;
    if (!headers.success) {
      await this.responseClass.sendError(
        headers.errors.join("<br/>"),
        headers.socket_id
      );

      const job = this.runningJobs.get(socketId);
      job.resolve(true);
      this.runningJobs.delete(socketId);
      return true;
    }

    const content = JSON.parse(message.content);
    const wavBuffer = Buffer.from(content.wav, "base64");
    const fileName = await this.workspaceService.getNextFile(
      socketId,
      "tts-",
      "wav"
    );
    const filePath = await this.workspaceService.saveFile(
      socketId,
      fileName,
      wavBuffer
    );

    this.logger.info(`wav file saved to ${filePath} for ${socketId}`, {
      icon: "🎶",
    });

    const baseUrl = this.vaultService.getBaseUrl();
    const html = `<div class="card p-0 audio-card" style="background-position: center; background-image: url('${baseUrl}asset/chat-ability/text-to-speech/tts-background.jpeg');">
        <div class="align-content-center pt-1 pb-2">
          <audio controls style="margin: auto; display: block">
              <source src="${baseUrl}${filePath}" type="audio/wav">
              Your browser does not support the audio element.
          </audio>
        </div>
      </div>
      <p style="width: 100%; text-align: center; font-weight: 600" class="text-l">${fileName}</p>`;

    await this.responseClass.sendResponse(html, null, socketId);
    const job = this.runningJobs.get(socketId);
    job.resolve(true);
    this.runningJobs.delete(socketId);
    return true;
  }

  async executeSkill(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    this.responseClass = responseClass;
    if (!socketMessage) return false;

    const ttsGenerators =
      this.spellbookService.getOnlineSkillFromType("text_to_speech");
    if (!ttsGenerators) {
      await responseClass.sendError(
        `No text to speech generators are currently running.`,
        socketMessage.socket_id
      );
      this.logger.error(`no text to speech generators are loaded`);
      return false;
    }
    const useSkill = ttsGenerators[0];
    const skillConfig = await this.vaultService.getGroup(
      "chat_ability/text_to_speech"
    );
    const payload = { prompt: skillData.prompt, progress: true };
    if (skillConfig && skillConfig.voice && useSkill.indexOf("bark") !== -1) {
      payload["voice"] = `v2/en_${skillConfig.voice}`;
    }

    // use voice specified in prompt
    if (skillData.voice) {
      skillData.voice = Math.abs(skillData.voice);
      skillData.voice = skillData.voice > 9 ? 9 : skillData.voice;
      if (useSkill.indexOf("bark") !== -1) {
        payload["voice"] = `v2/en_speaker_${skillData.voice}`;
      }
    }

    return new Promise(async (resolve, reject) => {
      this.runningJobs.set(socketMessage.socket_id, {
        resolve: resolve,
        reject: reject,
      });
      await this.spellbookService.publishCommand(
        "golem_skill",
        useSkill,
        "generate_text_to_speech_wav",
        payload,
        {
          socket_id: socketMessage.socket_id,
        }
      );
    });
  }
}

export default TextToSpeechSkill;
