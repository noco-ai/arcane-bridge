import {
  ClassFactoryServiceInterface,
  LoggerServiceInterface,
  SequelizeServiceInterface,
  SocketsServiceInterface,
  VaultServiceInterface,
  ServerData,
  AmqpServiceInterface,
  ServicesConstructorInterface,
  SpellbookConfig,
  ChatMessage,
  MenuItem,
  SkillConfig,
  ChatAbilityConfig,
  OnlineSkill,
  SpellbookServiceInterface,
  SocketMessage,
  EmptyCliOptions,
} from "types";
import { PluginSystem } from "../../../plugin";
import Ajv from "ajv";
import fs from "fs";
import path from "path";

export class SpellbookService implements SpellbookServiceInterface {
  private services: ServicesConstructorInterface;
  private amqpService: AmqpServiceInterface;
  private socketService: SocketsServiceInterface;
  private logger: LoggerServiceInterface;
  private modelService: SequelizeServiceInterface;
  private factoryService: ClassFactoryServiceInterface;
  private vaultService: VaultServiceInterface;
  private fullMenu: MenuItem[];
  private prompts: Map<string, Map<string, string>>;
  private chatAbilities: ChatAbilityConfig[];
  private chatAbilitiesMap: Map<string, ChatAbilityConfig>;
  private serverStatus: Map<string, ServerData>;
  private onlineSkillTypesMap: Map<string, string[]>;
  private onlineSkills: Map<string, OnlineSkill>;
  private allSkills: Map<string, SkillConfig>;
  private spellDetails: SpellbookConfig[];
  private spellDetailsMap: Map<string, SpellbookConfig>;
  private skillShortcutMap: Map<string, string>;
  private functionShortcutMap: Map<string, string>;
  private activeSkillCommands: Map<string, string>;
  private validateSkill: any = null;

  constructor(
    cliOptions: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.services = services;
    this.amqpService = services["AmqpService"];
    this.logger = services["LoggerService"];
    this.socketService = services["SocketService"];
    this.modelService = services["SequelizeService"];
    this.vaultService = services["VaultService"];
    this.factoryService = services["ClassFactoryService"];
    this.serverStatus = new Map();
    this.onlineSkillTypesMap = new Map();
    this.skillShortcutMap = new Map();
    this.onlineSkills = new Map();
    this.allSkills = new Map();
    this.activeSkillCommands = new Map();
  }

  @PluginSystem
  setMenu(menu: MenuItem[]): boolean {
    if (this.fullMenu) {
      this.logger.error(`menu has already been set on spellbook service`);
      return false;
    }
    this.fullMenu = menu;
    return true;
  }

  @PluginSystem
  setSpellDetails(spellDetails: SpellbookConfig[]): boolean {
    if (this.spellDetails) {
      this.logger.error(`spell details already set on spellbook service`);
      return false;
    }
    this.spellDetailsMap = new Map();
    for (let i = 0; i < spellDetails.length; i++) {
      this.spellDetailsMap.set(spellDetails[i].unique_key, spellDetails[i]);
    }
    this.spellDetails = spellDetails;
    return true;
  }

  @PluginSystem
  setChatAbilities(chatAbilities: ChatAbilityConfig[]): boolean {
    if (this.chatAbilities) {
      this.logger.error(`chat abilities are already set on spellbook service`);
      return false;
    }
    this.chatAbilitiesMap = new Map();
    this.functionShortcutMap = new Map();
    for (let i = 0; i < chatAbilities.length; i++) {
      this.chatAbilitiesMap.set(chatAbilities[i].unique_key, chatAbilities[i]);

      if (chatAbilities[i].shortcut) {
        this.functionShortcutMap.set(
          chatAbilities[i].shortcut,
          chatAbilities[i].unique_key
        );
      }
    }
    this.chatAbilities = chatAbilities;
    return true;
  }

