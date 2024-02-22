import { PluginSystem } from "../../../plugin";
import {
  GolemSoundServiceInterface,
  LoggerServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
  SocketMessage,
  SocketsServiceInterface,
  SpellbookServiceInterface,
  WorkspaceServiceInterface,
} from "types";
import { promises as fs } from "fs";
import SoundFile from "./model/sound.file.model";

interface GraphQlSoundDelete {
  id: number;
  user_id: number;
}

interface GraphQlSoundUpdateLabel {
  id: number;
  user_id: number;
  label: string;
}

export class SoundStudioApp {
  private services: ServicesConstructorInterface;
  private socketService: SocketsServiceInterface;
  private logger: LoggerServiceInterface;
  private modelService: SequelizeServiceInterface;
  private spellbookService: SpellbookServiceInterface;
  private workspaceService: WorkspaceServiceInterface;
  private soundService: GolemSoundServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.socketService = services["SocketService"];
    this.modelService = services["SequelizeService"];
    this.spellbookService = services["SpellbookService"];
    this.workspaceService = services["WorkspaceService"];
    this.soundService = services["GolemSoundService"];
  }

  @PluginSystem
  async deleteSoundFile(args: GraphQlSoundDelete, info) {
    try {
      const loadedFile = await this.loadModelAndCheckUser(
        args.id,
        args.user_id,
        "SoundFile"
      );
      if (!loadedFile) return { id: 0 };

      await this.workspaceService.deleteFileDirect(loadedFile.filepath);
      const deleteFile = this.modelService.create("SoundFile");
      await deleteFile.destroy({ where: { id: args.id } });
      this.logger.info(`deleted sound file with id ${args.id}`);
      return { id: args.id };
    } catch (ex) {
      this.logger.error(`error deleting sound file ${args.id}`, {}, ex);
    }
    return { id: 0 };
  }

  @PluginSystem
  async updateSoundFileLabel(args: GraphQlSoundUpdateLabel, info) {
    try {
      const loadedFile = await this.loadModelAndCheckUser(
        args.id,
        args.user_id,
        "SoundFile"
      );
      if (!loadedFile) return { id: 0 };
      await loadedFile.update({ label: args.label });
      return { id: loadedFile.id };
    } catch (ex) {
      this.logger.error(`error updating sound file label ${args.id}`, {}, ex);
    }
    return { id: 0 };
  }

  @PluginSystem
  async handleAsrFileUpload(message: SocketMessage) {
    const filePath = message.payload.filename;
    const asrSkills = this.spellbookService.getOnlineSkillFromType(
      "automatic_speech_recognition"
    );
    if (!asrSkills) {
      this.finishJob(message.user_id, "app_sound_studio_process_asr", {
        id: 0,
      });
      this.logger.error(`no asr skills are loaded`);
      return;
    }

    let lastId = 0;
    const userId = message.user_id;
    const fileExtParts = filePath.split(".");
    const fileExt = fileExtParts[fileExtParts.length - 1];
    const time = Date.now().toString();
    const useModels = message.payload?.use_models || [];

    for (let i = 0; i < useModels.length; i++) {
      try {
        const newFileName = `workspace/${message.user_id}/apps/sound-studio/asr-${time}-${i}.${fileExt}`;
        await fs.writeFile(newFileName, await fs.readFile(filePath));
        const shortPath = newFileName.replace(`workspace/${userId}`, "");
        const url = await this.workspaceService.getUserFileUrl(
          userId,
          shortPath,
          1
        );

        const resp = await this.soundService.automaticSpeechRecognition(
          url,
          userId,
          useModels[i]
        );

        lastId = await this.createAsrRecord(
          resp.text,
          useModels[i],
          `asr-${time}-${i}.${fileExt}`,
          newFileName,
          userId
        );
      } catch (ex) {
        this.logger.error(ex.message);
      }
    }

    this.finishJob(message.user_id, "app_sound_studio_process_asr", {
      id: lastId,
    });
    await this.workspaceService.deleteFileDirect(filePath);
  }

  @PluginSystem
  async handleAsrWav(message: SocketMessage): Promise<void> {
    const asrSkills = this.spellbookService.getOnlineSkillFromType(
      "automatic_speech_recognition"
    );
    if (!asrSkills) {
      this.finishJob(message.user_id, "app_sound_studio_process_asr", {
        id: 0,
      });
      this.logger.error(`no asr skills are loaded`);
      return;
    }

    let lastId = 0;
    const userId = message.user_id;
    const base64Data = message.payload.wav.replace(
      `data:audio/${message.payload.file_type};base64,`,
      ""
    );
    const time = Date.now().toString();
    const useModels = message.payload?.use_models || [];

    for (let i = 0; i < useModels.length; i++) {
      const fileName = `apps/sound-studio/asr-${time}-${i}.${message.payload.file_type}`;
      const filePath = await this.soundService.saveSoundFile(
        fileName,
        base64Data,
        userId
      );

      const shortPath = filePath.replace(`workspace/${message.user_id}`, "");
      const url = await this.workspaceService.getUserFileUrl(
        userId,
        shortPath,
        1
      );

      try {
        const resp = await this.soundService.automaticSpeechRecognition(
          url,
          userId,
          useModels[i]
        );

        lastId = await this.createAsrRecord(
          resp.text,
          useModels[i],
          `asr-${time}-${i}.${message.payload.file_type}`,
          filePath,
          userId
        );
      } catch (ex) {
        this.logger.error(ex.message);
      }
    }

    this.finishJob(message.user_id, "app_sound_studio_process_asr", {
      id: lastId,
    });
  }

  @PluginSystem
  async handleGenerateSound(message: SocketMessage): Promise<void> {
    const generators = this.spellbookService.getOnlineSkillFromType(
      message.payload.type
    );

    const generationType = message.payload?.type || "invalid_payload";
    if (!generators) {
      this.finishJob(message.user_id, "app_sound_studio_generate", { id: 0 });
      this.logger.error(`no ${generationType} generators are loaded`);
      return;
    }

    const prompt = message?.payload?.prompt;
    const modelsList = message?.payload?.models || [];
    const xttsVoice = message?.payload?.options?.xtts_voice || "default";
    const barkVoice =
      message?.payload?.options?.bark_voice || "v2/en_speaker_0";
    const userId = message.user_id;
    const guidanceScale = message?.payload?.options?.guidance_scale || 3;
    const generationLength = message?.payload?.options?.generation_length || 7;
    message?.payload?.options?.bark_voice || "v2/en_speaker_0";

    if (!prompt || !modelsList.length) {
      this.finishJob(message.user_id, "app_sound_studio_generate", { id: 0 });
      this.logger.error(
        `invalid parameter passed to generate sound application`
      );
      return;
    }

    let lastId = 0;
    for (let i = 0; i < modelsList.length; i++) {
      let voice = null;
      let label = "Default";
      const useSkill = modelsList[i];

      if (useSkill.indexOf("bark") !== -1) {
        voice = barkVoice;
        const parts = voice.split("_");
        label = `Voice #${parseInt(parts[parts.length - 1]) + 1}`;
      } else if (useSkill.indexOf("xtts") !== -1 && xttsVoice != "default") {
        const soundFile = await this.loadSoundFileByColumn(
          "filepath",
          xttsVoice,
          message.user_id
        );
        label = soundFile.label;

        try {
          const shortPath = xttsVoice.replace(`workspace/${userId}`, "");
          const url = await this.workspaceService.getUserFileUrl(
            userId,
            shortPath,
            1
          );
          voice = url;
        } catch (ex) {
          this.logger.error(ex.message);
          continue;
        }
      }

      try {
        let soundResponse = null;
        if (generationType == "text_to_speech") {
          soundResponse = await this.soundService.textToSpeech(
            prompt,
            userId,
            voice,
            modelsList[i]
          );
        } else {
          soundResponse = await this.soundService.generateSound(
            prompt,
            userId,
            guidanceScale,
            generationLength,
            modelsList[i],
            true,
            "app_sound_studio_generate"
          );
        }
        lastId = await this.handleSaveWav(
          soundResponse.wav,
          userId,
          prompt,
          label,
          modelsList[i],
          message.payload.type
        );
      } catch (ex) {
        this.logger.error(ex.message);
      }
    }

    this.finishJob(message.user_id, "app_sound_studio_generate", {
      id: lastId,
    });
  }

  @PluginSystem
  private async handleSaveWav(
    wav: string,
    userId: number,
    prompt: string,
    label: string,
    modelUsed: string,
    type: string
  ): Promise<number> {
    const time = Date.now().toString();
    const fileName = `apps/sound-studio/${time}.wav`;
    const filePath = await this.soundService.saveSoundFile(
      fileName,
      wav,
      userId
    );

    const saveType = type == "text_to_speech" ? "tts" : "sound";
    const modelDetails = this.spellbookService.getSkillFromKey(modelUsed);
    const fileModel = this.modelService.create("SoundFile");
    const newRecord = await fileModel.create({
      type: saveType,
      filename: `${time}.wav`,
      filepath: filePath,
      model_used: modelDetails.label,
      size: 0,
      user_id: userId,
      text: prompt,
      label: label,
    });

    this.logger.info(`wav file saved to ${filePath} for ${userId}`, {
      icon: "🎶",
    });
    return newRecord.id;
  }

  @PluginSystem
  private finishJob(userId: number, command: string, additionalData?: any) {
    const payload = additionalData ? additionalData : { command: command };
    if (additionalData) payload["command"] = command;
    this.socketService.emitToUser(userId, "finish_command", payload);
  }

  @PluginSystem
  private async loadSoundFileByColumn(
    valueName: string,
    value: string,
    userId: number
  ): Promise<SoundFile> {
    return new Promise(async (resolve, reject) => {
      const where = {};
      const model = this.modelService.create("SoundFile");
      where[valueName] = value;
      const loadedResource = await model.findOne({
        where: where,
      });

      if (!loadedResource || loadedResource.user_id != userId) {
        reject(
          Error(
            `user id ${userId} trying to access sound file ${value} belonging to another user`
          )
        );
        return;
      }
    });
  }

  @PluginSystem
  private async createAsrRecord(
    text: string,
    routingKey: string,
    fileName: string,
    filePath: string,
    userId: number
  ): Promise<number> {
    const modelDetails = this.spellbookService.getSkillFromKey(routingKey);
    const fileModel = this.modelService.create("SoundFile");
    const newRecord = await fileModel.create({
      type: "asr",
      filename: fileName,
      filepath: filePath,
      model_used: modelDetails.label,
      size: 0,
      user_id: userId,
      text: text.trim(),
    });
    return newRecord.id;
  }

  @PluginSystem
  private async loadModelAndCheckUser(
    resourceId: number,
    userId: number,
    modelName: string = "SoundFile"
  ): Promise<any> {
    const book = this.modelService.create(modelName);
    const loadedResource = await book.findByPk(resourceId);
    if (!loadedResource || loadedResource.user_id != userId) {
      this.logger.error(
        `user id ${userId} trying to access ${modelName} belonging to another user`
      );
      return null;
    }
    return loadedResource;
  }
}

export default SoundStudioApp;
