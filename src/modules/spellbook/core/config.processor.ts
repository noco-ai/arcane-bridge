import * as fs from "fs/promises";
import * as path from "path";
import {
  ChatMessage,
  ClassFactoryServiceInterface,
  MenuItem,
  ProcessorInterface,
  PromptProcessor,
  PromptProcessors,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
  SpellbookConfig,
  VaultServiceInterface,
} from "types";

class SpellbookConfigProcessor implements ProcessorInterface {
  // loads all prompts from the prompt folder for each spellbook module.
  async loadPrompts(
    module: string
  ): Promise<Map<string, string | ChatMessage[]>> {
    const prompts: Map<string, string | ChatMessage[]> = new Map();
    const directory = `src/modules/${module}/prompt`;
    try {
      // Check if directory exists
      await fs.access(directory);

      // Read all files in the directory
      const files = await fs.readdir(directory);

      // Read each file and store its content
      for (const file of files) {
        const filePath = path.join(directory, file);
        const fileExtension = path.extname(file);
        const fileNameWithoutExt = path.basename(file, fileExtension);
        const data = await fs.readFile(filePath, "utf8");

        if (fileExtension === ".txt") {
          prompts.set(fileNameWithoutExt, data);
        } else if (fileExtension === ".json") {
          try {
            prompts.set(fileNameWithoutExt, JSON.parse(data));
          } catch (error) {
            throw new Error(`invalid json in file ${file}: ${error.message}`);
          }
        } else {
          throw new Error(`unsupported file extension in file ${file}`);
        }
      }
    } catch (err) {}
    return prompts;
  }