  @PluginSystem
  getSpellByKey(uniqueKey: string): SpellbookConfig {
    if (!uniqueKey) return null;
    if (!this.spellDetailsMap.has(uniqueKey)) {
      this.logger.warn(`could not find spell with key ${uniqueKey}`);
      return null;
    }
    return this.spellDetailsMap.get(uniqueKey);
  }

  @PluginSystem
  getChatAbilityByKey(uniqueKey: string): ChatAbilityConfig {
    if (!uniqueKey) return null;
    if (!this.chatAbilitiesMap.has(uniqueKey)) {
      this.logger.warn(`could not find chat ability with key ${uniqueKey}`);
      return null;
    }
    return this.chatAbilitiesMap.get(uniqueKey);
  }

  @PluginSystem
  getChatAbilities(): ChatAbilityConfig[] {
    return this.chatAbilities;
  }

  @PluginSystem
  setPrompts(prompts: Map<string, Map<string, string>>): boolean {
    if (this.prompts) {
      this.logger.error(`prompts already set for spellbook service`);
      return false;
    }
    this.prompts = prompts;
    return true;
  }

  @PluginSystem
  getPrompt(module: string, promptKey: string): string | null | ChatMessage[] {
    if (!this.prompts.has(module)) return null;
    const modulePrompts = this.prompts.get(module);
    if (!modulePrompts.has(promptKey)) return null;
    return modulePrompts.get(promptKey);
  }

  @PluginSystem
  getPrompts(module: string): Map<string, ChatMessage[] | string> | null {
    if (!this.prompts.has(module)) return null;
    return this.prompts.get(module);
  }

  private checkSkillDependencies(
    check: SpellbookConfig | ChatAbilityConfig
  ): boolean {
    if (!check.skill_dependencies) return false;
    let currentHasRedStyle = false;
    for (let j = 0; j < check.skill_dependencies.length; j++) {
      const checkSkill: string = check.skill_dependencies[j];
      if (checkSkill.indexOf("|") !== -1) {
        const parts = checkSkill.split("|");
        currentHasRedStyle = true;
        for (let k = 0; k < parts.length; k++) {
          if (
            this.getOnlineSkillFromType(parts[k]) ||
            this.getOnlineSkillFromKey(parts[k])
          ) {
            currentHasRedStyle = false;
            break;
          }
        }
      } else if (
        !this.getOnlineSkillFromType(checkSkill) &&
        !this.getOnlineSkillFromKey(checkSkill)
      ) {
        currentHasRedStyle = true;
        break;
      }
    }
    return currentHasRedStyle;
  }

  @PluginSystem
  private updateMenuStyle(
    items: MenuItem[],
    spellLabels: boolean = false
  ): MenuItem[] {
    const clonedItems: MenuItem[] = JSON.parse(JSON.stringify(items));
    const useReasoningAgent = this.getOnlineSkillFromKey("llama2_7b_exllama");
    const useEmbeddingModel = this.getOnlineSkillFromKey("e5_large_v2");

    const processItems = (
      items: MenuItem[]
    ): { modifiedItems: MenuItem[]; redStyleDetected: boolean } => {
      let redStyleDetected = false;

      const removeIndexes = [];
      let currentItem = 0;

      for (let item of items) {
        item.label = spellLabels ? item.spell_label : item.label;
        if (item.spell_label) delete item.spell_label;
        let currentHasRedStyle = false;
        const checkModule = this.getSpellByKey(item.item_module);
        if (!checkModule.is_installed) {
          removeIndexes.push(currentItem);
          currentItem++;
          continue;
        }

        currentHasRedStyle = this.checkSkillDependencies(checkModule);
        // has red style if dependency skills not online
        if (
          checkModule.chat_ability.length &&
          (!useReasoningAgent || !useEmbeddingModel)
        ) {
          currentHasRedStyle = true;
        }

        // check individual skills
        if (!currentHasRedStyle) {
          for (let i = 0; i < checkModule.chat_ability.length; i++) {
            const check = checkModule.chat_ability[i];
            if (this.checkSkillDependencies(check)) {
              currentHasRedStyle = true;
              break;
            }
          }
        }

        let childrenHaveRedStyle = false;
        if (item.items) {
          const result = processItems(item.items);
          item.items = result.modifiedItems;
          childrenHaveRedStyle = result.redStyleDetected;

          if (item.items.length === 0) {
            removeIndexes.push(currentItem);
          }
        }

        if (currentHasRedStyle || childrenHaveRedStyle) {
          item.style = "missing-dependency";
          redStyleDetected = true;
        }

        currentItem++;
      }

      const modifiedItems = items.filter(
        (_, index) => !removeIndexes.includes(index)
      );

      return { modifiedItems, redStyleDetected };
    };

    const result = processItems(clonedItems);
    return result.modifiedItems;
  }

