import emojiRegex from "emoji-regex";
import {
  EmbeddingInfo,
  LoadedEmbeddings,
  LoggerServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
  SpellbookServiceInterface,
  UserPermissions,
} from "types";

export class MoeHelper {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private spellbookService: SpellbookServiceInterface;
  private modelService: SequelizeServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.spellbookService = services["SpellbookService"];
    this.modelService = services["SequelizeService"];
  }

  async getEmbeddingInfo(): Promise<EmbeddingInfo> {
    const ret: EmbeddingInfo = {
      num_skill_moe_domains: 0,
      num_skill_moe_functions: 0,
      num_chat_functions: 0,
      embeddings: [],
      skill_domain_shortcuts: {},
      skill_function_shortcuts: {},
      dynamic_functions: {},
      embeddings_loaded: false,
      pinned_functions: {},
    };

    this.logger.info("generating function calling and moe embeddings");

    // load chat ability functions
    const chatAbilities = this.spellbookService.getChatAbilities();
    for (let i = 0; i < chatAbilities.length; i++) {
      const moduleInfo = this.spellbookService.getSpellByKey(
        chatAbilities[i].module_key
      );
      // do not use chat abilities that are not installed
      if (!moduleInfo || !moduleInfo.is_installed) {
        continue;
      }

      // get embeddings for function parameters
      if (chatAbilities[i].parameters) {
        const parameters = chatAbilities[i].parameters;
        for (let j = 0; j < parameters.length; j++) {
          for (let k = 0; k < parameters[j].description.length; k++) {
            ret.embeddings.push(parameters[j].description[k]);
          }
        }
      }

      for (let j = 0; j < chatAbilities[i].function_definition.length; j++) {
        ret.embeddings.push(chatAbilities[i].function_definition[j]);
        ret.num_chat_functions++;
      }
    }

    // load skill functions and moe domains
    const onlineSkills = this.spellbookService.getOnlineSkills();
    for (let i = 0; i < onlineSkills.length; i++) {
      const onlineSkill = onlineSkills[i];
      if (!onlineSkill.shortcut) continue;

      if (ret.skill_domain_shortcuts[onlineSkill.shortcut]) {
        this.logger.error(`more than one skill with same shortcut loaded!`, {
          icon: onlineSkill.shortcut,
        });
      } else {
        ret.skill_domain_shortcuts[onlineSkill.shortcut] = [];

        // load moe domains
        if (onlineSkill.moe_domain && onlineSkill.moe_domain.length) {
          ret.skill_domain_shortcuts[onlineSkill.shortcut] = [];
          for (let j = 0; j < onlineSkill.moe_domain.length; j++) {
            ret.embeddings.push(onlineSkill.moe_domain[j]);
            ret.skill_domain_shortcuts[onlineSkill.shortcut].push(
              onlineSkill.moe_domain[j]
            );
            ret.num_skill_moe_domains++;
          }
        }
      }

      if (ret.skill_function_shortcuts[onlineSkill.shortcut]) {
        this.logger.error(`more than one skill with same shortcut loaded!`, {
          icon: onlineSkill.shortcut,
        });
      } else {
        ret.skill_function_shortcuts[onlineSkill.shortcut] = [];

        // load special tasks model can handle
        if (onlineSkill.moe_function && onlineSkill.moe_function.length) {
          for (let j = 0; j < onlineSkill.moe_function.length; j++) {
            ret.embeddings.push(onlineSkill.moe_function[j]);
            ret.num_skill_moe_functions++;
            ret.skill_function_shortcuts[onlineSkill.shortcut].push(
              onlineSkill.moe_function[j]
            );
          }
        }
      }
    }

    // load dynamic function from the database
    const functionModel = this.modelService.create("DynamicFunction");
    const dynamicFunctions = await functionModel.findAll({
      attributes: ["code", "definition"],
    });
    for (let i = 0; i < dynamicFunctions.length; i++) {
      const currentFunction = dynamicFunctions[i].dataValues;
      const definitionJson = JSON.parse(currentFunction.definition);

      if (definitionJson.parameters) {
        for (const paramName in definitionJson.parameters) {
          const currentParam = definitionJson.parameters[paramName];
          ret.embeddings.push(currentParam.description);
        }
      }
      ret.dynamic_functions[`chat_ability_dynamic_functions_${i}`] = {
        definition: definitionJson,
        code: currentFunction.code,
        index: i,
      };
      ret.embeddings.push(definitionJson.function_description);
    }

    const model = this.modelService.create("PinnedEmbedding");
    const pinnedEmbeddings = await model.findAll();
    for (let i = 0; i < pinnedEmbeddings.length; i++) {
      const current = pinnedEmbeddings[i].dataValues;
      ret.embeddings.push(current.pinned_string);
      if (current.pinned_type == "skill_knowledge_domain") {
        const onlineSkill = this.spellbookService.getOnlineSkillFromKey(
          current.pinned_to
        );
        if (!onlineSkill) continue;
        const shortcut = onlineSkill.shortcut;
        if (!shortcut || !ret.skill_domain_shortcuts[shortcut]) continue;
        ret.skill_domain_shortcuts[shortcut].push(current.pinned_string);
      } else if (current.pinned_type == "chat_ability_function") {
        if (!ret.pinned_functions[current.pinned_to])
          ret.pinned_functions[current.pinned_to] = [];
        ret.pinned_functions[current.pinned_to].push(current.pinned_string);
      }
    }
    return ret;
  }

  async addFunctionEmbedding(
    embeddingMap,
    embeddings,
    functionName,
    embeddingText
  ): Promise<LoadedEmbeddings> {
    // dynamic functions should not have a pinned embedding w/ the code generator
    if (functionName == "wizards_wand_0") return embeddingMap;
    if (!embeddingMap.chat_function_map[functionName]) {
      this.logger.error(
        `invalid embedding mapping for function ${functionName}`
      );
      return embeddingMap;
    }

    for (let embedding in embeddings) {
      if (embedding == embeddingText) {
        embeddingMap.chat_function_map[functionName].push(
          embeddings[embedding][0]
        );
        break;
      }
    }

    const model = this.modelService.create("PinnedEmbedding");
    await model.create({
      pinned_string: embeddingText,
      pinned_to: functionName,
      pinned_type: "chat_ability_function",
    });

    // save the pinned embedding to the database
    this.logger.info(`pinned new embedding to chat ability ${functionName}`, {
      icon: "📌",
    });
    return embeddingMap;
  }

  async addKnowledgeDomainEmbedding(
    embeddingMap,
    embeddings,
    shortcut,
    skillKey,
    embeddingText
  ): Promise<LoadedEmbeddings> {
    if (!embeddingMap.skill_domain_map[shortcut]) {
      this.logger.error(`invalid shortcut for knowledge domain`);
      return embeddingMap;
    }

    for (let embedding in embeddings) {
      if (embedding == embeddingText) {
        embeddingMap.skill_domain_map[shortcut].push(embeddings[embedding][0]);
        break;
      }
    }

    // save the pinned embedding to the database
    const model = this.modelService.create("PinnedEmbedding");
    await model.create({
      pinned_string: embeddingText,
      pinned_to: skillKey,
      pinned_type: "skill_knowledge_domain",
    });

    this.logger.info(`pinned new embedding to skill ${skillKey}`, {
      icon: "📌",
    });
    return embeddingMap;
  }

  async findBestChatFunction(
    embedding,
    embeddingMap,
    contentJson,
    userPermissions: UserPermissions
  ): Promise<{ bestScore: number; bestFunction: string }> {
    let scores: any = {};
    for (let checkFunction in embeddingMap.chat_function_map) {
      const checkFunctionData = embeddingMap.chat_function_map[checkFunction];
      let highestMatch = 0;
      for (let i = 0; i < checkFunctionData.length; i++) {
        const similar = this.cosineSimilarity(
          contentJson.embeddings[embedding][0],
          checkFunctionData[i]
        );
        if (similar > highestMatch) highestMatch = similar;
      }
      scores[checkFunction] = highestMatch;
    }

    const sortedEntries = Object.entries(scores).sort(
      ([, valueA], [, valueB]) => (valueB as number) - (valueA as number)
    );
    const sortedScores = Object.fromEntries(sortedEntries);

    // find best score of ability user has enabled
    let bestScore: number = 0;
    let bestFunction: string = "";
    for (let abilityFunction in sortedScores) {
      let baseFunction = abilityFunction.replace(/_\d+$/, "");
      if (
        userPermissions.applications.includes(baseFunction) ||
        userPermissions.is_admin
      ) {
        bestFunction = abilityFunction;
        bestScore = sortedScores[bestFunction] as number;
        break;
      }
    }
    return { bestScore, bestFunction };
  }

  private findBestSkillMatch(
    embedding,
    embeddingMap,
    contentJson,
    findType,
    userPermissions: UserPermissions
  ) {
    let scores: any = {};
    for (let checkFunction in embeddingMap[findType]) {
      const checkFunctionData = embeddingMap[findType][checkFunction];
      let highestMatch = 0;
      for (let i = 0; i < checkFunctionData.length; i++) {
        const similar = this.cosineSimilarity(
          contentJson.embeddings[embedding][0],
          checkFunctionData[i]
        );
        if (similar > highestMatch) highestMatch = similar;
      }
      scores[checkFunction] = highestMatch;
    }

    const sortedEntries = Object.entries(scores).sort(
      ([, valueA], [, valueB]) => (valueB as number) - (valueA as number)
    );
    const sortedScores = Object.fromEntries(sortedEntries);

    // find best score of a skill user has enabled
    let bestMoeScore: number = 0;
    let bestSkillShortcut: string = "";
    for (let checkScore in sortedScores) {
      const shortcutModel = this.spellbookService.getShortcutSkill(checkScore);
      if (
        userPermissions.skills.includes(shortcutModel) ||
        userPermissions.is_admin
      ) {
        bestSkillShortcut = checkScore;
        bestMoeScore = sortedScores[bestSkillShortcut] as number;
        break;
      }
    }
    return { bestMoeScore, bestSkillShortcut };
  }

  async findBestMoeSkill(
    embedding,
    embeddingMap,
    contentJson,
    userPermissions: UserPermissions
  ) {
    const { bestMoeScore, bestSkillShortcut } = this.findBestSkillMatch(
      embedding,
      embeddingMap,
      contentJson,
      "skill_domain_map",
      userPermissions
    );
    return { bestMoeScore, bestSkillShortcut };
  }

  async findBestMoeFunction(
    embedding,
    embeddingMap,
    contentJson,
    userPermissions: UserPermissions
  ) {
    const { bestMoeScore, bestSkillShortcut } = this.findBestSkillMatch(
      embedding,
      embeddingMap,
      contentJson,
      "skill_function_map",
      userPermissions
    );
    return { bestMoeScore, bestSkillShortcut };
  }

  async mapEmbeddings(
    embeddings: string[],
    embeddingInfo: any,
    headers: any
  ): Promise<LoadedEmbeddings> {
    const ret: LoadedEmbeddings = {
      skill_function_map: {},
      skill_domain_map: {},
      chat_function_map: {},
      chat_function_parameters_map: {},
    };

    const skills = this.spellbookService.getChatAbilities();
    for (let embedding in embeddings) {
      // loop through chat abilities and map embeddings that match
      for (let i = 0; i < skills.length; i++) {
        const moduleInfo = this.spellbookService.getSpellByKey(
          skills[i].module_key
        );
        // do not map chat abilities that are not installed
        if (!moduleInfo || !moduleInfo.is_installed) {
          continue;
        }

        // map the embedding for the function parameters
        for (let j = 0; j < skills[i].parameters.length; j++) {
          const currentParam = skills[i].parameters[j];
          for (let k = 0; k < currentParam.description.length; k++) {
            // map all the parameter descriptions
            if (currentParam.description[k] == embedding) {
              // make sure parent objects are created
              if (!ret.chat_function_parameters_map[skills[i].unique_key]) {
                ret.chat_function_parameters_map[skills[i].unique_key] = {};
              }
              if (
                !ret.chat_function_parameters_map[skills[i].unique_key][
                  currentParam.name
                ]
              ) {
                ret.chat_function_parameters_map[skills[i].unique_key][
                  currentParam.name
                ] = {};
              }

              ret.chat_function_parameters_map[skills[i].unique_key][
                currentParam.name
              ][currentParam.description[k]] = embeddings[embedding][0];
            }
          }
        }

        // map the function definition embeddings
        for (let j = 0; j < skills[i].function_definition.length; j++) {
          if (skills[i].function_definition[j] == embedding) {
            if (!ret.chat_function_map[skills[i].unique_key]) {
              ret.chat_function_map[skills[i].unique_key] = [];
            }
            ret.chat_function_map[skills[i].unique_key].push(
              embeddings[embedding][0]
            );
          }
        }

        // map the pinned embeddings
        if (embeddingInfo.pinned_functions[skills[i].unique_key]) {
          const pinned = embeddingInfo.pinned_functions[skills[i].unique_key];
          for (let j = 0; j < pinned.length; j++) {
            if (pinned[j] == embedding) {
              ret.chat_function_map[skills[i].unique_key].push(
                embeddings[embedding][0]
              );
            }
          }
        }
      }

      // map domain shortcuts
      for (let shortcut in embeddingInfo.skill_domain_shortcuts) {
        const shortcuts = embeddingInfo.skill_domain_shortcuts[shortcut];
        for (let j = 0; j < shortcuts.length; j++) {
          const checkStr = embeddingInfo.skill_domain_shortcuts[shortcut][j];
          if (checkStr == embedding) {
            if (!ret.skill_domain_map[shortcut]) {
              ret.skill_domain_map[shortcut] = [];
            }
            ret.skill_domain_map[shortcut].push(embeddings[embedding][0]);
          }
        }
      }

      // map domain functions
      for (let shortcut in embeddingInfo.skill_function_shortcuts) {
        const shortcuts = embeddingInfo.skill_function_shortcuts[shortcut];
        for (let j = 0; j < shortcuts.length; j++) {
          const checkStr = embeddingInfo.skill_function_shortcuts[shortcut][j];
          if (checkStr == embedding) {
            if (!ret.skill_function_map[shortcut]) {
              ret.skill_function_map[shortcut] = [];
            }
            ret.skill_function_map[shortcut].push(embeddings[embedding][0]);
          }
        }
      }

      // map dynamic functions
      for (let dynamicFunctionId in embeddingInfo.dynamic_functions) {
        const currentFunc = embeddingInfo.dynamic_functions[dynamicFunctionId];
        const functionName = `chat_ability_dynamic_functions_${currentFunc.index}`;
        if (currentFunc.definition.function_description == embedding) {
          ret.chat_function_map[functionName] = [embeddings[embedding][0]];
        }

        for (const paramName in currentFunc.definition.parameters) {
          const currentParam = currentFunc.definition.parameters[paramName];
          if (currentParam.description == embedding) {
            if (!ret.chat_function_parameters_map[functionName]) {
              ret.chat_function_parameters_map[functionName] = {};
            }
            if (!ret.chat_function_parameters_map[functionName][paramName]) {
              ret.chat_function_parameters_map[functionName][paramName] = {};
            }

            ret.chat_function_parameters_map[functionName][paramName][
              currentParam.description
            ] = embeddings[embedding][0];
          }
        }
      }
    }
    return ret;
  }

  cosineSimilarity(A, B): number {
    let dotproduct = 0;
    var mA = 0;
    var mB = 0;

    for (var i = 0; i < A.length; i++) {
      dotproduct += A[i] * B[i];
      mA += A[i] * A[i];
      mB += B[i] * B[i];
    }

    mA = Math.sqrt(mA);
    mB = Math.sqrt(mB);
    var similarity = dotproduct / (mA * mB);
    return similarity;
  }

  extractFirstJSON(str: string) {
    let openBraceCount = 0;
    let closeBraceCount = 0;
    let startIndex = -1;
    let endIndex = -1;

    for (let i = 0; i < str.length; i++) {
      if (str[i] === "{") {
        if (startIndex === -1) {
          startIndex = i;
        }
        openBraceCount++;
      } else if (str[i] === "}") {
        closeBraceCount++;
      }

      if (startIndex !== -1 && openBraceCount === closeBraceCount) {
        endIndex = i;
        break;
      }
    }

    return startIndex !== -1 && endIndex !== -1
      ? str.substring(startIndex, endIndex + 1)
      : null;
  }

  truncateMessages(keepLast: number, message): boolean {
    const numMessages = message.payload.messages.length;
    if (numMessages < keepLast) return false;
    message.payload.messages = message.payload.messages.slice(-1 * keepLast);
    return true;
  }

  async applyShortcuts(
    shortcutData: string,
    message: any,
    skillConfig: any,
    availableLanguageModels: any,
    userPermissions: UserPermissions
  ) {
    const regex = emojiRegex();
    let match = regex.exec(shortcutData);
    let contextChanged = false;
    let modelManuallySelected = false;
    let functionManuallySelected = false;
    let manuallySelectedModel = null;
    let lastEmoji = null;
    let userShortcutsArray = [];
    let aiShortcutsArray = [];

    const numEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
    while (match) {
      let loggerMessage = null;
      // only send this message to the LLM
      if (
        match[0] === "👉" &&
        !contextChanged &&
        this.truncateMessages(1, message)
      ) {
        loggerMessage = `truncating messages to last message only`;
        userShortcutsArray.push(match[0]);
        contextChanged = true;
      }
      // handle context shortening
      else if (numEmojis.includes(match[0])) {
        if (lastEmoji === "👆" && !contextChanged) {
          const keepLast = parseInt(match[0]) * 2 + 1;
          if (this.truncateMessages(keepLast, message)) {
            loggerMessage = `truncating messages to last ${keepLast} messages only`;
            userShortcutsArray.push(lastEmoji);
            userShortcutsArray.push(match[0]);
            contextChanged = true;
          }
        }

        // allow for manually selecting of non-primary chat ability
        if (
          functionManuallySelected &&
          lastEmoji === aiShortcutsArray[0] &&
          this.spellbookService.getShortcutFunction(
            `${aiShortcutsArray[0]}${match[0]}`
          )
        ) {
          aiShortcutsArray.push(match[0]);
        }
      }
      // use primary model
      else if (
        match[0] === "🥇" &&
        skillConfig &&
        skillConfig.preferred_model &&
        availableLanguageModels.includes(skillConfig.preferred_model)
      ) {
        loggerMessage = `using preferred model ${skillConfig.preferred_model}`;
        manuallySelectedModel = skillConfig.preferred_model;
        aiShortcutsArray.push(match[0]);
        modelManuallySelected = true;
      }
      // use secondary model
      else if (
        match[0] === "🥈" &&
        skillConfig &&
        skillConfig.secondary_model &&
        availableLanguageModels.includes(skillConfig.secondary_model)
      ) {
        loggerMessage = `using secondary model ${skillConfig.secondary_model}`;
        manuallySelectedModel = skillConfig.secondary_model;
        aiShortcutsArray.push(match[0]);
        modelManuallySelected = true;
      } else if (!functionManuallySelected && !modelManuallySelected) {
        if (!functionManuallySelected) {
          const shortcutFunction = this.spellbookService.getShortcutFunction(
            match[0]
          );
          if (shortcutFunction) {
            let baseFunction = shortcutFunction.replace(/_\d+$/, "");
            if (
              userPermissions.applications.includes(baseFunction) ||
              userPermissions.is_admin
            ) {
              functionManuallySelected = true;
              aiShortcutsArray.push(match[0]);
            }
          }
        }

        if (!functionManuallySelected && !modelManuallySelected) {
          const shortcutSkill = this.spellbookService.getShortcutSkill(
            match[0]
          );
          if (shortcutSkill) {
            if (
              userPermissions.skills.includes(shortcutSkill) ||
              userPermissions.is_admin
            ) {
              manuallySelectedModel = shortcutSkill;
              modelManuallySelected = true;
              aiShortcutsArray.push(match[0]);
            }
          }
        }
      }

      if (loggerMessage) {
        this.logger.info(loggerMessage, { icon: match[0] });
      }
      lastEmoji = match[0];
      match = regex.exec(shortcutData);
    }

    const userShortcuts = userShortcutsArray.join("");
    const aiShortcuts = aiShortcutsArray.join("");
    return {
      modelManuallySelected,
      manuallySelectedModel,
      functionManuallySelected,
      userShortcuts,
      aiShortcuts,
    };
  }

  selectDefaultLanguageModel(skillConfig, userPermissions): string {
    let availableLanguageModels =
      this.spellbookService.getOnlineSkillFromType("language_model");

    if (!availableLanguageModels) {
      availableLanguageModels = this.spellbookService.getOnlineSkillFromType(
        "visual_language_model"
      );
    }

    const clippedList = [];
    for (let i = 0; i < availableLanguageModels.length; i++) {
      if (
        userPermissions.skills.includes(availableLanguageModels[i]) ||
        userPermissions.is_admin
      )
        clippedList.push(availableLanguageModels[i]);
    }

    // select the default model
    let ret = clippedList ? clippedList[0] : null;
    if (
      skillConfig?.preferred_model &&
      clippedList.includes(skillConfig.preferred_model)
    ) {
      return skillConfig.preferred_model;
    }

    // select primary model if available
    if (
      skillConfig?.secondary_model &&
      clippedList.includes(skillConfig.secondary_model)
    ) {
      return skillConfig.secondary_model;
    }
    return ret;
  }
}
