import { PluginSystem } from "../../../plugin";
import { MoeHelper } from "./moe.helper";
import { AbilityResponseHelper } from "./ability-response.helper";
import chalk from "chalk";
import {
  AbilityResponseHelperInterface,
  ActivateConversation,
  AmqpGolemMessage,
  EmbeddingInfo,
  GolemSoundServiceInterface,
  LoadedEmbeddings,
  LoggerServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
  SocketMessage,
  SocketsServiceInterface,
  SpellbookServiceInterface,
  VaultServiceInterface,
  WorkspaceServiceInterface,
} from "types";

export class SpellbookPrompt {
  private services: ServicesConstructorInterface;
  private socketService: SocketsServiceInterface;
  private logger: LoggerServiceInterface;
  private modelService: SequelizeServiceInterface;
  private spellbookService: SpellbookServiceInterface;
  private workspaceService: WorkspaceServiceInterface;
  private vaultService: VaultServiceInterface;
  private abilityHelper: AbilityResponseHelperInterface;
  private streamResponseBuffer: Map<string, string>;
  private incomingSocketMessages: Map<string, SocketMessage>;
  private activeConversations: Map<string, ActivateConversation>;
  private moeService: MoeHelper;
  private embeddingInfo: EmbeddingInfo;
  private embeddingMap: LoadedEmbeddings;
  private golemSoundService: GolemSoundServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.socketService = services["SocketService"];
    this.modelService = services["SequelizeService"];
    this.spellbookService = services["SpellbookService"];
    this.workspaceService = services["WorkspaceService"];
    this.vaultService = services["VaultService"];
    this.golemSoundService = services["GolemSoundService"];
    this.moeService = new MoeHelper(services);
    this.abilityHelper = new AbilityResponseHelper(services, this);
    this.embeddingInfo = null;
    this.streamResponseBuffer = new Map();
    this.incomingSocketMessages = new Map();
    this.activeConversations = new Map();
  }

  @PluginSystem
  async deleteConversation(args, info) {
    const conversation = this.modelService.create("ChatConversation");
    const loadedConversation = await conversation.findByPk(args.id);
    if (!loadedConversation || loadedConversation.user_id != args.user_id) {
      this.logger.error(
        `user id ${args.user_id} trying to delete a conversation for another user`
      );
      return { id: 0 };
    }
    await this.workspaceService.deleteFolder(`workspace/chats/chat-${args.id}`);
    conversation.destroy({ where: { id: args.id } });
    const message = this.modelService.create("ChatConversationMessage");
    message.destroy({ where: { conversation_id: args.id } });
    return { id: args.id };
  }

  @PluginSystem
  async updateConversation(args, info) {
    const conversation = this.modelService.create("ChatConversation");
    const loadedConversation = await conversation.findByPk(args.id);
    if (!loadedConversation || loadedConversation.user_id != args.user_id) {
      this.logger.error(
        `user id ${args.user_id} trying to update a conversation for another user`
      );
      return { id: 0 };
    }
    loadedConversation.update({
      topic: args.topic,
      use_model: args.use_model,
      system_message: args.system_message,
      top_p: args.top_p,
      top_k: args.top_k,
      seed: args.seed,
      min_p: args.min_p,
      mirostat: args.mirostat,
      mirostat_tau: args.mirostat_tau,
      mirostat_eta: args.mirostat_eta,
      temperature: args.temperature,
      router_config: args.router_config,
    });
    return { id: args.id };
  }

  @PluginSystem
  async deleteConversationMessage(args, info) {
    const message = this.modelService.create("ChatConversationMessage");
    const messageToDelete = await message.findOne({ where: { id: args.id } });
    if (!messageToDelete || messageToDelete.user_id != args.user_id) {
      this.logger.error(
        `user id ${args.user_id} trying to delete a conversation message for another user`
      );
      return { id: 0 };
    }

    // if last message has sibling messages
    const siblings = await message.findAll({
      where: { parent_id: messageToDelete.parent_id },
    });
    if (siblings?.length > 1) {
      let newChildId = 0;
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i].id != args.id) {
          newChildId = siblings[i].id;
          break;
        }
      }
      const parent = await message.findOne({
        where: { id: messageToDelete.parent_id },
      });
      parent.update({
        active_child_id: newChildId,
        num_children: parent.num_children - 1,
      });
    }

    if (messageToDelete) await messageToDelete.deleteFiles();
    const childMessages = await message.findAll({
      where: { parent_id: args.id },
    });
    for (const childMessage of childMessages) await childMessage.deleteFiles();

    message.destroy({ where: { id: args.id } });
    message.destroy({ where: { parent_id: args.id } });
    return { id: args.id };
  }

  @PluginSystem
  async handleClearEmbeddings(message: SocketMessage): Promise<boolean> {
    if (this.embeddingInfo) {
      delete this.embeddingInfo;
      this.embeddingInfo = null;
      this.embeddingMap = null;
    }
    this.logger.info(`clearing function calling and moe embeddings`, {
      icon: "🧨",
    });
    return true;
  }

  async handleSocketConnection(message: SocketMessage): Promise<boolean> {
    await this.workspaceService.setWorkspace(
      message.socket_id,
      message.user_id,
      "",
      ""
    );
    return true;
  }

  async handleSocketDisconnect(message: SocketMessage): Promise<boolean> {
    await this.workspaceService.cleanupWorkspace(
      message.socket_id,
      message.user_id
    );
    return true;
  }

  async handleResetWorkspace(message: SocketMessage): Promise<boolean> {
    if (message.payload.conversation_id === 0) {
      await this.workspaceService.setWorkspace(
        message.socket_id,
        message.user_id,
        "",
        ""
      );
      return true;
    }

    await this.workspaceService.setCurrentWorkspace(
      message.socket_id,
      message.user_id,
      `chats/chat-${message.payload.conversation_id}`
    );
    return true;
  }

  async handleStopGeneration(message: SocketMessage): Promise<boolean> {
    const activeConversation = this.getActivateConversation(message.socket_id);
    if (!activeConversation) return true;
    this.logger.info("stop generation requested", { icon: "🛑️" });
    return await this.spellbookService.publishCommand(
      "golem_broadcast",
      "",
      "stop_generation",
      {
        command: "stop_generation",
        socket_id: message.socket_id,
        routing_key: activeConversation.use_model,
      },
      { socket_id: message.socket_id }
    );
  }

  @PluginSystem
  async inferPromptIntent(
    message: any,
    reasoningAgent: string
  ): Promise<boolean> {
    const headers = {
      job: "infer_prompt_action",
      job_step: 0,
      socket_id: message.socket_id,
      reasoning_agent: reasoningAgent,
    };

    const prompt = `### Human: ${message.payload.content.trim()}\n\n### Function Call:\n`;
    return await this.spellbookService.publishCommand(
      "golem_skill",
      reasoningAgent,
      "infer_prompt_action",
      {
        stream: false,
        raw: prompt,
        messages: [],
        start_response: "\n{",
        lora: "noco-ai/func-call-hallucinate-v1",
        debug: true,
        max_new_tokens: 512,
      },
      headers
    );
  }

  /** contentJson contains the function description the model created */
  @PluginSystem
  async inferIntentStep0(contentJson, headers, currentJob) {
    // load embeddings if needed
    if (!this.embeddingInfo) {
      this.embeddingInfo = await this.moeService.getEmbeddingInfo();
    }

    const sendText = this.embeddingInfo.embeddings_loaded
      ? []
      : this.embeddingInfo.embeddings;

    currentJob.guessed_function = contentJson;
    let description = contentJson.function_description;
    let knowledgeDomain = contentJson.knowledge_domain;
    if (!description) {
      description = contentJson.description;
    }

    if (!description || !knowledgeDomain) {
      return await this.defaultPromptHandler(
        this.getIncomingSocketMessage(headers.socket_id)
      );
    }
    sendText.push(description);
    sendText.push(knowledgeDomain);

    // add parameter definitions
    if (contentJson.parameters) {
      for (const parameter in contentJson.parameters) {
        const currentParam = contentJson.parameters[parameter];
        if (!currentParam.description) continue;
        sendText.push(currentParam.description);
      }
    }

    const newHeaders = {
      job: "infer_prompt_action",
      job_step: 1,
      socket_id: headers.socket_id,
      embedding: description,
      domain_embedding: knowledgeDomain,
      parameters: JSON.stringify(contentJson.parameters),
      reasoning_agent: headers.reasoning_agent,
    };

    const ret = await this.spellbookService.publishCommand(
      "golem_skill",
      "e5_large_v2",
      "infer_prompt_action",
      {
        text: sendText,
      },
      newHeaders
    );
  }

  private getEmbeddingFromText(text, embeddings) {
    for (const embedding in embeddings) {
      if (embedding === text) {
        return embeddings[embedding][0];
      }
    }
    return null;
  }

  @PluginSystem
  async executeChatAbility(bestFunction, headers, embeddings) {
    const parameters = JSON.parse(headers.parameters);

    // check if this is a dynamic function
    let skillData = null;
    if (this.embeddingInfo.dynamic_functions[bestFunction]) {
      // build the skill data object for the dynamic function
      const dynamicFunc = this.embeddingInfo.dynamic_functions[bestFunction];
      skillData = {
        shortcut: "",
        icon: "asset/chat-ability/dynamic-functions/dynamic.jpeg",
        unique_key: bestFunction,
        function_definition: [dynamicFunc.definition.function_description],
        parameters: [],
      };

      for (const paramName in dynamicFunc.definition.parameters) {
        const currentParam = dynamicFunc.definition.parameters[paramName];
        const copyParam = JSON.parse(JSON.stringify(currentParam));
        copyParam.name = paramName;
        copyParam.description = [copyParam.description];
        copyParam.required = true;
        skillData.parameters.push(copyParam);
      }
    } else {
      skillData = this.spellbookService.getChatAbilityByKey(bestFunction);
    }

    const shortcut = !skillData.shortcut ? "" : skillData.shortcut;
    this.socketService.emit(headers.socket_id, "prompt_icons", {
      icons: [skillData.icon],
      shortcuts: shortcut,
    });

    const currentConversation = this.getActivateConversation(headers.socket_id);
    currentConversation.icons = [skillData.icon];
    currentConversation.shortcuts = shortcut;

    const socketMessage = this.getIncomingSocketMessage(headers.socket_id);
    if (skillData.wait_message) {
      // with only one update we don't need the LLM
      await this.spellbookService.simulateFragment(
        socketMessage,
        skillData.wait_message + "\n\n",
        30
      );
    }

    if (!skillData.extractor_function) {
      this.logger.info(`correcting ${bestFunction} parameters`, {
        icon: "\uD83E\uDDE0",
      });

      const newHeaders = {
        job: "infer_prompt_action",
        job_step: 2,
        socket_id: headers.socket_id,
        chat_ability: bestFunction,
      };

      const socketMessage = this.getIncomingSocketMessage(headers.socket_id);
      let functionDefinition = {
        description: skillData.function_definition[0],
        parameter_descriptions: {},
      };

      // special condition when we can have a default for our only parameter
      if (skillData.allow_empty_parameters && !Object.keys(parameters).length) {
        this.logger.info(
          `function parameter: skipping no parameters extracted`,
          { icon: "🧠", color: chalk.blueBright }
        );
      }
      // map the parameters for the function
      else if (skillData.parameters.length === 1) {
        const definedParam = skillData.parameters[0];
        functionDefinition.parameter_descriptions[definedParam.name] = {
          type: definedParam.type,
          description: definedParam.description[0],
        };
      } else {
        // if function has more than more parameter
        const successfulMapping = {};
        for (let i = 0; i < skillData.parameters.length; i++) {
          const definedParam = skillData.parameters[i];

          // always include required params in the function definitions
          if (definedParam.required) {
            functionDefinition.parameter_descriptions[definedParam.name] = {
              type: definedParam.type,
              description: definedParam.description[0],
            };
          }

          // match on name
          for (const guessedName in parameters) {
            if (guessedName == definedParam.name) {
              this.logger.info(
                `function parameter: ${definedParam.name} matched on name`,
                { icon: "🧠", color: chalk.blueBright }
              );
              functionDefinition.parameter_descriptions[definedParam.name] = {
                type: definedParam.type,
                description: definedParam.description[0],
              };
              successfulMapping[definedParam.name] = true;
              break;
            }
          }
          if (successfulMapping[definedParam.name]) continue;

          let closestMatch = null;
          let closestScore = 0;
          for (const guessedName in parameters) {
            // skip parameters that have already been mapped
            if (successfulMapping[guessedName]) continue;

            // try to match on similarity score
            const checkEmbedding = this.getEmbeddingFromText(
              parameters[guessedName].description,
              embeddings
            );

            for (let j = 0; j < definedParam.description.length; j++) {
              if (
                !this.embeddingMap.chat_function_parameters_map[
                  skillData.unique_key
                ][definedParam.name][definedParam.description[j]]
              ) {
                continue;
              }

              const parameterSimilarity = this.moeService.cosineSimilarity(
                checkEmbedding,
                this.embeddingMap.chat_function_parameters_map[
                  skillData.unique_key
                ][definedParam.name][definedParam.description[j]]
              );

              if (parameterSimilarity > closestScore) {
                closestMatch = guessedName;
                closestScore = parameterSimilarity;
              }
            }
          }

          // check if one of the descriptions matches well
          let logColor = chalk.white;
          let logMessage = `function parameter: moe closest parameter: ${definedParam.name} is ${closestMatch} score: ${closestScore}`;
          if (closestScore >= 0.95) {
            logColor = chalk.blueBright;
            logMessage = `function parameter: moe selected parameter: ${definedParam.name} = ${closestMatch} score: ${closestScore}`;
            functionDefinition.parameter_descriptions[definedParam.name] = {
              type: definedParam.type,
              description: definedParam.description[0],
            };
            successfulMapping[closestMatch] = true;
          }
          this.logger.info(logMessage, { icon: "🧠", color: logColor });
        }
      }

      // build the payload to send to LLM
      const jsonStr = JSON.stringify(functionDefinition, null, 4);
      const trimmed = socketMessage.payload.content.trim();
      const extractPrompt = `### Function Description:\n${jsonStr}\n\n### Human: ${trimmed}\n\n### Extracted Parameters:`;

      const ret = await this.spellbookService.publishCommand(
        "golem_skill",
        headers.reasoning_agent,
        "infer_prompt_action",
        {
          stream: false,
          debug: true,
          messages: [],
          raw: extractPrompt,
          lora: "noco-ai/func-call-parameter-extract-v1",
          start_response: "\n{",
          max_new_tokens: 512,
        },
        newHeaders
      );
    } else {
      const useSkill =
        this.spellbookService.getOnlineSkillFromType("reasoning_agent");
      const currentConversation = this.getActivateConversation(
        headers.socket_id
      );
      currentConversation.function_custom_extractor = true;
      this.logger.info(
        `executing conversation skill ${bestFunction} extractor`,
        {
          icon: "\uD83E\uDDE0",
        }
      );

      const classInstance = skillData["class_instance"];
      const extractPrompt = await classInstance[
        skillData["extractor_function"]
      ]();

      const newHeaders = {
        job: "infer_prompt_action",
        job_step: 2,
        socket_id: headers.socket_id,
        chat_ability: bestFunction,
      };

      const socketMessage = this.getIncomingSocketMessage(headers.socket_id);
      let payload = this.abilityHelper.simpleChatPayload(
        extractPrompt,
        socketMessage.payload.content
      );

      const ret = await this.spellbookService.publishCommand(
        "golem_skill",
        useSkill[0],
        "infer_prompt_action",
        {
          stream: false,
          messages: payload,
        },
        newHeaders
      );
    }
  }

  @PluginSystem
  async inferIntentStep1(contentJson, headers, currentJob) {
    if (!this.embeddingInfo) {
      this.logger.error(
        `invalid embedding information, application must have crashed!`
      );
      return false;
    }

    // load the function embeddings if they are not already
    if (!this.embeddingInfo.embeddings_loaded) {
      this.embeddingMap = await this.moeService.mapEmbeddings(
        contentJson.embeddings,
        this.embeddingInfo,
        headers
      );
      this.embeddingInfo.embeddings_loaded = true;
    }

    // check if model was selected manually, if so use it and pin knowledge domain to it
    let selectedFunction = null;
    if (currentJob.function_manually_selected) {
      selectedFunction = this.spellbookService.getShortcutFunction(
        currentJob.shortcuts
      );

      // add pinned embedding
      if (currentJob.router_config.includes("pin_functions")) {
        this.embeddingMap = await this.moeService.addFunctionEmbedding(
          this.embeddingMap,
          contentJson.embeddings,
          selectedFunction,
          headers.embedding
        );
      }

      this.logger.info(`manually selected function ${selectedFunction}`, {
        icon: currentJob.shortcuts,
      });
    } else if (currentJob.model_manually_selected) {
      // pin the knowledge domain embedding to the skill
      if (
        !currentJob.is_visual_model &&
        currentJob.router_config.includes("pin_models")
      ) {
        this.embeddingMap = await this.moeService.addKnowledgeDomainEmbedding(
          this.embeddingMap,
          contentJson.embeddings,
          currentJob.shortcuts,
          currentJob.use_model,
          headers.domain_embedding
        );
      }
      await this.defaultPromptHandler(
        this.getIncomingSocketMessage(headers.socket_id)
      );
      return;
    }

    // find the closest function definition
    for (let embedding in contentJson.embeddings) {
      if (embedding == headers.embedding) {
        let { bestScore, bestFunction } =
          await this.moeService.findBestChatFunction(
            embedding,
            this.embeddingMap,
            contentJson,
            currentJob.user_permissions
          );

        this.logger.info(`function: ${embedding}`, {
          icon: "🧠",
        });

        const { bestMoeScore, bestSkillShortcut } =
          await this.moeService.findBestMoeFunction(
            embedding,
            this.embeddingMap,
            contentJson,
            currentJob.user_permissions
          );

        //  execute the chat function if it's score beats all skills or it was manually selected
        const functionCallThreshold =
          currentJob.skill_config.function_call_threshold || 0.95;
        if (
          (bestScore >= functionCallThreshold && bestScore > bestMoeScore) ||
          selectedFunction
        ) {
          bestFunction = selectedFunction ? selectedFunction : bestFunction;
          this.logger.info(
            `function: moe selected chat function: ${bestFunction} score: ${bestScore}`,
            { icon: "🧠", color: chalk.blue }
          );
          await this.executeChatAbility(
            bestFunction,
            headers,
            contentJson.embeddings
          );
          return true;
        } else {
          this.logger.info(
            `function: moe closest chat function: ${bestFunction} score: ${bestScore} moe score: ${bestMoeScore}`,
            { icon: "🧠" }
          );
        }

        const shortcutSkill =
          this.spellbookService.getShortcutSkill(bestSkillShortcut);
        let logMessage = `function: moe closest skill: ${shortcutSkill} score: ${bestMoeScore}`;

        let logColor =
          bestMoeScore >= functionCallThreshold ? chalk.blue : chalk.white;
        if (bestMoeScore >= functionCallThreshold) {
          logMessage = `function: moe selected skill: ${shortcutSkill} score: ${bestMoeScore}`;
          currentJob.shortcuts = bestSkillShortcut;
          currentJob.use_model = shortcutSkill;
          this.socketService.emit(headers.socket_id, "prompt_icons", {
            icons: currentJob.icons,
            shortcuts: currentJob.shortcuts,
            user_shortcuts: currentJob.user_shortcuts,
          });
        }
        this.logger.info(logMessage, { icon: "🏫", color: logColor });
      } else if (embedding == headers.domain_embedding) {
        this.logger.info(`knowledge domain: ${embedding}`, {
          icon: "🧠",
        });

        const { bestMoeScore, bestSkillShortcut } =
          await this.moeService.findBestMoeSkill(
            embedding,
            this.embeddingMap,
            contentJson,
            currentJob.user_permissions
          );

        const shortcutSkill =
          this.spellbookService.getShortcutSkill(bestSkillShortcut);
        let logMessage = `knowledge domain: moe closest skill: ${shortcutSkill} score: ${bestMoeScore}`;
        const skillRouteThreshold =
          currentJob.skill_config.model_route_threshold || 0.9;
        let logColor =
          bestMoeScore >= skillRouteThreshold ? chalk.blue : chalk.white;
        if (bestMoeScore >= skillRouteThreshold) {
          logMessage = `knowledge domain: moe selected skill: ${shortcutSkill} score: ${bestMoeScore}`;
          currentJob.shortcuts = bestSkillShortcut;
          currentJob.use_model = shortcutSkill;
          this.socketService.emit(headers.socket_id, "prompt_icons", {
            icons: currentJob.icons,
            shortcuts: currentJob.shortcuts,
            user_shortcuts: currentJob.user_shortcuts,
          });
        }
        this.logger.info(logMessage, { icon: "🏫", color: logColor });
      }
    }

    // check if selected model is a visual LLM
    const availableVisualLanguageModels =
      this.spellbookService.getOnlineSkillFromType("visual_language_model");
    if (
      availableVisualLanguageModels &&
      availableVisualLanguageModels.includes(currentJob.use_model)
    ) {
      currentJob.is_visual_model = true;
    }

    return await this.defaultPromptHandler(
      this.getIncomingSocketMessage(headers.socket_id)
    );
  }

  @PluginSystem
  async inferIntentStep2(contentJson, headers) {
    if (!headers) {
      this.logger.error(
        `could not parse complete function called step #2, invalid headers`
      );
      return false;
    }

    const currentJob = this.getActivateConversation(headers.socket_id);
    if (!currentJob) {
      this.logger.error(
        `could not parse complete function called step #2, invalid job`
      );
      return false;
    }

    // extract JSON from payload
    let parsedJson = null;
    if (currentJob.function_custom_extractor) {
      parsedJson = JSON.parse(contentJson.content);
    } else {
      parsedJson = JSON.parse(
        this.moeService.extractFirstJSON(contentJson.content)
      );
    }

    // log error if could not parse JSON data
    if (!parsedJson) {
      this.logger.error(`could not parse function calling JSON`);
      return false;
    }
    const socketMessage = this.getIncomingSocketMessage(headers.socket_id);

    if (this.embeddingInfo.dynamic_functions[headers.chat_ability]) {
      const dynamicFunc =
        this.embeddingInfo.dynamic_functions[headers.chat_ability];
      const loadAndRunFunction = new Function(
        "parameters",
        `${dynamicFunc.code}return executeFunction(parameters);`
      );
      const dynamicResult = loadAndRunFunction(parsedJson);
      await this.handlePromptFragment({
        content: dynamicResult,
        properties: {
          headers: {
            socket_id: headers.socket_id,
          },
        },
      });
    } else {
      // execute dynamic if selected
      const skillData = this.spellbookService.getChatAbilityByKey(
        headers.chat_ability
      );

      const classInstance = skillData["class_instance"];
      await classInstance[skillData["execute_function"]](
        socketMessage,
        parsedJson,
        this.abilityHelper
      );
    }

    await this.handlePromptResponse({
      content: JSON.stringify({ content: "<stop>" }),
      properties: {
        headers: {
          socket_id: headers.socket_id,
        },
      },
    });
    return true;
  }

  @PluginSystem
  async processInferActionJob(message) {
    const headers = message.properties.headers;
    try {
      const json = JSON.parse(message.content.toString());
      const currentJob = this.getActivateConversation(headers.socket_id);

      if (headers.job_step == 0) {
        let contentJson = JSON.parse(json.content);
        await this.inferIntentStep0(contentJson, headers, currentJob);
      } else if (headers.job_step == 1) {
        await this.inferIntentStep1(json, headers, currentJob);
      } else if (headers.job_step == 2) {
        const callSuccess = await this.inferIntentStep2(json, headers);
        if (!callSuccess) {
          return await this.defaultPromptHandler(
            this.getIncomingSocketMessage(headers.socket_id)
          );
        }
      }
    } catch (error) {
      this.logger.error("failed to parse json", {}, error);
      // send error to front end
      return await this.defaultPromptHandler(
        this.getIncomingSocketMessage(headers.socket_id)
      );
    }
  }

  @PluginSystem
  async defaultPromptHandler(message): Promise<boolean> {
    // get the language model to send the request to
    if (!message) return true;
    const currentJob = this.getActivateConversation(message.socket_id);
    const skillConfig = currentJob.skill_config;

    // update icons on FE
    this.socketService.emit(message.socket_id, "prompt_icons", {
      icons: currentJob.icons,
      shortcuts: currentJob.shortcuts,
      user_shortcuts: currentJob.user_shortcuts,
    });

    let stripHtml = [];
    for (let i = 0; i < message.payload.messages.length; ) {
      const currentMessage = message.payload.messages[i];
      const nextMessage = message.payload.messages[i + 1];

      if (!nextMessage) {
        stripHtml.push(currentMessage);
        break;
      }

      if (nextMessage.content.indexOf("<div") !== 0) {
        stripHtml.push(currentMessage);
        stripHtml.push(nextMessage);
      }
      i += 2;
    }

    // allow for UI override of defaults
    const modelConfig = message.payload;
    const temperature = modelConfig.temperature || 1;
    const topP = modelConfig.top_p || 0.9;
    const topK = modelConfig.top_k || 50;
    const seed = modelConfig.seed || -1;
    const minP = modelConfig.min_p || 0.05;
    const mirostat = modelConfig.mirostat || 0;
    const mirostatEta = modelConfig.mirostat_eta || 0.1;
    const mirostatTau = modelConfig.mirostat_tau || 5;
    const maxNewTokens = parseInt(skillConfig.max_new_tokens) || 1024;
    if (modelConfig.system_message && modelConfig.system_message.length) {
      stripHtml.unshift({
        role: "system",
        content: modelConfig.system_message,
      });
    }

    let payload: any = {
      stream: true,
      messages: stripHtml,
      debug: true,
      temperature: temperature,
      top_p: topP,
      top_k: topK,
      min_p: minP,
      start_response: currentJob.start_response,
      mirostat: mirostat,
      mirostat_tau: mirostatTau,
      mirostat_eta: mirostatEta,
      seed: parseInt(seed),
      max_new_tokens: maxNewTokens,
    };

    // send image w/ request if is a visual LLM
    if (currentJob.is_visual_model) {
      if (!currentJob.img_file) {
        return await this.sendErrorMessage(
          `This model requires an image as input.`,
          message.socket_id
        );
      }
      payload.img_url = await this.workspaceService.getFileUrl(
        message.socket_id,
        currentJob.img_file,
        2
      );

      // Need to strip all messages older than ...
    }

    // send message to backend service to get prompt response
    const ret = await this.spellbookService.publishCommand(
      "golem_skill",
      currentJob.use_model,
      "prompt_response",
      payload,
      {
        socket_id: message.socket_id,
        conversation_id: currentJob.conversation_id,
        parent_id: currentJob.user_message_id,
        model_name: currentJob.use_model,
      }
    );
    return true;
  }

  private buildSocketResponsePayload(
    messageId: number,
    parentId: number,
    conversationId: number,
    icons: string[],
    shortcuts: string,
    content: string,
    files: string[],
    generatedFiles: string[]
  ) {
    // build the response to send to the user
    const payload = {
      id: messageId,
      parent_id: parentId,
      icon: icons,
      shortcuts: shortcuts,
      conversation_id: conversationId,
      role: "assistant",
      content: content,
      raw: content,
      files: files,
      generated_files: generatedFiles,
      blocks: [],
      created_at: new Date().getTime(),
    };
    return payload;
  }

  @PluginSystem
  async handlePromptResponse(message): Promise<boolean> {
    // parse message body and check if valid
    const response = JSON.parse(message.content);
    const headers = message.properties.headers;
    let content = response.content;
    let saveContent = "";

    // an error occurred on the backend
    if (!response.content || headers.success == false) {
      const errorMsg =
        headers.errors && headers.errors.length
          ? headers.errors.join("<br>")
          : "Unknown error occurred with skill";
      this.logger.error(
        `invalid response from skill ${headers.errors.join(" ")}`
      );
      await this.handlePromptFragment({
        content: errorMsg,
        properties: {
          headers: {
            socket_id: headers.socket_id,
          },
        },
      });
      content = "<stop>";
    }
    // end of stream
    saveContent =
      content === "<stop>"
        ? this.streamResponseBuffer.get(headers.socket_id)
        : content;

    if (content === "<fragment>") {
      this.logger.info(`fragment finished`, {
        icon: "\uD83E\uDDE0",
      });
      return true;
    }

    // save the icons as comma list
    const currentJob = this.getActivateConversation(headers.socket_id);
    if (!currentJob) {
      this.logger.error(`current job for ${headers.socket_id} not found`);
      return true;
    }

    // create new SQL record for the response
    const newMessageId = await this.createConversationMessage(
      saveContent,
      "assistant",
      currentJob.shortcuts,
      currentJob.user_message_id,
      currentJob.conversation_id,
      currentJob.generated_files,
      currentJob.icons,
      currentJob.user_id
    );
    await this.setMessageActiveChild(currentJob.user_message_id, newMessageId);

    const payload = this.buildSocketResponsePayload(
      newMessageId,
      currentJob.user_message_id,
      currentJob.conversation_id,
      currentJob.icons,
      currentJob.shortcuts,
      content,
      currentJob.user_files,
      currentJob.generated_files
    );

    await this.socketService.emit(
      headers.socket_id,
      "prompt_response",
      payload
    );

    // run post processing jobs
    await this.applyPromptProcessors("postprocessor");

    // cleanup job data
    this.streamResponseBuffer.delete(headers.socket_id);
    this.activeConversations.delete(headers.socket_id);
    this.incomingSocketMessages.delete(headers.socket_id);
    return true;
  }

  private async applyPromptProcessors(type: string) {
    const processors = this.spellbookService.getPromptProcessors();
    if (processors[type].length) {
      const postProcessors = processors[type];
      for (let i = 0; i < postProcessors.length; i++) {
        const currentProcessor = postProcessors[i];

        if (
          !currentProcessor.class_instance[currentProcessor.execute_function]
        ) {
          this.logger.error(
            `class file ${currentProcessor.class_file} has no function ${currentProcessor.execute_function}`
          );
        }
        await currentProcessor.class_instance[
          currentProcessor.execute_function
        ]();
      }
    }
  }

  @PluginSystem
  async resetCursor(socketId: string) {
    const currentJob = this.getActivateConversation(socketId);
    if (!currentJob) return;
    currentJob.cursor_in_use = false;
    currentJob.cursor_tail = "";
    currentJob.cursor_index = 0;
    await this.socketService.emit(socketId, "prompt_cursor", {
      index: 0,
      tail: "",
    });
  }

  // used when we want to stream text into an HTML element in the response
  @PluginSystem
  async handlePromptFragmentWithCursor(message, cursor: string) {
    const messageContent = message.content.toString();
    const headers = message.properties.headers;

    // Find the index of the cursor
    const cursorIndex = messageContent.indexOf(cursor);
    if (cursorIndex === -1) {
      this.logger.error("cursor not found in message content");
      return;
    }

    const currentJob = this.getActivateConversation(headers.socket_id);
    if (!currentJob) return;
    const textAfterCursor = messageContent.substring(
      cursorIndex + cursor.length
    );
    message.content = messageContent.replace(cursor, "");
    await this.handlePromptFragment(message);

    currentJob.cursor_in_use = true;
    currentJob.cursor_tail = textAfterCursor;
    currentJob.cursor_index = textAfterCursor.length;
    await this.socketService.emit(headers.socket_id, "prompt_cursor", {
      index: textAfterCursor.length,
      tail: textAfterCursor,
    });
    return true;
  }

  @PluginSystem
  async handlePromptFragment(message): Promise<boolean> {
    const messageContent = message.content.toString();
    const headers = message.properties.headers;
    await this.socketService.emit(
      message.properties.headers.socket_id,
      "prompt_fragment",
      messageContent
    );

    const currentJob = this.getActivateConversation(headers.socket_id);
    if (!currentJob) {
      return true;
    }

    if (currentJob.cursor_in_use) {
      const bufferText = this.streamResponseBuffer.get(headers.socket_id);
      let adjustText = bufferText.substring(
        0,
        bufferText.length - currentJob.cursor_index
      );
      adjustText += messageContent;
      adjustText += currentJob.cursor_tail;
      this.streamResponseBuffer.set(headers.socket_id, adjustText);
    } else {
      let bufferText = this.streamResponseBuffer.get(headers.socket_id);
      bufferText += messageContent;
      this.streamResponseBuffer.set(headers.socket_id, bufferText);
    }
    return true;
  }

  @PluginSystem
  async handleProgressUpdate(message: AmqpGolemMessage): Promise<boolean> {
    const target =
      message.properties?.headers?.progress_target || "chat_progress";
    const messageContent = message.content.toString();
    const json = JSON.parse(messageContent);
    json.target = target;
    this.socketService.emitToUser(
      message.properties.headers.user_id,
      "progress_bar_update",
      json
    );
    return true;
  }

  @PluginSystem
  async sendChatAbilityError(error, socketId): Promise<boolean> {
    this.socketService.emit(socketId, "prompt_fragment", error);
    let stream = this.streamResponseBuffer.get(socketId);
    stream += error;
    this.streamResponseBuffer.set(socketId, stream);
    return true;
  }

  @PluginSystem
  async sendErrorMessage(error, socketId): Promise<boolean> {
    await this.sendChatAbilityError(error, socketId);
    await this.handlePromptResponse({
      content: JSON.stringify({ content: "<stop>" }),
      properties: {
        headers: {
          socket_id: socketId,
        },
      },
    });
    return true;
  }

  @PluginSystem
  async handleGetOnlineSkills(message: SocketMessage): Promise<void> {
    const skillMap = {};
    const online = this.spellbookService.getOnlineSkills();
    const userPermissions = await this.vaultService.getUserPermissions(
      message.user_id
    );

    for (let i = 0; i < online.length; i++) {
      const current = online[i];
      for (let j = 0; j < current.use.length; j++) {
        if (
          !userPermissions.skills.includes(current.routing_key) &&
          !userPermissions.is_admin
        )
          continue;
        const currentUse = current.use[j];
        if (!skillMap[currentUse]) {
          skillMap[currentUse] = [];
        }
        skillMap[currentUse].push({
          label: current.label,
          value: current.routing_key,
        });
      }
    }

    await this.socketService.emit(message.socket_id, "finish_command", {
      skills: skillMap,
      command: "get_online_skills",
    });
  }

  // gets a list of dropdown options for running models
  @PluginSystem
  async getRunningLanguageModels() {
    const options = [{ label: "None", value: "none" }];
    const online = this.spellbookService.getOnlineSkills();
    if (!online.length) return options;

    const altModels = ["openai_gpt_35", "openai_gpt_4"];
    for (let i = 0; i < online.length; i++) {
      if (
        online[i].use.includes("language_model") ||
        online[i].use.includes("visual_language_model") ||
        altModels.includes(online[i].routing_key)
      ) {
        const label = !online[i].shortcut
          ? online[i].label
          : `${online[i].shortcut} ${online[i].label}`;
        options.push({ label: label, value: online[i].routing_key });
      }
    }
    return options;
  }

  @PluginSystem
  async handleGetRunningLanguageModels(message: SocketMessage) {
    const allModels = await this.getRunningLanguageModels();
    const userPermissions = await this.vaultService.getUserPermissions(
      message.user_id
    );

    const clippedList = [];
    for (let i = 0; i < allModels.length; i++) {
      if (
        userPermissions.skills.includes(allModels[i].value) ||
        allModels[i].value == "none" ||
        userPermissions.is_admin
      )
        clippedList.push(allModels[i]);
    }
    await this.socketService.emit(message.socket_id, "finish_command", {
      command: "get_online_language_models",
      models: clippedList,
    });
  }

  @PluginSystem
  async modifyModelConfigurationOptions(option) {
    option.select_options = await this.getRunningLanguageModels();
    return option;
  }

  @PluginSystem
  async setMessageActiveChild(
    messageId: number,
    activeChildId: number
  ): Promise<number> {
    const messageModel = this.modelService.create("ChatConversationMessage");
    const updMessage = await messageModel.findByPk(messageId);
    if (updMessage)
      await updMessage.update({
        active_child_id: activeChildId,
        num_children: updMessage.num_children + 1,
      });

    return messageId;
  }

  @PluginSystem
  async setConversationActiveChild(
    conversationId: number,
    activeChildId: number
  ): Promise<number> {
    const messageModel = this.modelService.create("ChatConversation");
    const updMessage = await messageModel.findByPk(conversationId);
    if (updMessage)
      await updMessage.update({
        first_message_id: activeChildId,
      });

    return conversationId;
  }

  @PluginSystem
  async createConversationMessage(
    content: string,
    role: string,
    shortcuts: string,
    parentId: number,
    conversationId: number,
    files: string[],
    icons: string[],
    userId: number
  ): Promise<number> {
    const iconsStr: string = icons.join(",");
    const filesStr: string = files.join(",");
    const messageModel = this.modelService.create("ChatConversationMessage");
    const newMessage = await messageModel.create({
      content: content,
      role: role,
      icon: iconsStr,
      shortcuts: shortcuts,
      parent_id: parentId,
      active_child_id: 0,
      num_children: 0,
      conversation_id: conversationId,
      files: filesStr,
      user_id: userId,
    });
    return newMessage.id;
  }

  @PluginSystem
  async createConversation(
    topic: string,
    systemMessage: string,
    useModel: string,
    seed: number,
    temperature: number,
    topK: number,
    topP: number,
    minP: number,
    mirostat: number,
    mirostatEta: number,
    mirostatTau: number,
    routerConfig: string,
    userId: number,
    allyId: number
  ): Promise<number> {
    const conversation = this.modelService.create("ChatConversation");
    const newConversation = await conversation.create({
      is_private: 1,
      is_shared: 0,
      use_model: useModel,
      topic: topic,
      system_message: systemMessage,
      seed: seed,
      temperature: temperature,
      top_k: topK,
      top_p: topP,
      min_p: minP,
      mirostat: mirostat,
      mirostat_eta: mirostatEta,
      mirostat_tau: mirostatTau,
      router_config: routerConfig,
      user_id: userId,
      ally_id: allyId,
    });
    return newConversation.id;
  }

  @PluginSystem
  async handlePrompt(message: SocketMessage): Promise<boolean> {
    // make sure we have a language model running.
    const conversationData = message.payload;
    console.log(conversationData);

    const preferredModel = this.spellbookService.getOnlineSkillFromKey(
      conversationData.use_model
    );
    const availableLanguageModels =
      this.spellbookService.getOnlineSkillFromType("language_model");
    const availableVisualLanguageModels =
      this.spellbookService.getOnlineSkillFromType("visual_language_model") ||
      [];

    const noLanguageModels =
      !preferredModel &&
      !availableLanguageModels &&
      !availableVisualLanguageModels.length
        ? true
        : false;
    const preferredModelRoute = preferredModel
      ? preferredModel.routing_key
      : null;

    // select a language model to use, if the preference is loaded use it.
    const skillConfig = (await this.vaultService.getGroup(
      "spells/ai-assistant"
    )) || {
      function_call_threshold: 0.92,
      max_new_tokens: 1024,
      model_route_threshold: 0.92,
    };

    // get user permissions
    const userPermissions = await this.vaultService.getUserPermissions(
      message.user_id
    );

    let useModel =
      preferredModelRoute ||
      this.moeService.selectDefaultLanguageModel(skillConfig, userPermissions);

    let {
      modelManuallySelected,
      manuallySelectedModel,
      functionManuallySelected,
      userShortcuts,
      aiShortcuts,
    } = await this.moeService.applyShortcuts(
      message.payload.shortcuts,
      message,
      skillConfig,
      availableLanguageModels,
      userPermissions
    );
    useModel = modelManuallySelected ? manuallySelectedModel : useModel;

    // create a new conversation if this is first message
    const conversationId = !message.payload.conversation_id
      ? await this.createConversation(
          conversationData.topic,
          conversationData.system_message,
          conversationData.use_model,
          conversationData.seed,
          conversationData.temperature,
          conversationData.top_k,
          conversationData.top_p,
          conversationData.min_p,
          conversationData.mirostat,
          conversationData.mirostat_eta,
          conversationData.mirostat_tau,
          conversationData.router_config,
          message.user_id,
          conversationData.ally_id
        )
      : message.payload.conversation_id;

    // set the work space
    await this.workspaceService.setCurrentWorkspace(
      message.socket_id,
      message.user_id,
      `chats/chat-${conversationId}`
    );

    // if files where uploaded move them to the chat workspace
    let newFiles = [];
    if (
      typeof message.payload.files == "string" &&
      message.payload.files.length
    ) {
      const files = message.payload.files.split(",");
      newFiles = await this.workspaceService.moveFilesToCurrentWorkspace(
        message.socket_id,
        files
      );
      message.payload.files = newFiles.join(",");
    }

    const messageId = await this.createConversationMessage(
      message.payload.content,
      "user",
      userShortcuts,
      message.payload.parent_id,
      conversationId,
      newFiles,
      ["asset/spellbook/core/user-avatar.png"],
      message.user_id
    );
    if (message.payload.parent_id)
      await this.setMessageActiveChild(message.payload.parent_id, messageId);

    if (!message.payload.parent_id)
      await this.setConversationActiveChild(conversationId, messageId);

    // run checks on if this is a visual model or not
    const isVisualModel = availableVisualLanguageModels.includes(useModel)
      ? true
      : false;
    const lastImageFile = await this.workspaceService.getNewestImage(
      message.socket_id
    );

    this.logger.info(
      `manually selected: ${modelManuallySelected} ${useModel}, user shortcuts: ${userShortcuts}, ai shortcuts: ${aiShortcuts}, visual: ${isVisualModel}`
    );

    // check if function calling models are online
    const useReasoningAgent =
      this.spellbookService.getOnlineSkillFromKey("llama2_7b_exllama");
    const useEmbeddingModel =
      this.spellbookService.getOnlineSkillFromKey("e5_large_v2");

    // check if function calling and mode routing are turned off for this chat
    const routerConfig = conversationData.router_config.length
      ? conversationData.router_config.split(",")
      : [];
    const disabledIntentCode =
      !routerConfig.includes("function_calling") &&
      !routerConfig.includes("model_routing")
        ? true
        : false;

    // setup job buffer object
    this.activeConversations.set(message.socket_id, {
      num_jobs: 0,
      num_complete: 0,
      router_config: routerConfig,
      user_permissions: userPermissions,
      icons: [message.payload.ai_icon],
      user_shortcuts: userShortcuts,
      shortcuts: aiShortcuts,
      reasoning_agent: useReasoningAgent,
      conversation_id: conversationId,
      parent_id: message.payload.parent_id,
      user_files: message.payload.files,
      use_model: useModel,
      is_visual_model: isVisualModel,
      img_file: lastImageFile,
      user_message_id: messageId,
      skill_config: skillConfig,
      model_manually_selected: modelManuallySelected,
      function_manually_selected: functionManuallySelected,
      function_custom_extractor: false,
      cursor_in_use: false,
      cursor_index: 0,
      cursor_tail: "",
      guessed_function: null,
      user_id: message.user_id,
      start_response: message.payload?.start_response || "",
      generated_files: [],
    });

    // keep record of incoming socket message
    this.incomingSocketMessages.set(message.socket_id, message);
    this.streamResponseBuffer.set(message.socket_id, "");

    // send error message to user if no models are running
    if (noLanguageModels) {
      this.logger.warn("no language models are running");
      return await this.sendErrorMessage(
        "No language models are running.",
        message.socket_id
      );
    }

    // skip function and moe for GPT models and when first/second override is given
    if (["✨", "⚡", "🥇", "🥈"].includes(aiShortcuts)) {
      return await this.defaultPromptHandler(message);
    }

    if (!disabledIntentCode && useReasoningAgent && useEmbeddingModel) {
      this.logger.info(
        `using function calling agent ${useReasoningAgent.routing_key}`,
        {
          icon: "🧠",
        }
      );

      // build the prompt
      return await this.inferPromptIntent(
        message,
        useReasoningAgent.routing_key
      );
    }

    return await this.defaultPromptHandler(message);
  }

  @PluginSystem
  getIncomingSocketMessage(socketId: string): SocketMessage | null {
    if (!this.incomingSocketMessages.has(socketId)) {
      this.logger.error(`no incoming messages found for socket ${socketId}`);
      return null;
    }
    return this.incomingSocketMessages.get(socketId);
  }

  @PluginSystem
  getActivateConversation(socketId: string): ActivateConversation | null {
    if (!this.activeConversations.has(socketId)) {
      this.logger.error(`no activate conversation for socket ${socketId}`);
      return null;
    }
    return this.activeConversations.get(socketId);
  }

  @PluginSystem
  setActivateConversation(
    socketId: string,
    conversation: ActivateConversation
  ): void {
    this.activeConversations.set(socketId, conversation);
  }

  @PluginSystem
  async handleSwitchMessageChain(message: SocketMessage): Promise<void> {
    const messageId = message.payload?.message_id || 0;
    const activeId = message.payload?.active_child_id || 0;
    const conversationId = message.payload?.conversation_id || 0;

    if (messageId == 0)
      await this.setConversationActiveChild(conversationId, activeId);
    else await this.setMessageActiveChild(messageId, activeId);

    this.socketService.emitToUser(message.user_id, "finish_command", {
      command: "switch_message_chain",
    });
  }

  @PluginSystem
  async handleAsrDataUpload(message: SocketMessage): Promise<void> {
    const userId = message.user_id;
    const asrSkills = this.spellbookService.getOnlineSkillFromType(
      "automatic_speech_recognition"
    );
    if (!asrSkills) {
      this.logger.error(`no asr skills are loaded`);
      this.socketService.emitToUser(userId, "finish_command", {
        command: "process_asr_data",
        text: "Error with ASR occurred 💣",
      });
      return;
    }

    const time = Date.now().toString();
    const base64Data = message.payload.wav.replace(
      `data:audio/${message.payload.file_type};base64,`,
      ""
    );
    const fileName = `chats/asr/asr-${time}-${message.user_id}.${message.payload.file_type}`;
    const filePath = await this.golemSoundService.saveSoundFile(
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
      const resp = await this.golemSoundService.automaticSpeechRecognition(
        url,
        userId,
        asrSkills[0]
      );

      this.socketService.emitToUser(userId, "finish_command", {
        command: "process_asr_data",
        text: resp.text,
      });
      await this.workspaceService.deleteFileDirect(filePath);
    } catch (ex) {}
  }

  async handleTtsDataUpload(message: SocketMessage): Promise<void> {
    const userId = message.user_id;
    const ttsSkills =
      this.spellbookService.getOnlineSkillFromType("text_to_speech");

    if (!ttsSkills) {
      this.logger.error(`no text to speech skills are loaded`);
      this.socketService.emitToUser(userId, "finish_command", {
        command: "process_tts_data",
        text: "Error with TTS occurred 💣",
      });
      return;
    }

    const words = message.payload.text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += 32) {
      const chunk = words.slice(i, i + 32).join(" ");
      chunks.push(chunk);
    }

    const voice =
      message.payload?.voice != "default"
        ? await this.workspaceService.getUserFileUrl(
            userId,
            message.payload.voice.replace(`workspace/${userId}/`, ""),
            chunks.length
          )
        : "default";

    for (let i = 0; i < chunks.length; i++) {
      const data = await this.golemSoundService.textToSpeech(
        chunks[i],
        userId,
        voice
      );

      const filename = `${userId}-${i}-asr-temp.wav`;
      const filePath = await this.golemSoundService.saveSoundFile(
        filename,
        data.wav,
        userId
      );

      const shortPath = filePath.replace(`workspace/${message.user_id}`, "");
      const url = await this.workspaceService.getUserFileUrl(
        userId,
        shortPath,
        1
      );

      this.socketService.emitToUser(userId, "finish_command", {
        command: "process_tts_data",
        wav_url: url,
      });
    }
  }
}

export default SpellbookPrompt;