  @PluginSystem
  async handleUpdateModule(message: SocketMessage): Promise<boolean> {
    const payload = message.payload;
    const moduleData = this.getSpellByKey(message.payload.module);
    if (!moduleData) {
      this.logger.error(`${payload.module} not found`);
      return true;
    }

    if (!moduleData.can_remove && payload.is_installed) {
      this.logger.error(
        `trying to uninstall required module ${payload.module}`
      );
      return true;
    }

    // load module data from db
    const spellbookModel = this.modelService.create("SpellbookModule");
    const loadModule = await spellbookModel.findOne({
      where: {
        unique_key: payload.module,
      },
    });

    if (!loadModule) {
      this.logger.error(`${payload.module} was not found`);
      return true;
    } else {
      const updateTo = payload.is_installed ? "available" : "installed";
      const updateFlagTo = payload.is_installed ? false : true;
      loadModule.status = updateTo;
      loadModule.save();

      const updSpell = this.spellDetailsMap.get(payload.module);
      updSpell.is_installed = updateFlagTo;
      this.spellDetailsMap.set(payload.module, updSpell);
    }

    this.socketService.emit(message.socket_id, "finish_command", {
      command: "update_module",
      module: payload.module,
    });
    return true;
  }

  @PluginSystem
  async handleGetMenu(message: SocketMessage): Promise<boolean> {
    // send the menu back to the sender
    const updatedMenu = this.updateMenuStyle(
      this.fullMenu,
      message.payload.spell_labels
    );
    this.socketService.emit(message.socket_id, "menu", updatedMenu);
    return true;
  }

  private makeLabel(input: string) {
    let labelSplit = input.split("_");
    for (let i = 0; i < labelSplit.length; i++) {
      labelSplit[i] = labelSplit[i][0].toUpperCase() + labelSplit[i].substr(1);
    }
    return labelSplit.join(" ");
  }

