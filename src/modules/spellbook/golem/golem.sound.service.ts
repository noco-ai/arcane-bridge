import {
  AmqpGolemMessage,
  EmptyCliOptions,
  GolemSoundServiceInterface,
  ServicesConstructorInterface,
  SoundGenerationResponse,
  WorkspaceServiceInterface,
} from "types";
import GolemService from "./golem.service";
import { send } from "process";

export class GolemSoundService
  extends GolemService
  implements GolemSoundServiceInterface
{
  private workspaceService: WorkspaceServiceInterface;

  constructor(
    cliOptions: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    super(cliOptions, services);
    this.services = services;
    this.workspaceService = services["WorkspaceService"];
  }

  async handleWavResponse(message: AmqpGolemMessage): Promise<boolean> {
    this.handleGolemResponse(message, "text_to_speech");
    return true;
  }

  async handleAsrResponse(message: AmqpGolemMessage): Promise<boolean> {
    this.handleGolemResponse(message, "asr");
    return true;
  }

  async saveSoundFile(
    savePath: string,
    data: any,
    userId: number,
    isBase64: boolean = true
  ): Promise<string> {
    const buffer = isBase64 ? Buffer.from(data, "base64") : data;
    await this.workspaceService.createFolderByUserId(
      userId,
      "apps/sound-studio"
    );

    return await this.workspaceService.saveFileByUserId(
      userId,
      savePath,
      buffer,
      false
    );
  }

  async automaticSpeechRecognition(
    url: string,
    userId: number,
    routingKey?: string
  ): Promise<any> {
    return new Promise(async (resolve, reject) => {
      if (!url) {
        reject(Error(`invalid file url provided`));
        return;
      }

      // make sure we have a skill online
      const allowFallback = !routingKey ? true : false;
      const useRoutingKey = this.getOnlineSkill(
        routingKey,
        "text_to_speech",
        allowFallback
      );
      if (!useRoutingKey) {
        const error = !allowFallback
          ? `skill ${routingKey} is not online`
          : `no skills of type text_to_speech is not online`;
        reject(Error(error));
        return;
      }
      const sendHeaders = this.createJob(routingKey, resolve, reject, userId);

      // send command to elemental golem
      await this.sendGolemMessage(
        useRoutingKey,
        "core_sound_service_asr",
        { audio_url: url },
        sendHeaders
      );
    });
  }

  async textToSpeech(
    prompt: string,
    userId: number,
    voice?: string,
    routingKey?: string,
    reportProgress: boolean = false,
    progressTarget?: string
  ): Promise<SoundGenerationResponse> {
    return new Promise(async (resolve, reject) => {
      if (!prompt) {
        reject(Error(`invalid prompt provided`));
        return;
      }

      // make sure we have a skill online
      const allowFallback = !routingKey ? true : false;
      const useRoutingKey = this.getOnlineSkill(
        routingKey,
        "text_to_speech",
        allowFallback
      );
      if (!useRoutingKey) {
        const error = !allowFallback
          ? `skill ${routingKey} is not online`
          : `no skills of type text_to_speech is not online`;
        reject(Error(error));
        return;
      }
      const sendHeaders = this.createJob(routingKey, resolve, reject, userId);

      // send command to elemental golem
      const payload = !voice
        ? { prompt: prompt, progress: reportProgress }
        : { prompt: prompt, progress: reportProgress, voice: voice };

      if (reportProgress && progressTarget)
        sendHeaders["progress_target"] = progressTarget;

      await this.sendGolemMessage(
        useRoutingKey,
        "core_sound_service",
        payload,
        sendHeaders
      );
    });
  }

  async generateSound(
    prompt: string,
    userId: number,
    guidanceScale: number = 3,
    generationLength: number = 7,
    routingKey?: string,
    reportProgress: boolean = false,
    progressTarget?: string
  ): Promise<SoundGenerationResponse> {
    return new Promise(async (resolve, reject) => {
      if (!prompt) {
        reject(Error(`invalid prompt provided`));
        return;
      }

      // make sure we have a skill online
      const allowFallback = !routingKey ? true : false;
      const useRoutingKey = this.getOnlineSkill(
        routingKey,
        "music_generation",
        allowFallback
      );
      if (!useRoutingKey) {
        const error = !allowFallback
          ? `skill ${routingKey} is not online`
          : `no skills of type text_to_speech is not online`;
        reject(Error(error));
        return;
      }
      const sendHeaders = this.createJob(routingKey, resolve, reject, userId);
      if (reportProgress && progressTarget)
        sendHeaders["progress_target"] = progressTarget;

      // send command to elemental golem
      const payload = {
        prompt: prompt,
        guidance_scale: guidanceScale,
        seconds: generationLength,
        progress: reportProgress,
      };

      await this.sendGolemMessage(
        useRoutingKey,
        "core_sound_service",
        payload,
        sendHeaders
      );
    });
  }
}

export default GolemSoundService;
