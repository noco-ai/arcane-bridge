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

interface AnalyzerJob extends AsyncJob {
  use_models: string[];
  num_models: number;
  current_model: number;
  img_url: string;
}

class ImageGeneratorSkill
  extends ChatAbilityBase
  implements ChatAbilityInterface
{
  private spellbookService: SpellbookServiceInterface;
  private runningJobs: Map<string, AnalyzerJob>;
  private workspaceService: WorkspaceServiceInterface;
  private responseClass: AbilityResponseHelperInterface;
  private vaultService: VaultServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    super(services);
    this.spellbookService = services["SpellbookService"];
    this.workspaceService = services["WorkspaceService"];
    this.vaultService = services["VaultService"];
    this.runningJobs = new Map();
  }

  private titleCase(str: string): string {
    var splitStr = str.toLowerCase().split(" ");
    for (var i = 0; i < splitStr.length; i++) {
      splitStr[i] =
        splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);
    }
    return splitStr.join(" ").replace(/_/g, " ");
  }

  async handleObjectDetection(message: AmqpGolemMessage) {
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

    if (!this.responseClass) return false;
    const modelUsed = headers.model_used;
    const content = JSON.parse(message.content);
    const imageBuffer = Buffer.from(content.image, "base64");
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

    const baseUrl = this.vaultService.getBaseUrl();
    const job = this.runningJobs.get(socketId);
    const skillData = this.spellbookService.getSkillFromKey(modelUsed);
    const modelName =
      job.num_models > 1
        ? `<p style='width: 100%; text-align: center'><b>${skillData.label}</b></p>`
        : "";
    const html = `<div class="card p-0" style="margin: 0 20% 0 20%; align-items: center">
        <div class="align-content-center pt-1 pb-0">
          <img src="${baseUrl}${filePath}" style="height: fit-content" width="100%"/>                    
          ${modelName}<p style="width: 100%; text-align: center">${fileName}</p>
        </div>
      </div>`;
    await this.responseClass.sendResponse(html, null, socketId);

    if (++job.current_model == job.num_models) {
      job.resolve(true);
      this.runningJobs.delete(socketId);
    } else {
      await this.responseClass.sendResponse("<br>", null, socketId);
      await this.spellbookService.publishCommand(
        "golem_skill",
        job.use_models[job.current_model],
        "object_detection",
        {
          img_url: job.img_url,
        },
        {
          socket_id: socketId,
          model_used: job.use_models[job.current_model],
        }
      );
    }
    return true;
  }

  async handleImageClassification(message: AmqpGolemMessage) {
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

    const modelUsed = headers.model_used;
    const content = JSON.parse(message.content);
    if (!this.responseClass) {
      this.logger.error(`invalid response class, recovered from crash`);
      return true;
    }

    // make sure model gave us a valid response
    if (!content || !content.classes) {
      return await this.responseClass.sendError(
        `Invalid response from skill`,
        socketId
      );
    }

    const skillData = this.spellbookService.getSkillFromKey(modelUsed);
    let response = `**Model**: ${skillData.label}<br>`;
    for (let i = 0; i < content.classes.length; i++) {
      response += `**Classification**: ${this.titleCase(
        content.classes[i].label
      )} **Score**: ${content.classes[i].score.toPrecision(4)}<br>`;
    }
    await this.responseClass.sendResponse(response, null, socketId);

    const job = this.runningJobs.get(socketId);
    job.current_model++;
    if (job.current_model == job.num_models) {
      job.resolve(true);
      this.runningJobs.delete(socketId);
    } else {
      await this.responseClass.sendResponse("<br>", null, socketId);
      await this.spellbookService.publishCommand(
        "golem_skill",
        job.use_models[job.current_model],
        "classify_image",
        {
          img_url: job.img_url,
        },
        {
          socket_id: socketId,
          model_used: job.use_models[job.current_model],
        }
      );
    }
  }

  private async getImageUrl(filename, socketId): Promise<string | null> {
    let foundFile = null;
    if (filename) {
      foundFile = await this.workspaceService.checkInWorkspaces(
        socketId,
        filename
      );

      if (!foundFile) {
        foundFile = await this.workspaceService.getNewestImage(socketId);
      }
    } else {
      foundFile = await this.workspaceService.getNewestImage(socketId);
    }

    if (!foundFile) {
      await this.responseClass.sendError(
        `Could not find file with name ${filename}.`,
        socketId
      );
      return null;
    }
    return await this.workspaceService.getFileUrl(socketId, foundFile);
  }

  async executeDetectObjects(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    this.responseClass = responseClass;
    if (!socketMessage) return false;

    const detectors =
      this.spellbookService.getOnlineSkillFromType("object_detection");
    if (!detectors) {
      await responseClass.sendError(
        `No object detection skills are currently running.`,
        socketMessage.socket_id
      );
      this.logger.error(`no object detection skills are loaded`);
      return false;
    }

    let foundFile = await this.getImageUrl(
      skillData.image_filename,
      socketMessage.socket_id
    );
    if (!foundFile) return true;

    return new Promise(async (resolve, reject) => {
      this.runningJobs.set(socketMessage.socket_id, {
        resolve: resolve,
        reject: reject,
        use_models: detectors,
        num_models: detectors.length,
        current_model: 0,
        img_url: foundFile,
      });
      await this.spellbookService.publishCommand(
        "golem_skill",
        detectors[0],
        "object_detection",
        {
          img_url: foundFile,
        },
        {
          socket_id: socketMessage.socket_id,
          model_used: detectors[0],
        }
      );
    });
  }

  async executeSkill(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    this.responseClass = responseClass;
    if (!socketMessage) return false;

    const classifier = this.spellbookService.getOnlineSkillFromType(
      "image_classification"
    );
    if (!classifier) {
      await responseClass.sendError(
        `No image classifiers are currently running.`,
        socketMessage.socket_id
      );
      this.logger.error(`no image classifiers are loaded`);
      return false;
    }

    let foundFile = await this.getImageUrl(
      skillData.image_filename,
      socketMessage.socket_id
    );
    if (!foundFile) return true;

    return new Promise(async (resolve, reject) => {
      this.runningJobs.set(socketMessage.socket_id, {
        resolve: resolve,
        reject: reject,
        use_models: classifier,
        num_models: classifier.length,
        current_model: 0,
        img_url: foundFile,
      });
      await this.spellbookService.publishCommand(
        "golem_skill",
        classifier[0],
        "classify_image",
        {
          img_url: foundFile,
        },
        {
          socket_id: socketMessage.socket_id,
          model_used: classifier[0],
        }
      );
    });
  }
}

export default ImageGeneratorSkill;