  @PluginSystem
  async handleSpellList(message: SocketMessage): Promise<boolean> {
    // add dynamic configuration data
    const useReasoningAgent = this.getOnlineSkillFromKey("llama2_7b_exllama");
    const useEmbeddingModel = this.getOnlineSkillFromKey("e5_large_v2");
    const reasonAgentLabel = useReasoningAgent
      ? this.getSkillFromKey("llama2_7b_exllama").label
      : "Llama v2 7B (ExLlama)";
    const embeddingDataLabel = useEmbeddingModel
      ? this.getSkillFromKey("e5_large_v2").label
      : "E5 Large V2";

    for (let i = 0; i < this.spellDetails.length; i++) {
      // skip spells with no configuration
      const currentSpell = this.spellDetails[i];

      // send info on if dependencies are running
      currentSpell.skill_status = [];

      // give every skill a offline
      if (currentSpell.chat_ability.length) {
        if (!useReasoningAgent) {
          currentSpell.skill_status.push({
            skill: reasonAgentLabel,
            class_name: "is-offline",
          });
        }

        if (!useEmbeddingModel) {
          currentSpell.skill_status.push({
            skill: embeddingDataLabel,
            class_name: "is-offline",
          });
        }
      }

      for (let j = 0; j < currentSpell.skill_dependencies.length; j++) {
        const currentDep = currentSpell.skill_dependencies[j];

        // build default label
        let className = "is-online";
        const skillData = this.getSkillFromKey(currentDep);
        let label = skillData ? skillData.label : this.makeLabel(currentDep);

        // or selector
        if (currentDep.indexOf("|") !== -1) {
          className = "is-offline";
          const parts = currentDep.split("|");

          let labelSplit = [];
          for (let k = 0; k < parts.length; k++) {
            const skillData = this.getSkillFromKey(parts[k]);
            const pushLabel = skillData
              ? skillData.label
              : this.makeLabel(parts[k]);
            labelSplit.push(pushLabel);
            if (
              this.getOnlineSkillFromType(parts[k]) ||
              this.getOnlineSkillFromKey(parts[k])
            ) {
              className = "is-online";
            }
          }
          label = labelSplit.join(" OR ");
        } else if (
          !this.getOnlineSkillFromType(currentDep) &&
          !this.getOnlineSkillFromKey(currentDep)
        ) {
          className = "is-offline";
        }

        currentSpell.skill_status.push({
          skill: label,
          class_name: className,
        });
      }

      // loop through options
      if (!currentSpell.configuration || !currentSpell.configuration.options)
        continue;

      const currentOptions = currentSpell.configuration.options;
      for (let j = 0; j < currentOptions.length; j++) {
        const currentOption = currentOptions[j];
        if (!currentOption.modifier_class || !currentOption.modifier_function)
          continue;

        // call function to get custom options
        const getClass = this.factoryService.create(
          currentSpell.module,
          currentOption.modifier_class
        );
        if (!getClass[currentOption.modifier_function]) {
          this.logger.error(
            `function ${currentOption.modifier_function} not defined in ${currentOption.modifier_class}`
          );
          continue;
        }

        const newData = await getClass[currentOption.modifier_function](
          currentOption
        );
        this.spellDetails[i].configuration.options[j] = newData;
      }
    }

    this.socketService.emit(message.socket_id, "spell_list", this.spellDetails);
    return true;
  }

  @PluginSystem
  async publishCommand(
    exchange: string,
    routingKey: string,
    command: string,
    payload: any,
    customerHeaders?: any
  ): Promise<boolean> {
    let headers = {
      command: command,
      return_routing_key: "arcane_bridge_" + this.amqpService.getServerId(),
      return_exchange: "arcane_bridge",
    };

    headers = { ...customerHeaders, ...headers };
    await this.amqpService.publishMessage(
      exchange,
      routingKey,
      "arcane_bridge_" + this.amqpService.getServerId(),
      payload,
      headers
    );
    return true;
  }

  @PluginSystem
  async handleGetConfiguration(message: SocketMessage): Promise<boolean> {
    const post = message.payload.payload;
    const vaultPath = post.vault_path;
    let configData = await this.vaultService.getGroup(vaultPath);
    if (!configData) configData = {};

    for (let i = 0; i < post.options.length; i++) {
      const currentConfig = post.options[i];
      if (
        currentConfig.type === "secret" &&
        configData[currentConfig["name"]]
      ) {
        configData[currentConfig["name"]] = "SECRET";
      }

      if (!configData[currentConfig["name"]] && currentConfig.default) {
        configData[currentConfig["name"]] = currentConfig.default;
      }
    }

    this.socketService.emit(message.socket_id, "finish_command", {
      command: "get_configuration",
      configuration: configData,
    });
    return true;
  }

  @PluginSystem
  async handleRunSkill(message: SocketMessage): Promise<boolean> {
    const serverId = message.payload.payload.server_id;
    delete message.payload.payload.server_id;

    const ret = await this.publishCommand(
      "golem",
      serverId,
      "run_skill",
      message.payload.payload,
      { socket_id: message.socket_id }
    );

    this.activeSkillCommands.set(
      message.payload.payload.routing_key,
      message.socket_id
    );
    return ret;
  }