  // A recursive helper function to perform topological sort
  private moduleSort(
    node: string,
    visited: Set<string>,
    stack: string[],
    adjList: Map<string, string[]>
  ) {
    visited.add(node);

    let neighbors = adjList.get(node);
    if (neighbors) {
      for (let neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          this.moduleSort(neighbor, visited, stack, adjList);
        }
      }
    }
    stack.push(node);
  }

  private sortConfigs(config) {
    let adjList = new Map();
    for (let module in config) {
      const configData = config[module];
      adjList.set(module, []);
      if (configData["dependencies"]) {
        adjList.set(module, configData["dependencies"]);
      }
    }

    let sortedOrder = [];
    let visited: Set<string> = new Set();
    for (let name in config) {
      if (!visited.has(name)) {
        this.moduleSort(name, visited, sortedOrder, adjList);
      }
    }

    // create the new sorted object to return
    let sortedConfigs = {};
    for (let i = 0; i < sortedOrder.length; i++) {
      sortedConfigs[sortedOrder[i]] = config[sortedOrder[i]];
    }
    return sortedConfigs;
  }

  async process(services: ServicesConstructorInterface, config: any) {
    let menuItems = [];
    let menuGroups = {};
    let menuItemMap = {};
    const modulePrompts = new Map<
      string,
      Map<string, string | ChatMessage[]>
    >();
    let chatAbilities = [];
    let promptProcessors: PromptProcessors = {
      preprocessor: [],
      postprocessor: [],
    };
    let spellData: SpellbookConfig[] = [];
    const classFactory: ClassFactoryServiceInterface =
      services["ClassFactoryService"];
    const modelService: SequelizeServiceInterface =
      services["SequelizeService"];
    const vaultService: VaultServiceInterface = services["VaultService"];

    config = this.sortConfigs(config);
    const numEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

    for (let module in config) {
      const prompts = await this.loadPrompts(config[module].module);
      modulePrompts.set(config[module].module, prompts);
      let currentModule = config[module];
      if (!currentModule.enabled) continue;
      let html = "";

      // check the db for the module status
      const spellbookModel = modelService.create("SpellbookModule");
      const findModule = await spellbookModel.findOne({
        where: {
          unique_key: currentModule.unique_key,
        },
      });
      if (!findModule) {
        const newModuleModel = modelService.create("SpellbookModule");
        const currentStatus = currentModule.can_remove
          ? "available"
          : "installed";
        await newModuleModel.create({
          unique_key: currentModule.unique_key,
          current_version: currentModule.version,
          status: currentStatus,
        });
        currentModule.is_installed =
          currentStatus == "available" ? false : true;
      } else {
        // compare versions
        currentModule.is_installed =
          findModule.dataValues.status == "available" ? false : true;
      }

      // load info on the spell from file system
      try {
        const baseUrl = vaultService.getBaseUrl();
        html = await fs.readFile(
          `src/modules/${currentModule.module}/asset/spellcard.html`,
          "utf8"
        );
        html = html.replace(/{{base_url}}/g, baseUrl);
      } catch (ex) {}

      const skillDependencies = !Array.isArray(currentModule.skill_dependencies)
        ? []
        : currentModule.skill_dependencies;

      // load conversation skills
      if (currentModule.chat_ability) {
        const skills = currentModule.chat_ability;
        for (let i = 0; i < skills.length; i++) {
          const currentSkill = skills[i];
          if (currentModule.shortcut) {
            currentSkill.shortcut =
              i == 0
                ? currentModule.shortcut
                : `${currentModule.shortcut}${numEmojis[i]}`;
          }

          currentSkill.unique_key = `${currentModule.unique_key}_${i}`;
          currentSkill.module_key = currentModule.unique_key;
          if (!currentSkill.skill_dependencies && skillDependencies.length) {
            currentSkill.skill_dependencies = skillDependencies;
          }
          chatAbilities.push(currentSkill);
        }
      }

      spellData.push({
        visible: currentModule.visible,
        label: currentModule.label,
        spell_label: currentModule.spell_label,
        module: currentModule.module,
        description: currentModule.description,
        icon: currentModule.icon,
        card: html,
        configuration: currentModule.configuration,
        unique_key: currentModule.unique_key,
        skill_dependencies: skillDependencies,
        type: currentModule.chat_ability ? "chat_ability" : "application",
        is_installed: currentModule.is_installed,
        can_remove: currentModule.can_remove,
        chat_ability: currentModule.chat_ability
          ? JSON.parse(JSON.stringify(currentModule.chat_ability))
          : [],
        skill_status: [],
      });

      // create the class instance for the chat abilities
      if (currentModule.chat_ability) {
        const skills = currentModule.chat_ability;
        for (let i = 0; i < skills.length; i++) {
          skills[i].class_instance = classFactory.create(
            currentModule.module,
            skills[i].class_file
          );
        }
      }

      // create the class instance for the chat abilities
      if (currentModule.prompt_processor) {
        const processors: PromptProcessor[] = currentModule.prompt_processor;
        for (let i = 0; i < processors.length; i++) {
          processors[i].class_instance = classFactory.create(
            currentModule.module,
            processors[i].class_file
          );
          promptProcessors[processors[i].type].push(processors[i]);
        }
      }

      if (!currentModule.menu_group) {
        continue;
      }

      for (const group of currentModule.menu_group) {
        if (!menuGroups[group.key]) {
          menuGroups[group.key] = {
            label: group.label,
            spell_label: group.spell_label,
            items: [],
            sort_order: group.sort_order,
            item_module: currentModule.unique_key,
          };
        }
      }
    }

    for (let module in config) {
      const currentModule = config[module];
      if (!currentModule.menu_item) {
        continue;
      }

      for (const item of currentModule.menu_item) {
        // not a valid group
        if (!menuGroups[item.group] || item.enabled == false) {
          continue;
        }

        const menuItem: MenuItem = {
          label: item.label,
          spell_label: item.spell_label,
          icon: item.icon,
          items: null,
          routerLink: item.route,
          sort_order: item.sort_order,
          admin_only: item.admin_only,
          settings_link: module,
          item_module: currentModule.unique_key,
          style: "",
        };

        if (item.key) {
          menuItemMap[item.key] = menuItem;
        }

        // if the item has a parent, add it to the parent's items
        if (item.parent) {
          if (menuItemMap[item.parent]) {
            if (!menuItemMap[item.parent].items) {
              menuItemMap[item.parent].items = [];
            }
            menuItemMap[item.parent].items.push(menuItem);
          } else {
            console.warn(
              `parent key '${item.parent}' not found for menu item '${item.key}'`
            );
          }
        } else {
          // add the menu item to its group
          if (menuGroups[item.group]) {
            menuGroups[item.group].items.push(menuItem);
          }
        }
      }
    }

    // sort the menu items
    const sortedGroups = Object.values(menuGroups).sort(
      (a, b) => a["sort_order"] - b["sort_order"]
    );
    for (const group of sortedGroups) {
      group["items"] = group["items"].sort(
        (a, b) => a.sort_order - b.sort_order
      );
      if (!group["items"].length) continue;
      menuItems.push(group);
    }

    // set base menu in service
    const spellbookService = services["SpellbookService"];
    spellbookService.setMenu(menuItems);
    spellbookService.setPrompts(modulePrompts);
    spellbookService.setChatAbilities(chatAbilities);
    spellbookService.setSpellDetails(spellData);
    spellbookService.setPromptProcessors(promptProcessors);
  }
}

export default SpellbookConfigProcessor;
