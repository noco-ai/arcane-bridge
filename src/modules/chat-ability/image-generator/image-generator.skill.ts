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

class ImageGeneratorSkill
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

  async handleImage(message: AmqpGolemMessage) {
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
    const imageBuffer = Buffer.from(content.image, "base64");
    if (!this.responseClass) return false;

    const fileName = await this.workspaceService.getNextFile(
      socketId,
      "image-",
      "png"
    );
    const filePath = await this.workspaceService.saveFile(
      socketId,
      fileName,
      imageBuffer
    );

    this.logger.info(`image saved to ${filePath} for ${socketId}`, {
      icon: "📷",
    });

    const baseUrl = this.vaultService.getBaseUrl();
    const html = `<div class="card p-0" style="margin: 0 20% 0 20%; align-items: center">
        <div class="align-content-center pt-1 pb-0">
          <img src="${baseUrl}${filePath}" style="height: fit-content" width="100%"/>
          <p style="width: 100%; text-align: center">${fileName}</p>
        </div>
      </div>`;

    await this.responseClass.sendResponse(html, null, socketId);
    const job = this.runningJobs.get(socketId);
    job.resolve(true);
    this.runningJobs.delete(socketId);
  }

  async executeSkill(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    this.responseClass = responseClass;
    if (!socketMessage) return false;

    const imageGenerators =
      this.spellbookService.getOnlineSkillFromType("image_generation");
    if (!imageGenerators) {
      await responseClass.sendError(
        `No image generators are currently running.`,
        socketMessage.socket_id
      );
      this.logger.error(`no image generators are loaded`);
      return false;
    }
    const useSkill = imageGenerators[0];

    // load configuration from vault or use defaults no data is in vault.
    let skillConfig = (await this.vaultService.getGroup(
      "chat_ability/image_generation"
    )) || {
      width: 512,
      height: 512,
      steps: 40,
      guidance_scale: 7.5,
      negative_prompt: "",
    };

    let payload = {
      width: Math.min(skillData.width || skillConfig.width, 2048),
      height: Math.min(skillData.height || skillConfig.height, 2048),
      steps: Math.min(skillData.steps || skillConfig.steps, 100),
      guidance_scale: Math.min(
        skillData.guidance_scale || skillConfig.guidance_scale,
        20
      ),
      negative_prompt: skillData.negative_prompt || skillConfig.negative_prompt,
      prompt: skillData.prompt,
    };
    payload = responseClass.mergeConfig(payload, skillConfig);

    return new Promise(async (resolve, reject) => {
      this.runningJobs.set(socketMessage.socket_id, {
        resolve: resolve,
        reject: reject,
      });
      await this.spellbookService.publishCommand(
        "golem_skill",
        useSkill,
        "generate_image",
        payload,
        {
          socket_id: socketMessage.socket_id,
        }
      );
    });
  }
}

export default ImageGeneratorSkill;