  @PluginSystem
  async handleInstallSkill(message: SocketMessage): Promise<boolean> {
    const ret = await this.publishCommand(
      "golem",
      message.payload.payload.server_id,
      "install_skill",
      message.payload.payload,
      { socket_id: message.socket_id }
    );

    this.activeSkillCommands.set(
      message.payload.payload.routing_key,
      message.socket_id
    );
    return ret;
  }

  @PluginSystem
  async handleStopSkill(message: SocketMessage): Promise<boolean> {
    const serverId = message.payload.payload.server_id;
    delete message.payload.payload.server_id;

    const ret = await this.publishCommand(
      "golem",
      serverId,
      "stop_skill",
      message.payload.payload,
      { socket_id: message.socket_id }
    );

    return ret;
  }

  @PluginSystem
  async handleWorkerReport(message: SocketMessage): Promise<boolean> {
    const ret = await this.publishCommand(
      "golem_broadcast",
      "",
      "system_info",
      { command: "system_info" },
      { socket_id: message.socket_id }
    );
    return ret;
  }

  @PluginSystem
  async handleConfigureSkill(message: SocketMessage): Promise<boolean> {
    const post = message.payload.payload;
    const vaultPath = post.vault_path;
    delete post.vault_path;
    this.vaultService.setGroup(vaultPath, post);

    // let servers know configuration was updated
    const ret = await this.publishCommand(
      "golem_broadcast",
      "",
      "update_configuration",
      { command: "update_configuration", vault_path: vaultPath },
      { socket_id: message.socket_id }
    );

    return true;
  }

  @PluginSystem
  async handleCustomSkill(message: SocketMessage): Promise<boolean> {
    let validateFailed = false;
    let toastSummary = `Custom skill is not valid`;
    let toastSeverity = "error";
    let toastDetails = "";

    if (!this.validateSkill) {
      const schemaPath = path.join(
        __dirname,
        "../../../../src/modules/spellbook/core/asset/custom-skill.schema"
      );
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
      const ajv = new Ajv();
      this.validateSkill = ajv.compile(schema);
    }

    const skill = message.payload.skill;
    try {
      const skillJson = JSON.parse(skill);

      // Validate against the cached schema
      const valid = this.validateSkill(skillJson);
      if (!valid) {
        validateFailed = true;
        toastDetails = `The JSON you provided does not match the expected format: ${this.validateSkill.errors?.[0].message}`;
      } else {
        for (const [key, value] of this.allSkills.entries()) {
          if (skillJson.label == value.label) {
            validateFailed = true;
            toastDetails = `The label ${skillJson.label} you provided is not unique, please choose a unique skill label.`;
            break;
          } else if (skillJson.name == value.name) {
            validateFailed = true;
            toastDetails = `The name you provided is not unique, please choose a unique skill name.`;
            break;
          }
        }
      }

      if (!validateFailed && this.getSkillFromKey(skillJson.routing_key)) {
        validateFailed = true;
        toastDetails = `The routing key you provided is not unique, please choose a unique routing key.`;
        return true;
      }

      // passed validation, send to the backend server
      if (!validateFailed) {
        toastSummary = `Custom skill installed 🚀`;
        toastSeverity = "success";
        toastDetails = `Your custom skill has been sent to the golem server, you can now install it.`;
        await this.publishCommand(
          "golem_broadcast",
          "",
          "custom_skill",
          skillJson,
          { socket_id: message.socket_id }
        );
        await this.pingGolemServer("", true);
      }
    } catch (ex) {
      toastDetails = `The JSON you provided is not valid and could not be parsed by the system`;
    }

    this.sendToastMessage(
      message.socket_id,
      toastSummary,
      toastDetails,
      toastSeverity
    );
    return true;
  }

