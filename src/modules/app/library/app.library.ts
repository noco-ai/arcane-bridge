import { PluginSystem } from "../../../plugin";
import {
  AmqpGolemMessage,
  AmqpServiceInterface,
  GolemEmbeddingServiceInterface,
  GolemImageServiceInterface,
  GolemLlmServiceInterface,
  LoggerServiceInterface,
  PersistentMapServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
  SocketMessage,
  SocketsServiceInterface,
  SpellbookServiceInterface,
  WorkspaceServiceInterface,
} from "types";
import EPub from "epub";
import { FictionalWorldMap } from "./world.map";

export class LibraryApp {
  private services: ServicesConstructorInterface;
  private socketService: SocketsServiceInterface;
  private logger: LoggerServiceInterface;
  private modelService: SequelizeServiceInterface;
  private spellbookService: SpellbookServiceInterface;
  private workspaceService: WorkspaceServiceInterface;
  private mapService: PersistentMapServiceInterface;
  private imageService: GolemImageServiceInterface;
  private llmService: GolemLlmServiceInterface;
  private amqpService: AmqpServiceInterface;
  private runningJobs: Map<string, any>;
  private embeddingService: GolemEmbeddingServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.socketService = services["SocketService"];
    this.modelService = services["SequelizeService"];
    this.spellbookService = services["SpellbookService"];
    this.workspaceService = services["WorkspaceService"];
    this.mapService = services["PersistentMapService"];
    this.imageService = services["GolemImageService"];
    this.llmService = services["GolemLlmService"];
    this.amqpService = services["AmqpService"];
    this.embeddingService = services["GolemEmbeddingService"];
    this.runningJobs = this.mapService.createMap("app_library_jobs");
  }

  private async loadEpub(epub): Promise<void> {
    return new Promise((resolve, reject) => {
      epub.on("end", resolve);
      epub.on("error", reject);
      epub.parse();
    });
  }

  private async updateJobProgress(
    jobName: string,
    userId: number
  ): Promise<boolean> {
    if (!(await this.runningJobs.has(jobName))) {
      this.logger.error(`invalid running job was given`);
      return false;
    }

    const currentJob = await this.runningJobs.get(jobName);
    if (++currentJob.finished_requests >= currentJob.total_requests) {
      await this.runningJobs.delete(jobName);
    } else {
      await this.runningJobs.set(jobName, currentJob);
    }

    // send progress update to UI
    this.socketService.emitToUser(userId, "progress_bar_update", {
      total: currentJob.total_requests,
      current: currentJob.finished_requests,
      label: "",
      target: "app_library",
      job: jobName,
    });
    return true;
  }

  async handleGetJobStatus(message: SocketMessage) {
    const jobStatus = {};
    const jobNames = message.payload?.jobs || [];
    for (let i = 0; i < jobNames.length; i++) {
      if (!(await this.runningJobs.has(jobNames[i]))) {
        jobStatus[jobNames[i]] = { running: false };
        continue;
      }
      jobStatus[jobNames[i]] = await this.runningJobs.get(jobNames[i]);
      jobStatus[jobNames[i]].running = true;
    }

    this.socketService.emitToUser(message.user_id, "finish_command", {
      command: "app_library_get_job_status",
      status: jobStatus,
    });
  }

  async handleImagePromptUpdate(message: AmqpGolemMessage) {
    const originalHeaders = message.properties.headers;
    if (!originalHeaders.success) {
      this.logger.error(originalHeaders.errors.join(", "));
      return;
    }

    if (!this.updateJobProgress(originalHeaders.job, originalHeaders.user_id))
      return true;

    const content = JSON.parse(message.content);
    try {
      const json = JSON.parse(content.content);
      if (!json.modified_prompt) {
        this.logger.error(`invalid JSON structure for modified image prompt`);
        return true;
      }
      this.logger.info(`generating image for fiction novel`, { icon: "🎨" });

      const headers = {
        model_name: originalHeaders.image_model,
        analysis_id: originalHeaders.analysis_id,
        book_id: originalHeaders.book_id,
        user_id: originalHeaders.user_id,
        job: `book-${originalHeaders.book_id}-${originalHeaders.job_type}-images`,
        job_type: originalHeaders.job_type,
        modified_prompt: json.modified_prompt,
      };

      const payload = {
        prompt: json.modified_prompt,
        guidance_scale: originalHeaders.guidance_scale,
        steps: originalHeaders.steps,
        height: 1024,
        width: 1024,
      };

      await this.spellbookService.publishCommand(
        "golem_skill",
        originalHeaders.image_model,
        "app_library_generate_analysis_image",
        payload,
        headers
      );
    } catch (ex) {}
    return true;
  }

  async handleAnalysisImageResponse(message: AmqpGolemMessage) {
    const headers = message.properties.headers;
    if (!headers.success) {
      this.logger.error(headers.errors.join(", "));
      return;
    }

    if (!this.updateJobProgress(headers.job, headers.user_id)) {
      return true;
    }

    const content = JSON.parse(message.content);
    const imageBuffer = Buffer.from(content.image, "base64");
    const analysisId = headers.analysis_id;
    const time = Date.now().toString() + "-" + analysisId;
    const fileName = `apps/library/${time}.png`;
    await this.workspaceService.createFolderByUserId(
      headers.user_id,
      "apps/library"
    );
    const filePath = await this.workspaceService.saveFileByUserId(
      headers.user_id,
      fileName,
      imageBuffer,
      false
    );

    const analysisModel = this.modelService.create("LibraryBookAnalysis");
    const loadedAnalysis = await analysisModel.findByPk(analysisId);
    const json = JSON.parse(loadedAnalysis.result);
    json.image = filePath;
    json.image_prompt = headers.modified_prompt;
    await loadedAnalysis.update({
      result: JSON.stringify(json),
    });
  }

  async handleMergeCharacterRaw(message: AmqpGolemMessage) {
    const headers = message.properties.headers;
    if (!headers.success) {
      this.logger.error(headers.errors.join(", "));
      return;
    }

    const jobName = `book-${headers.book_id}-merge-fiction-characters-raw`;
    if (!this.updateJobProgress(jobName, headers.user_id)) {
      return true;
    }

    const response = JSON.parse(message.content);
    let responseJson = {};
    try {
      responseJson = JSON.parse(response.content);
    } catch (ex) {
      this.logger.error(`invalid refined character json`);
      return true;
    }

    // update records to be marked as processed
    if (headers.analysis_ids) {
      for (let i = 0; i < headers.analysis_ids.length; i++) {
        const idAndIndex = headers.analysis_ids[i].split(":");
        const analysisModel = this.modelService.create("LibraryBookAnalysis");
        const loadedModel = await analysisModel.findByPk(idAndIndex[0]);
        const jsonData = JSON.parse(loadedModel.result);
        jsonData[idAndIndex[1]].processed = true;
        await loadedModel.update({ result: JSON.stringify(jsonData) });
      }
    }

    const analysisModel = this.modelService.create("LibraryBookAnalysis");
    responseJson["found_in_content"] = headers.analysis_ids?.length || 1;
    await analysisModel.create({
      content_id: 0,
      user_id: headers.user_id,
      process: headers.process,
      book_id: headers.book_id,
      result: JSON.stringify(responseJson),
      model_name: response.model,
      prompt_tokens: response.prompt_tokens,
      completion_tokens: response.completion_tokens,
    });

    this.logger.info(`saving merged character to the database`, { icon: "🎯" });
    return true;
  }

  private async loadModelAndCheckUser(
    bookId: number,
    userId: number,
    modelName: string = "LibraryBook"
  ): Promise<any> {
    const book = this.modelService.create(modelName);
    const loadedResource = await book.findByPk(bookId);
    if (!loadedResource || loadedResource.user_id != userId) {
      this.logger.error(
        `user id ${userId} trying to access ${modelName} belonging to another user`
      );
      return null;
    }
    return loadedResource;
  }

  async handleGenerateWorldMap(message: SocketMessage) {
    const loadedBook = await this.loadModelAndCheckUser(
      message.payload.id,
      message.user_id,
      "LibraryBook"
    );
    if (!loadedBook) return;

    const world = new FictionalWorldMap(48, 48);
    world.addMountain(3, 3);
    world.addOcean(1, 1);
    world.addLocation(5, 5, "Mystic City");
    world.addLocation(24, 12, "City 2");
    world.addLocation(7, 7, "Hidden Village");
    world.fillClusters();
    world.connectLocationsWithRoads();
    world.printMap();

    const html = world.printMapAsHTML();
    this.socketService.emitToUser(message.user_id, "finish_command", {
      command: "app_mudd_world_map",
      html: html,
    });
    return true;
  }

  async handleRefineCharacters(message: SocketMessage) {
    const bookId = message.payload.id || 0;
    const loadedBook = await this.loadModelAndCheckUser(
      bookId,
      message.user_id,
      "LibraryBook"
    );
    if (!loadedBook) return;

    const useModel = message.payload?.use_model || null;
    const useEmbeddingModel = message.payload?.use_embedding_model || null;
    if (!this.spellbookService.getOnlineSkillFromKey(useModel)) {
      this.logger.error(`${useModel} is not online for analysis`);
      return;
    }
    if (!this.spellbookService.getOnlineSkillFromKey(useEmbeddingModel)) {
      this.logger.error(`${useModel} is not online for embedding generation`);
      return;
    }

    const analysisModel = this.modelService.create("LibraryBookAnalysis");
    const loadedAnalysis = await analysisModel.findAll({
      where: {
        book_id: bookId,
        process: "fiction_characters",
        user_id: message.user_id,
      },
    });

    const text = [];
    let stringMap = {};
    for (let i = 0; i < loadedAnalysis.length; i++) {
      try {
        const json = JSON.parse(loadedAnalysis[i].result);
        for (let j = 0; j < json.length; j++) {
          if (json[j]?.processed == true) continue;
          if (!stringMap[json[j].name.toUpperCase()]) {
            stringMap[json[j].name.toUpperCase()] = true;
            text.push(json[j].name);
          }
        }
      } catch (ex) {}
    }

    let resp = null;
    try {
      resp = await this.embeddingService.generateEmbedding(
        text,
        useEmbeddingModel,
        message.user_id
      );
    } catch (ex) {
      this.logger.error(ex.message);
      return true;
    }

    let similarGroups = {};
    let grouped = new Set();

    // Compare each string with every other string
    Object.keys(resp.embeddings).forEach((key) => {
      if (!grouped.has(key)) {
        similarGroups[key] = similarGroups[key] || [];
        Object.keys(resp.embeddings).forEach((otherKey) => {
          if (key !== otherKey && !grouped.has(otherKey)) {
            let similarity = this.embeddingService.cosineSimilarity(
              resp.embeddings[key][0],
              resp.embeddings[otherKey][0]
            );
            if (similarity >= 0.95) {
              similarGroups[key].push(otherKey);
              grouped.add(otherKey);
            }
          }
        });
        grouped.add(key);
      }
    });

    const characters = {};
    for (let i = 0; i < loadedAnalysis.length; i++) {
      try {
        const json = JSON.parse(loadedAnalysis[i].result);
        for (let j = 0; j < json.length; j++) {
          let foundName: boolean = false;
          let commonName: string = null;
          for (const nameKey in similarGroups) {
            if (json[j].name == nameKey) {
              foundName = true;
              commonName = nameKey;
              break;
            }
            for (let k = 0; k < similarGroups[nameKey].length; k++) {
              if (similarGroups[nameKey][k] == json[j].name) {
                foundName = true;
                commonName = nameKey;
                break;
              }
            }
          }
          if (foundName) {
            if (!characters[commonName]) characters[commonName] = [];
            json[j].analysis_id = loadedAnalysis[i].id;
            json[j].analysis_index = j;
            characters[commonName].push(json[j]);
          }
        }
      } catch (ex) {}
    }

    let totalCount = 0;
    for (const characterName in characters) {
      const characterData = {
        name: characterName,
        personality_description: [],
        physical_description: [],
      };

      let personalityCount = 1;
      let physicalCount = 1;
      const analysisIds = [];
      for (let i = 0; i < characters[characterName].length; i++) {
        const current = characters[characterName][i];
        if (current.name.length > characterData.name)
          characterData.name = current.name;

        if (current.personality_description) {
          characterData.personality_description.push(
            `#${personalityCount}: ${current.personality_description}`
          );
          personalityCount++;
        }
        if (current.physical_description) {
          characterData.physical_description.push(
            `#${physicalCount}: ${current.physical_description}`
          );
          physicalCount++;
        }
        analysisIds.push(`${current.analysis_id}:${current.analysis_index}`);
      }

      const payloadString = `Character name: ${
        characterData.name
      }\nPersonality Descriptions:\n${characterData.personality_description.join(
        "\n"
      )}\n\nPhysical Descriptions:\n${characterData.physical_description.join(
        "\n"
      )}`;
      totalCount++;

      const sendHeaders = {
        model_name: useModel,
        analysis_id: 0,
        process: "fiction_character_merge",
        book_id: bookId,
        user_id: message.user_id,
        job: `book-${bookId}-merge-fiction-characters-raw`,
        analysis_ids: analysisIds,
      };

      const payload = await this.loadPayload(
        "fiction_character_merge",
        payloadString
      );

      await this.spellbookService.publishCommand(
        "golem_skill",
        useModel,
        "app_library_fiction_character_merge",
        payload,
        sendHeaders
      );
    }

    await this.runningJobs.set(`book-${bookId}-merge-fiction-characters-raw`, {
      total_requests: totalCount,
      finished_requests: 0,
      routing_key: useModel,
      user_id: message.user_id,
    });
    return true;
  }

  async handleMergeRefinedCharacters(message: SocketMessage) {
    const fromModel = await this.loadModelAndCheckUser(
      message.payload.id,
      message.user_id,
      "LibraryBookAnalysis"
    );
    const toModel = await this.loadModelAndCheckUser(
      message.payload.to_id,
      message.user_id,
      "LibraryBookAnalysis"
    );

    let error = false;
    if (!fromModel || !toModel) error = true;
    let fromJson = null;
    let toJson = null;
    try {
      fromJson = JSON.parse(fromModel?.result || "");
      toJson = JSON.parse(toModel?.result || "");
    } catch (ex) {
      error = true;
    }

    if (error) {
      this.spellbookService.sendToastMessage(
        message.socket_id,
        "Error merging characters",
        "Could not merge characters one or both could not be loaded.",
        "error"
      );
      return;
    }

    let physical1 = fromJson?.physical_description || "";
    if (Array.isArray(physical1)) physical1.join(" ");
    let physical2 = toJson?.physical_description || "";
    if (Array.isArray(physical2)) physical2.join(" ");

    const prompt =
      `Personality Description #1: ${fromJson.personality_description}\nPersonality Description #2: ${toJson.personality_description}\n\n` +
      `Physical Description #1: ${physical1}\nPhysical Description #2: ${physical2}`;

    // send message to UI
    this.spellbookService.sendToastMessage(
      message.socket_id,
      "Merging characters",
      "Characters merging is in progress. When complete the character data will refresh.",
      "success"
    );

    const payload = await this.loadPayload(
      "fiction_character_merge_refined",
      prompt
    );
    const llmResponse = await this.llmService.generateFromPayload(
      payload,
      "api_34b_gguf",
      message.user_id
    );

    try {
      const newJson = JSON.parse(llmResponse.content);
      toJson.physical_description = newJson.physical_description;
      toJson.personality_description = newJson.personality_description;
      await toModel.update({ result: JSON.stringify(toJson) });
      await this.workspaceService.deleteFileDirect(fromJson.image);
      const deleteAnalysis = this.modelService.create("LibraryBookAnalysis");
      await deleteAnalysis.destroy({ where: { id: message.payload.id } });

      // update UI
      this.socketService.emitToUser(message.user_id, "finish_command", {
        command: "app_library_merge_refined_characters",
        remove_id: fromModel.id,
        updated_id: toModel.id,
        physical_description: newJson.physical_description,
        personality_description: newJson.personality_description,
      });
    } catch (ex) {
      this.logger.error(`invalid json provided from merge process`, {}, ex);
      this.spellbookService.sendToastMessage(
        message.socket_id,
        "Error merging characters",
        "Could not merge characters error occurred while updating database.",
        "error"
      );
    }
  }

  async handleRegenerateArt(message: SocketMessage) {
    this.spellbookService.sendToastMessage(
      message.socket_id,
      "Generating Image",
      "The image is now regenerating, it will refresh when it is finished.",
      "success"
    );

    const loadedModel = await this.loadModelAndCheckUser(
      message.payload.resource_id,
      message.user_id,
      "LibraryBookAnalysis"
    );

    if (!loadedModel) return;
    const prompt = message.payload?.prompt || "";
    const modelResponse = await this.imageService.generateImage(
      message.user_id,
      prompt,
      message.payload.use_model
    );

    const imageBuffer = Buffer.from(modelResponse.image, "base64");
    const json = JSON.parse(loadedModel.result);
    const originalFile = json.image.split(".");
    const newFile = originalFile[0] + "-1." + originalFile[1];
    json.image = newFile;
    json.image_prompt = prompt;
    await loadedModel.update({ result: JSON.stringify(json) });

    await this.workspaceService.createFolderByUserId(
      message.user_id,
      "apps/library"
    );

    await this.workspaceService.saveFileByUserId(
      message.user_id,
      json.image.replace(`workspace/${message.user_id}/`, ""),
      imageBuffer,
      false
    );

    // update UI
    this.socketService.emitToUser(message.user_id, "finish_command", {
      command: "app_library_regenerate_art",
      resource_type: message.payload.resource_type,
      resource_id: message.payload.resource_id,
      image: newFile,
    });
  }

  async handleGenerateArt(message: SocketMessage) {
    const loadedBook = await this.loadModelAndCheckUser(
      message.payload.id,
      message.user_id,
      "LibraryBook"
    );
    if (!loadedBook) return;

    this.logger.info(`generating artwork for book`, { icon: "📚" });
    let process = "fiction_scene";
    let jobName = `fiction-locations`;
    if (message.payload.resource_type == "characters") {
      process = "fiction_character_merge";
      jobName = `fiction-characters`;
    }

    const analysisModel = this.modelService.create("LibraryBookAnalysis");
    const loadedAnalysis = await analysisModel.findAll({
      where: {
        book_id: message.payload.id,
        process: process,
        user_id: message.user_id,
      },
    });

    const generators =
      this.spellbookService.getOnlineSkillFromType("image_generation") || [];

    if (!generators.includes(message.payload.use_model)) {
      this.logger.error(`model ${message.payload.use_model} is not online`);
      return true;
    }

    const useModel = message.payload.use_model || generators[0];
    const artStyle = message.payload.art_style || "Oil Painting";
    const artist = message.payload.artist || "";

    let totalCount = 0;
    const reasoningAgent = await this.spellbookService.getReasoningAgent();

    for (let i = 0; i < loadedAnalysis.length; i++) {
      try {
        const json = JSON.parse(loadedAnalysis[i].result);
        if (json.image) continue;

        totalCount++;
        const artPrompt = artist.length
          ? `Original Prompt: ${json.image_prompt}\nArt Style: ${artStyle}\nArtist: ${artist}`
          : `Original Prompt: ${json.image_prompt}\nArt Style: ${artStyle}`;
        const payload = await this.loadPayload(
          "fiction_image_style",
          artPrompt
        );

        const headers = {
          model_name: reasoningAgent,
          analysis_id: loadedAnalysis[i].id,
          process: "fiction_image_style",
          book_id: message.payload.id,
          image_model: useModel,
          user_id: message.user_id,
          guidance_scale: message.payload.guidance_scale,
          steps: message.payload.steps,
          job: `book-${message.payload.id}-${jobName}-image-prompts`,
          job_type: jobName,
        };

        await this.spellbookService.publishCommand(
          "golem_skill",
          reasoningAgent,
          "app_library_image_style",
          payload,
          headers
        );
      } catch (ex) {}

      await this.runningJobs.set(
        `book-${message.payload.id}-${jobName}-image-prompts`,
        {
          total_requests: totalCount,
          finished_requests: 0,
          routing_key: "api_34b_gguf",
          user_id: message.user_id,
        }
      );

      await this.runningJobs.set(
        `book-${message.payload.id}-${jobName}-images`,
        {
          total_requests: totalCount,
          finished_requests: 0,
          routing_key: useModel,
          user_id: message.user_id,
        }
      );
    }
  }

  async handleAnalysisResponse(message: AmqpGolemMessage): Promise<boolean> {
    const headers = message.properties.headers;
    const jobName = headers.job || `book-${headers.book_id}-ai-analysis`;
    if (!this.updateJobProgress(jobName, headers.user_id)) {
      return true;
    }

    if (!headers.success) {
      this.logger.error(headers.errors.join(", "));
      return true;
    }

    let updateAnalysisRecord = true;
    try {
      // save analysis to db
      const response = JSON.parse(message.content.toString());
      const analysisModel = this.modelService.create("LibraryBookAnalysis");
      if (response.content?.trim().length) {
        await analysisModel.create({
          content_id: headers.content_id,
          process: headers.process,
          book_id: headers.book_id,
          user_id: headers.user_id,
          result: response.content,
          model_name: response.model,
          prompt_tokens: response.prompt_tokens,
          completion_tokens: response.completion_tokens,
        });
        updateAnalysisRecord = true;
      }
    } catch (ex) {
      this.logger.error(
        `error creating analysis record invalid JSON from handler`
      );
      return true;
    }

    // update content model to mark this analysis as complete
    const contentModel = this.modelService.create("LibraryBookContent");
    const loadedRecord = await contentModel.findByPk(headers.content_id);
    try {
      if (updateAnalysisRecord) {
        let newProcessed = JSON.parse(loadedRecord.processed_analysis);
        if (!newProcessed.includes(headers.process))
          newProcessed.push(headers.process);
        await loadedRecord.update({
          processed_analysis: JSON.stringify(newProcessed),
        });
      }
    } catch (ex) {
      this.logger.error(
        `error creating analysis record invalid JSON stored in database`
      );
      return true;
    }

    this.logger.info(`creating analysis record for ${headers.process}`);
    return true;
  }

  private async processContentChunk(
    contentId: number,
    content: string,
    analysisJobs: string[],
    bookId: number,
    userId: number,
    useModel: string
  ) {
    for (let j = 0; j < analysisJobs.length; j++) {
      const payload = await this.loadPayload(analysisJobs[j], content);
      if (!payload) {
        this.logger.error(`invalid analysis job ${analysisJobs[j]}`);
        continue;
      }

      const headers = {
        model_name: useModel,
        content_id: contentId,
        process: analysisJobs[j],
        book_id: bookId,
        user_id: userId,
        job: `book-${bookId}-ai-analysis`,
      };

      await this.spellbookService.publishCommand(
        "golem_skill",
        useModel,
        "app_library_analysis",
        payload,
        headers
      );
    }
  }

  private async loadPayload(promptKey: string, userMessage: string) {
    const payload = this.spellbookService.getPrompt("app/library", promptKey);
    if (!payload) return null;
    const localCopy = JSON.parse(JSON.stringify(payload));
    localCopy.messages.push({ role: "user", content: userMessage });
    return localCopy;
  }
  /*private async getPayloadFromChatKey(
    uniqueKey: string,
    bookChunk: string,
    startResponse: string
  ) {
    const promptRecord = this.modelService.create("LlmExplorerChat");
    const loadedChat = await promptRecord.findOne({
      where: { unique_key: uniqueKey },
    });
    if (!loadedChat) return null;

    const examplePairs = JSON.parse(loadedChat.examples);
    const messagePairs = [];
    for (let i = 0; i < examplePairs.length; i++) {
      if (examplePairs[i].exclude === "true") continue;
      messagePairs.push({ role: "user", content: examplePairs[i].user });
      messagePairs.push({
        role: "assistant",
        content: examplePairs[i].assistant,
      });
    }

    const messages = [
      { role: "system", content: loadedChat.system_message },
      ...messagePairs,
      { role: "user", content: bookChunk.toString() },
    ];

    const payload = {
      messages: messages,
      top_k: loadedChat.top_k,
      top_p: loadedChat.top_p,
      min_p: loadedChat.min_p,
      temperature: loadedChat.temperature,
      start_response: startResponse,
      stream: false,
      debug: true,
    };

    console.log(JSON.stringify(payload, null, 2));
    return payload;
  }*/

  private chunkContent(content: string, chunkSize: number): string[] {
    let chunks: string[] = [];
    let currentChunk = "";

    content.split(/\s+/).forEach((word) => {
      if (currentChunk.length + word.length > chunkSize) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      currentChunk += word + " ";
    });

    if (currentChunk.trim()) {
      if (currentChunk.trim().length <= 768 && chunks.length > 0) {
        chunks[chunks.length - 1] += " " + currentChunk.trim();
      } else {
        chunks.push(currentChunk.trim());
      }
    }
    return chunks;
  }

  async extractContentsFromSpine(
    epub: EPub,
    bookId: number,
    userId: number
  ): Promise<void> {
    if (!epub) throw new Error("EPub file not loaded");

    for (const item of epub.spine.contents) {
      try {
        const content = await this.getSpineItemContent(epub, item.id);
        const chunks = this.chunkContent(content, 4096);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const contentData = {
            book_id: bookId,
            user_id: userId,
            content: chunk,
            file: item.id,
            length: chunk.length,
            content_index: i,
            word_count: chunk.split(" ").length,
          };
          const model = this.modelService.create("LibraryBookContent");
          await model.create(contentData);
        }
      } catch (error) {
        this.logger.error(`error fetching spine item '${item.id}':`, {}, error);
      }
    }
  }

  private async getSpineItemContent(epub, href: string): Promise<string> {
    return new Promise((resolve, reject) => {
      epub.getChapter(href, (error, text) => {
        if (error) {
          reject(error);
        } else {
          resolve(text);
        }
      });
    });
  }

  async handleStopBookAnalysis(message: SocketMessage) {
    this.logger.info(`stopping job`, { icon: "📚" });

    if (!(await this.runningJobs.has(message.payload.job))) {
      this.logger.error(`no job running ${message.payload.job}`);
      await this.socketService.emitToUser(message.user_id, "finish_command", {
        command: "app_library_stop_job",
        job: message.payload.job,
      });
      return true;
    }

    const currentJob = await this.runningJobs.get(message.payload.job);
    if (currentJob.user_id != message.user_id) {
      this.logger.error(
        `user ${message.user_id} trying to cancel job for another user ${message.payload.job}`
      );
      await this.socketService.emitToUser(message.user_id, "finish_command", {
        command: "app_library_stop_job",
        job: message.payload.job,
      });
      return true;
    }

    await this.amqpService.cancelMessages(
      currentJob.routing_key,
      [`job:${message.payload.job}`],
      currentJob.total_requests - currentJob.finished_requests
    );

    await this.socketService.emitToUser(message.user_id, "finish_command", {
      command: "app_library_stop_job",
      job: message.payload.job,
    });
    await this.runningJobs.delete(message.payload.job);
    return true;
  }

  async handleGenerateQuiz(message: SocketMessage) {
    const bookId = message.payload.id || 0;
    const loadedBook = await this.loadModelAndCheckUser(
      bookId,
      message.user_id,
      "LibraryBook"
    );
    if (!loadedBook) return;

    this.logger.info(`generating quiz for book`, { icon: "📚" });

    const analysisModel = this.modelService.create("LibraryBookAnalysis");
    const loadedAnalysis = await analysisModel.findAll({
      where: {
        book_id: bookId,
        process: "fiction_qa",
        user_id: message.user_id,
      },
    });

    const useModel = message.payload.use_model || "";
    const modelOnline = this.spellbookService.getOnlineSkillFromKey(useModel);
    if (!modelOnline) {
      this.logger.error(`model ${useModel} is not online`);
      return true;
    }

    let totalCount = 0;
    for (let i = 0; i < loadedAnalysis.length; i++) {
      try {
        const loadedContent = await this.loadModelAndCheckUser(
          loadedAnalysis[i].content_id,
          message.user_id,
          "LibraryBookContent"
        );
        if (!loadedContent) continue;

        const jobsFinished = JSON.parse(loadedContent.processed_analysis);
        if (jobsFinished.includes("fiction_generate_quiz")) continue;

        const json = JSON.parse(loadedAnalysis[i].result);
        for (let j = 0; j < json.length; j++) {
          totalCount++;
          const prompt = `Question: ${json[j].question}\nAnswer: ${json[j].answer}\nContent: ${loadedContent.content}`;
          const payload = await this.loadPayload(
            "fiction_quiz_creator",
            prompt
          );

          const headers = {
            model_name: useModel,
            process: "fiction_generate_quiz",
            book_id: bookId,
            user_id: message.user_id,
            content_id: loadedContent.id,
            job: `book-${bookId}-generate-quiz`,
          };

          await this.spellbookService.publishCommand(
            "golem_skill",
            useModel,
            "app_library_analysis",
            payload,
            headers
          );
        }
      } catch (ex) {}

      await this.runningJobs.set(`book-${bookId}-generate-quiz`, {
        total_requests: totalCount,
        finished_requests: 0,
        routing_key: useModel,
        user_id: message.user_id,
      });
    }
  }

  async handleConvertToAlly(message: SocketMessage) {
    const id = message.payload?.id || 0;
    const character = await this.loadModelAndCheckUser(
      id,
      message.user_id,
      "LibraryBookAnalysis"
    );
    const json = JSON.parse(character.result);

    let systemPrompt = json.personality_description || "";
    const reasoningAgent = await this.spellbookService.getReasoningAgent();
    if (reasoningAgent && systemPrompt.length) {
      const payload = await this.loadPayload(
        "fiction_character_to_ally",
        `Name: ${json.name}\n${systemPrompt}`
      );

      const response = await this.llmService.generateFromPayload(
        payload,
        reasoningAgent,
        message.user_id
      );
      if (response?.content?.replace(/^\s+|\s+$/g, "")?.trim().length)
        systemPrompt = response.content;
    }

    const allyModel = await this.modelService.create("DigitalAlly");
    const loadedModel = await allyModel.findOne({
      where: { import_id: id, user_id: message.user_id },
    });
    if (loadedModel) {
      this.spellbookService.sendToastMessage(
        message.socket_id,
        "Error creating ally",
        "This book character has already been converted into a Digital Ally.",
        "error"
      );
      return;
    }

    await this.workspaceService.createFolderByUserId(
      message.user_id,
      "apps/digital-ally"
    );
    const newFile = json.image.replace("library", "digital-ally");
    await this.workspaceService.copyFileDirect(json.image, newFile);
    const newAlly = await allyModel.create({
      name: json.name,
      user_id: message.user_id,
      import_id: id,
      system_message: systemPrompt,
      location_image: "asset/spellbook/core/location-placeholder.jpeg",
      character_image: newFile,
      sort_order: 1000,
    });

    this.spellbookService.sendToastMessage(
      message.socket_id,
      "Created Ally",
      "Converted book character into a Digital Ally",
      "info"
    );

    await this.socketService.emitToUser(message.user_id, "finish_command", {
      command: "app_library_convert_to_ally",
      job: message.payload.job,
    });
  }

  async handleAnalyzeBook(message: SocketMessage) {
    const bookId = message.payload.id;
    const loadedBook = await this.loadModelAndCheckUser(
      bookId,
      message.user_id,
      "LibraryBook"
    );
    if (!loadedBook) return;

    const useModel = message.payload?.use_model || null;
    if (!this.spellbookService.getOnlineSkillFromKey(useModel)) {
      this.logger.error(`${useModel} is not online for analysis`);
      return;
    }

    this.logger.info(`running analysis of book`, { icon: "📚" });
    if (!message.payload.content) {
      this.logger.error(`no content sent with book analysis`);
      return;
    }
    const content = message.payload.content || [];

    let totalCount = 0;
    for (let i = 0; i < content.length; i++) {
      if (!content[i].analyze.length) continue;
      totalCount += content[i].analyze.length;
      await this.processContentChunk(
        content[i].id,
        content[i].content,
        content[i].analyze,
        bookId,
        message.user_id,
        useModel
      );
    }

    await this.runningJobs.set(`book-${bookId}-ai-analysis`, {
      total_requests: totalCount,
      finished_requests: 0,
      routing_key: useModel,
      user_id: message.user_id,
    });
  }

  async handleIngestBook(message: SocketMessage) {
    const loadedBook = await this.loadModelAndCheckUser(
      message.payload.id,
      message.user_id,
      "LibraryBook"
    );
    if (!loadedBook) return;

    this.logger.info(`starting analysis of book ${loadedBook.title}`, {
      icon: "📚",
    });

    const ePub = new EPub("./" + loadedBook.filename);
    await this.loadEpub(ePub);
    await this.extractContentsFromSpine(
      ePub,
      message.payload.id,
      message.user_id
    );
  } //

  async deleteLibraryBookAnalysis(args, info) {
    const loadedAnalysis = await this.loadModelAndCheckUser(
      args.id,
      args.user_id,
      "LibraryBookAnalysis"
    );
    if (!loadedAnalysis) return { id: 0 };

    const deleteAnalysis = this.modelService.create("LibraryBookAnalysis");
    deleteAnalysis.destroy({ where: { id: args.id } });
    return { id: args.id };
  }

  async updateLibraryBookAnalysis(args, info) {
    const loadedAnalysis = await this.loadModelAndCheckUser(
      args.id,
      args.user_id,
      "LibraryBookAnalysis"
    );
    if (!loadedAnalysis) return { id: 0 };
    await loadedAnalysis.update({ result: args.result });
    return { id: loadedAnalysis.id };
  }

  async deleteLibraryBook(args, info) {
    const loadedBook = await this.loadModelAndCheckUser(
      args.id,
      args.user_id,
      "LibraryBook"
    );
    if (!loadedBook) return { id: 0 };

    await this.workspaceService.deleteFileDirect(loadedBook.filename);
    await this.workspaceService.deleteFileDirect(loadedBook.cover);
    const deleteBook = this.modelService.create("LibraryBook");
    await deleteBook.destroy({ where: { id: args.id } });

    const deleteBookContent = this.modelService.create("LibraryBookContent");
    await deleteBookContent.destroy({ where: { book_id: args.id } });

    const deleteBookAnalysis = this.modelService.create("LibraryBookAnalysis");
    await deleteBookAnalysis.destroy({ where: { book_id: args.id } });
    this.logger.info(`deleted book with id ${args.id}`);
    return { id: args.id };
  }
}

export default LibraryApp;
