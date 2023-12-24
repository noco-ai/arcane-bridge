import { PluginSystem } from "../../../plugin";
import {
  AmqpGolemMessage,
  LoggerServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
  SocketMessage,
  SocketsServiceInterface,
  SpellbookServiceInterface,
  VaultServiceInterface,
  WorkspaceServiceInterface,
} from "types";
import Jimp from "jimp";
import { promises as fs } from "fs";

export class ImageGeneratorApp {
  private services: ServicesConstructorInterface;
  private socketService: SocketsServiceInterface;
  private logger: LoggerServiceInterface;
  private modelService: SequelizeServiceInterface;
  private vaultService: VaultServiceInterface;
  private spellbookService: SpellbookServiceInterface;
  private workspaceService: WorkspaceServiceInterface;
  private runningJobs: Map<string, any>;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.socketService = services["SocketService"];
    this.modelService = services["SequelizeService"];
    this.vaultService = services["VaultService"];
    this.spellbookService = services["SpellbookService"];
    this.workspaceService = services["WorkspaceService"];
    this.runningJobs = new Map();
  }

  @PluginSystem
  async deleteGeneratedImage(args, info) {
    this.logger.info(`deleting generated image w/ id ${args.id}`, {
      icon: "📷",
    });
    const imageModel = this.modelService.create("GeneratedImage");
    const loadedImage = await imageModel.findByPk(args.id);
    if (loadedImage.user_id != args.user_id) {
      this.logger.error(
        `user trying to delete generated image that does not belong to them`
      );
      return { id: 0 };
    }
    await fs.unlink(loadedImage.image_url);
    await fs.unlink(loadedImage.image_url.replace(".png", "-thumb.png"));
    imageModel.destroy({ where: { id: args.id } });
    return { id: args.id };
  }

  async createThumbnail(
    imageBuffer: Buffer,
    outputPath: string
  ): Promise<void> {
    try {
      const image = await Jimp.read(imageBuffer);
      const resizedImage = image.resize(64, 64);
      await resizedImage.writeAsync(outputPath);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async handleImage(message: AmqpGolemMessage) {
    const headers = message.properties.headers;
    const socketId = headers.socket_id;
    if (!headers.success || !this.runningJobs.has(socketId)) {
      this.logger.error(headers.errors.join(","));
      if (this.runningJobs.has(socketId)) this.runningJobs.delete(socketId);
      return true;
    }

    const job = this.runningJobs.get(socketId);
    const content = JSON.parse(message.content);
    const imageBuffer = Buffer.from(content.image, "base64");
    const time = Date.now().toString() + "-" + job.current_generation;
    const fileName = `apps/image-generator/${time}.png`;
    await this.workspaceService.createFolder(socketId, "apps/image-generator");
    const filePath = await this.workspaceService.saveFile(
      socketId,
      fileName,
      imageBuffer,
      false
    );
    const thumbnailPath = filePath.replace(".png", "-thumb.png");
    await this.createThumbnail(imageBuffer, thumbnailPath);

    this.logger.info(`image saved to ${filePath} for ${socketId}`, {
      icon: "📷",
    });

    const settings = job.settings;
    const model = this.modelService.create("GeneratedImage");
    const skillData = this.spellbookService.getSkillFromKey(headers.model_used);
    await model.create({
      prompt: settings.prompt,
      negative_prompt: settings.negative_prompt,
      guidance_scale: content.guidance_scale,
      height: settings.height,
      width: settings.width,
      seed: content.seed,
      user_id: job.user_id,
      steps: content.steps,
      image_url: filePath,
      skill_key: headers.model_used,
      model_name: skillData.label,
    });

    const baseUrl = this.vaultService.getBaseUrl();
    this.socketService.emit(socketId, "finish_command", {
      command: "app_image_generator",
      error: null,
      success: true,
      url: `${baseUrl}${filePath}`,
    });

    if (++job.current_generation >= job.num_generations) {
      this.logger.info(`done with image generation job for ${socketId}`, {
        icon: "📷",
      });
      this.runningJobs.delete(socketId);
    }
  }

  @PluginSystem
  async handleGenerateImage(socketMessage: SocketMessage) {
    const imageGenerators =
      this.spellbookService.getOnlineSkillFromType("image_generation");

    if (!imageGenerators) {
      this.logger.error(`no image generators are loaded`);
      this.socketService.emit(socketMessage.socket_id, "finish_command", {
        command: "app_image_generator",
        error: "No image generators are running",
        success: false,
      });
      return false;
    }

    // setup the params to send to the model
    const settings = socketMessage.payload.settings;
    const numGenerations = settings.num_generations;
    delete settings.num_generations;
    settings.seed = parseInt(settings.seed);
    settings.progress = true;

    const useModels = [];
    for (let i = 0; i < settings.use_models.length; i++) {
      const model = settings.use_models[i];
      if (imageGenerators.includes(model)) useModels.push(model);
    }

    this.runningJobs.set(socketMessage.socket_id, {
      num_generations: useModels.length * numGenerations,
      current_generation: 0,
      settings: settings,
      user_id: socketMessage.user_id,
    });

    for (let i = 0; i < useModels.length; i++) {
      for (let j = 0; j < numGenerations; j++) {
        await this.spellbookService.publishCommand(
          "golem_skill",
          useModels[i],
          "app_image_generator",
          settings,
          {
            socket_id: socketMessage.socket_id,
            model_used: useModels[i],
          }
        );
      }
    }
  }
}

export default ImageGeneratorApp;