  @PluginSystem
  private async buildSkillIndexes() {
    const onlineSkills: Map<string, OnlineSkill> = new Map();
    const onlineSkillTypesMap: Map<string, string[]> = new Map();
    const skillShortcutMap: Map<string, string> = new Map();
    const allSkills: Map<string, SkillConfig> = new Map();

    // loop through all online servers
    for (const serverData of this.serverStatus.values()) {
      // running skills index
      serverData.running_skills.forEach((skill) => {
        onlineSkills.set(skill.routing_key, JSON.parse(JSON.stringify(skill)));
      });

      // running skills index
      serverData.installed_skills.forEach((skill) => {
        allSkills.set(skill.routing_key, skill);
      });
    }

    // run loop again adding some additional info the the objects
    for (const serverData of this.serverStatus.values()) {
      serverData.running_skills.forEach((skill) => {
        const currentOnline = onlineSkills.get(skill.routing_key);
        if (!currentOnline.instances) currentOnline.instances = [];

        const skillData = allSkills.get(skill.routing_key);
        currentOnline.instances.push({
          server_id: serverData.server_id,
          device: skill.device,
          use_precision: skill.use_precision,
          thread_status: skill.thread_status,
        });

        currentOnline.use = skillData.use;
        currentOnline.label = skillData.label;
        currentOnline.moe_function = skillData.moe_function;
        currentOnline.moe_domain = skillData.moe_domain;

        skillData.use.forEach((skillType) => {
          const onlineSkillArray = onlineSkillTypesMap.has(skillType)
            ? onlineSkillTypesMap.get(skillType)
            : [];
          if (
            !onlineSkillArray.includes(skillData.routing_key) &&
            currentOnline.thread_status == "ONLINE"
          ) {
            onlineSkillArray.push(skillData.routing_key);
            onlineSkillTypesMap.set(skillType, onlineSkillArray);
          }
        });
        if (skillData.shortcut) {
          currentOnline.shortcut = skillData.shortcut;
          skillShortcutMap.set(skillData.shortcut, skillData.routing_key);
        }

        onlineSkills.set(skill.routing_key, currentOnline);
      });
    }

    // cleanup old maps
    delete this.onlineSkillTypesMap;
    delete this.allSkills;
    delete this.skillShortcutMap;
    delete this.onlineSkills;

    // assign new maps
    this.onlineSkillTypesMap = onlineSkillTypesMap;
    this.onlineSkills = onlineSkills;
    this.allSkills = allSkills;
    this.skillShortcutMap = skillShortcutMap;
  }

  @PluginSystem
  getOnlineSkills(): OnlineSkill[] {
    const onlineSkills = [];
    for (const [key, value] of this.onlineSkills.entries()) {
      onlineSkills.push(value);
    }
    return onlineSkills;
  }

  @PluginSystem
  getShortcutSkill(shortcut: string): string {
    return this.skillShortcutMap.has(shortcut)
      ? this.skillShortcutMap.get(shortcut)
      : null;
  }

  @PluginSystem
  getShortcutFunction(shortcut: string): string {
    return this.functionShortcutMap.has(shortcut)
      ? this.functionShortcutMap.get(shortcut)
      : null;
  }

  @PluginSystem
  async sendToastMessage(
    socketId: string,
    summary: string,
    detail: string,
    severity: string
  ): Promise<boolean> {
    await this.socketService.emit(socketId, "toast_message", {
      summary: summary,
      detail: detail,
      severity: severity,
    });
    return true;
  }

