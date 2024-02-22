import { PluginSystem } from "../../../plugin";
import ChatAbilityBase from "../../spellbook/prompt/chat.ability.base";
import {
  AbilityResponseHelperInterface,
  ChatAbilityInterface,
  GolemSoundServiceInterface,
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
  private vaultService: VaultServiceInterface;
  private workspaceService: WorkspaceServiceInterface;
  private responseClass: AbilityResponseHelperInterface;
  private soundService: GolemSoundServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    super(services);
    this.spellbookService = services["SpellbookService"];
    this.vaultService = services["VaultService"];
    this.workspaceService = services["WorkspaceService"];
    this.soundService = services["GolemSoundService"];
  }

  @PluginSystem
  async executeSkill(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
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

    const resp = await this.soundService.textToSpeech(
      skillData.prompt,
      socketMessage.user_id,
      "default",
      ttsGenerators[0],
      true,
      "chat_progress"
    );
    const socketId = socketMessage.socket_id;
    const wavBuffer = Buffer.from(resp.wav, "base64");
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

    const html = `<div style="display: none"></div>`;
    await responseClass.sendResponse(html, null, socketId, [filePath]);
    return true;
  }
}

export default TextToSpeechSkill;