  @PluginSystem
  async processMessageQueue(message): Promise<boolean> {
    const headers = message.properties.headers;
    const command = headers.command;
    if (!command) {
      this.logger.warn(`invalid amqp message, no command header`);
    }

    if (command === "golem_log") {
      this.logger.info(message.content.toString(), { icon: "🗿" });
      return true;
    } else if (command === "system_info") {
      const data = JSON.parse(message.content);

      this.serverStatus.set(data.server_id, data);
      this.buildSkillIndexes();

      let updateSockets = [];
      if (headers.socket_id) {
        updateSockets.push(headers.socket_id);
      } else if (headers.socket_broadcast) {
        updateSockets = this.socketService.getOpenSockets();
      } else {
        return true;
      }

      // pass data to calling client is there was one
      const updateJson = JSON.parse(message.content);
      for (let i = 0; i < updateSockets.length; i++) {
        this.socketService.emit(updateSockets[i], "system_info", updateJson);
      }
    } else if (command === "skill_started") {
      const serverData = JSON.parse(message.content);
      this.logger.info(`skill started ${serverData.skill_key}`, { icon: "🐇" });
      await this.pingGolemServer(serverData.server_id, true);
      const skillData = this.getSkillFromKey(serverData.skill_key);
      if (skillData && this.activeSkillCommands.has(serverData.skill_key)) {
        const socketId = this.activeSkillCommands.get(serverData.skill_key);
        this.activeSkillCommands.delete(serverData.skill_key);
        await this.sendToastMessage(
          socketId,
          skillData.label,
          `${skillData.label} skill started`,
          "success"
        );
      }
    } else if (command === "skill_stopped") {
      const serverData = JSON.parse(message.content);
      this.logger.info(`skill stopped ${serverData.skill_key}`, { icon: "🛑" });
      await this.pingGolemServer(serverData.server_id, true);
    } else if (command === "skill_downloaded") {
      const serverData = JSON.parse(message.content);
      this.logger.info(`skill downloaded ${serverData.skill_key}`, {
        icon: "🚀",
      });
      await this.pingGolemServer(serverData.server_id, true);
      const skillData = this.getSkillFromKey(serverData.skill_key);
      if (skillData && this.activeSkillCommands.has(serverData.skill_key)) {
        const socketId = this.activeSkillCommands.get(serverData.skill_key);
        this.activeSkillCommands.delete(serverData.skill_key);
        await this.sendToastMessage(
          socketId,
          skillData.label,
          `${skillData.label} was downloaded successfully`,
          "success"
        );
      }
    }
    return true;
  }

  @PluginSystem
  async simulateFragment(
    socketMessage: SocketMessage,
    text: string,
    tokensPerSecond: number
  ) {
    // Convert message to array of characters
    let i = 0;
    const characters = text.split("");
    const sendToken = async () => {
      const tokenLength = Math.floor(Math.random() * 3) + 2;
      const token = characters.slice(i, i + tokenLength).join("");

      // Emit the token
      await this.amqpService.publishMessage(
        "arcane_bridge",
        "arcane_bridge_" + this.amqpService.getServerId(),
        "arcane_bridge_" + this.amqpService.getServerId(),
        token,
        { command: "prompt_fragment", socket_id: socketMessage.socket_id },
        true
      );
      i += tokenLength;

      if (i < characters.length) {
        const variance = Math.random() > 0.5 ? 1 : -1;
        const delay = 1000 / tokensPerSecond + variance * Math.random() * 200;
        setTimeout(sendToken, delay);
      }
    };

    // Start sending tokens
    sendToken();
  }

  @PluginSystem
  async start(): Promise<boolean> {
    return true;
  }

  @PluginSystem
  getSkillFromKey(skillKey: string): SkillConfig {
    return !this.allSkills.has(skillKey) ? null : this.allSkills.get(skillKey);
  }

  @PluginSystem
  getOnlineSkillFromKey(skillKey: string): OnlineSkill {
    if (!this.onlineSkills.has(skillKey)) return null;
    const onlineSkill = this.onlineSkills.get(skillKey);
    if (onlineSkill.thread_status !== "ONLINE") return null;
    return onlineSkill;
  }

  @PluginSystem
  getOnlineSkillFromType(skillType: string): string[] {
    if (!this.onlineSkillTypesMap.has(skillType)) return null;
    const checkSkills = this.onlineSkillTypesMap.get(skillType);
    return !checkSkills.length ? null : checkSkills;
  }

  @PluginSystem
  private async pingGolemServer(
    serverId: string,
    socketBroadcast: boolean = false
  ) {
    const exchange = serverId.length ? "golem" : "golem_broadcast";
    return await this.publishCommand(
      exchange,
      serverId,
      "system_info",
      { command: "system_info" },
      { socket_broadcast: socketBroadcast }
    );
  }

  @PluginSystem
  async afterConfig() {
    await this.pingGolemServer("");
  }
}

export default SpellbookService;
