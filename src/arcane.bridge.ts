import Ajv from "ajv";
import addFormats from "ajv-formats";
import lodash from "lodash";
import * as fs from "fs";
import * as path from "path";
import { program } from "commander";
import { PluginSystem, PluginMethod } from "./plugin";
import { ClassFactoryServiceInterface } from "types";

interface Configs {
  [key: string]: any;
}

class ArcaneBridge {
  private ajv: Ajv;
  private config: Object;
  private services: Object;
  private servicePrototype: Object;
  private pluginIndex: Object;
  private loadedPlugins: Object;
  private configProcessors: Object;

  constructor() {
    // configure Ajv
    this.ajv = new Ajv({
      strict: true,
      allowUnionTypes: true,
      useDefaults: true,
    });
    addFormats(this.ajv);

    // load plugins for this class
    this.services = {};
    this.configProcessors = {};
    let arcaneConfig = this.loadConfigs("arcane");
    this.loadPlugins(arcaneConfig);
    this.createPlugins("core/application/arcane.bridge", this);
  }

  sortPlugins(pluginObj: any): any {
    let sortedPluginObj: any = {};

    for (let key in pluginObj) {
      if (pluginObj.hasOwnProperty(key)) {
        let pluginArray = pluginObj[key];

        pluginArray.sort((a, b) => a.sort_order - b.sort_order);

        sortedPluginObj[key] = pluginArray;
      }
    }

    return sortedPluginObj;
  }

  loadPlugins(arcaneConfig: any) {
    let pluginIndex = {};
    this.loadedPlugins = {};

    for (let name in arcaneConfig) {
      // no plugins defined in this JSON file
      if (!arcaneConfig[name].plugin) {
        continue;
      }

      // create an index object of the plugins
      for (let i = 0; i < arcaneConfig[name].plugin.length; i++) {
        const plugin = arcaneConfig[name].plugin[i];
        plugin.module = name;
        const pluginPath = `${plugin.target.module}/${plugin.target.class_file}`;
        if (!pluginIndex[pluginPath]) {
          pluginIndex[pluginPath] = [];
        }
        pluginIndex[pluginPath].push(plugin);
      }
    }

    // sort plugins
    this.pluginIndex = this.sortPlugins(pluginIndex);
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

  @PluginSystem
  private loadConfigs(file: string): Configs {
    const glob = require("glob");
    const configs: Configs = {};
    const baseDir = "src/modules/";
    const configFiles: string[] = glob.sync(`${baseDir}*/*/${file}.json`);
    const schemaFiles: string[] = glob.sync(`${baseDir}*/*/${file}.schema`);

    // Combine all schema files into a single object
    let processors = {};
    let combinedSchema = {};
    let assignedProcessors = {};
    for (const schemaFile of schemaFiles) {
      const configName: string = path.dirname(schemaFile).replace(baseDir, "");
      const schemaContent: string = fs.readFileSync(schemaFile, "utf-8");
      let schema = JSON.parse(schemaContent);

      if (typeof schema["processor"] !== "string") {
        console.log(`no configuration processor defined for ${schemaFile}`);
        continue;
      }

      // load the config file processors into a index
      processors[configName] = schema.processor;
      assignedProcessors[configName] = false;

      // remove the processor from the object
      delete schema.processor;

      // merge with other schema objects
      combinedSchema = lodash.merge(combinedSchema, schema);
    }

    // Validate and load config files
    let adjList = new Map();
    configFiles.forEach((configFile: string) => {
      const content: string = fs.readFileSync(configFile, "utf-8");
      const configData: any = JSON.parse(content);
      const configName: string = path.dirname(configFile).replace(baseDir, "");

      if (!this.ajv.validate(combinedSchema, configData)) {
        console.error(
          `Invalid configuration in ${configFile}:`,
          this.ajv.errors
        );
      } else {
        // set config processor on module object
        if (processors[configName]) {
          if (typeof configData["config_processors"] === "undefined") {
            configData["config_processors"] = {};
          }
          assignedProcessors[configName] = true;
          configData["config_processors"][file] = processors[configName];
        }

        adjList.set(configName, []);
        if (configData["dependencies"]) {
          adjList.set(configName, configData["dependencies"]);
        }
        configs[configName] = configData;
      }
    });

    // account for processors in modules that do not have a matching config file
    for (let processor in assignedProcessors) {
      if (assignedProcessors[processor] === false) {
        if (!this.configProcessors[file]) {
          this.configProcessors[file] = {};
        }

        this.configProcessors[file][processor] = processors[processor];
      }
    }

    // sort the configs by dependencies
    let sortedOrder = [];
    let visited: Set<string> = new Set();
    for (let name in configs) {
      if (!visited.has(name)) {
        this.moduleSort(name, visited, sortedOrder, adjList);
      }
    }

    // create the new sorted object to return
    let sortedConfigs = {};
    for (let i = 0; i < sortedOrder.length; i++) {
      sortedConfigs[sortedOrder[i]] = configs[sortedOrder[i]];
    }

    return sortedConfigs;
  }

  @PluginSystem
  private loadCliOptions(arcaneConfig) {
    for (let name in arcaneConfig) {
      // no CLI options found
      if (!arcaneConfig[name].cli_option) {
        continue;
      }

      // load all services that are defines
      arcaneConfig[name].cli_option.forEach((cliOption: any) => {
        if (cliOption.required) {
          program.requiredOption(
            cliOption.option,
            cliOption.description,
            cliOption.default
          );
        } else {
          program.option(
            cliOption.option,
            cliOption.description,
            cliOption.default
          );
        }
      });
    }

    // parse options and return them
    program.parse();
    return program.opts();
  }

  private async sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  @PluginSystem
  private async startService(
    moduleName: string,
    service: any,
    cliOptions: any,
    services: any
  ): Promise<void> {
    try {
      const classPath = path.resolve(
        `dist/modules/${moduleName}/${service.class_file}.js`
      );
      const ServiceClass = require(classPath).default;
      this.servicePrototype[service.class_name] = ServiceClass;
      if (typeof ServiceClass !== "function") {
        console.error(
          `The class ${service.class_name} was not found in ${service.class_file}.`
        );
        return;
      }

      // custom logging config for this service
      let serviceInstance = null;
      let serviceStarted = false;
      if (
        service.log_config &&
        typeof this.servicePrototype["LoggerService"] != "undefined"
      ) {
        const loggerInstance = new this.servicePrototype["LoggerService"](
          {},
          services
        );
        await loggerInstance.loadConfigPaths(service.log_config);

        // build new services object w/ custom logger
        let newServices = new Object();
        for (let serviceName in services) {
          newServices[serviceName] = services[serviceName];
        }
        newServices["LoggerService"] = loggerInstance;

        // create an instance of the service class
        serviceInstance = new ServiceClass(cliOptions, newServices);
        this.createPlugins(
          `${moduleName}/${service.class_file}`,
          serviceInstance
        );
        if (typeof serviceInstance.start !== "function") {
          console.error(
            `The class ${service.class_name} does not implement the required 'start' method.`
          );
          return;
        }

        serviceStarted = await serviceInstance.start(cliOptions, newServices);
      } else {
        // no custom logger configuration
        serviceInstance = new ServiceClass(cliOptions, services);
        this.createPlugins(
          `${moduleName}/${service.class_file}`,
          serviceInstance
        );
        if (typeof serviceInstance.start !== "function") {
          console.error(
            `The class ${service.class_name} does not implement the required 'start' method.`
          );
          return;
        }
        serviceStarted = await serviceInstance.start(cliOptions, services);
      }

      // if any of the services fail to start, exit the program
      if (!serviceStarted) {
        console.error(
          `💣 service class ${service.class_name} did not start correctly, exiting program 💣`
        );
        await this.sleep(5000);
        process.exit();
      }

      return serviceInstance;
    } catch (error) {
      console.error(`Failed to load service: ${service.class_name}`, error);
    }
  }

  @PluginSystem
  private async startServices(cliOptions, arcaneConfig): Promise<boolean> {
    this.services = { ArcaneBridge: this };
    this.servicePrototype = {};
    const servicesFileIndex: Map<string, Function> = new Map();

    for (let name in arcaneConfig) {
      if (!arcaneConfig[name].service) {
        continue;
      }
      // load all services that are defined
      const services = arcaneConfig[name].service;
      for (let i = 0; i < services.length; i++) {
        const service = services[i];
        if (typeof this.services[service.class_name] !== "undefined") {
          console.log(`service already defined ${service.class_name}`);
          continue;
        }

        // only send CLI options that are defined in each module to protect secrets
        var privateCliOptions = {};
        if (arcaneConfig[name]["cli_option"]) {
          for (let i = 0; i < arcaneConfig[name]["cli_option"].length; i++) {
            let currentOption = arcaneConfig[name]["cli_option"][i];
            privateCliOptions[currentOption.opts_key] =
              cliOptions[currentOption.opts_key];
          }
        }

        const startService: any = await this.startService(
          name,
          service,
          privateCliOptions,
          this.services
        );
        this.services[service.class_name] = startService;
        servicesFileIndex.set(`${name}/${service.class_file}`, startService);
      }
    }

    const classFactory: ClassFactoryServiceInterface =
      this.services["ClassFactoryService"];
    classFactory.setServices(this.services, servicesFileIndex);
    console.log(`🔧 services started 🔧`);
    return true;
  }

  @PluginSystem
  private linkPlugin(
    pluginInstance: any,
    classInstance: any,
    plugin: any,
    targetFile: string
  ) {
    // check to plugin function
    if (typeof pluginInstance[plugin.function] !== "function") {
      console.error(
        `The class ${plugin.class_file} does not implement the required '${plugin.function}' method.`
      );
      return false;
    }

    // check to target function
    if (typeof classInstance[plugin.target.function] !== "function") {
      console.error(
        `The class ${targetFile} does not implement the required '${plugin.target.function}' method.`
      );
      return false;
    }

    // link the plugin class to the target class
    if (typeof classInstance[plugin.target.function].use !== "function") {
      console.error(
        `${plugin.target.function} function in ${targetFile}  does not have the @PluginSystem decorator.`
      );
      return false;
    }

    (classInstance[plugin.target.function] as PluginMethod).use((...args) => {
      return pluginInstance[plugin.function](...args);
    });
    return true;
  }

  @PluginSystem
  createPlugins(targetFile: string, classInstance: any) {
    // check if any plugins are defined for the file
    if (!this.pluginIndex[targetFile]) {
      return;
    }

    // loop through the plugins and create/link them to target classes and functions
    const plugins = this.pluginIndex[targetFile];
    for (let i = 0; i < plugins.length; i++) {
      const plugin = plugins[i];

      if (`${plugin.module}/${plugin.class_file}` === targetFile) {
        console.error(
          `skipping plugin ${plugin.module}/${plugin.class_file} circular dependency found`
        );
        continue;
      }

      // check if plugin class is already loaded
      if (this.loadedPlugins[`${plugin.module}/${plugin.class_file}`]) {
        this.linkPlugin(
          this.loadedPlugins[`${plugin.module}/${plugin.class_file}`],
          classInstance,
          plugin,
          targetFile
        );
        continue;
      }

      // resolve the plugin class and require it
      let PluginClass = null;
      const classPath = path.resolve(
        `dist/modules/${plugin.module}/${plugin.class_file}.js`
      );

      try {
        PluginClass = require(classPath).default;
      } catch (ex) {
        console.log(
          `class ${plugin.class_file} not found in ${plugin.module}.`
        );
        continue;
      }

      // create instance of the plugin class
      const pluginInstance = new PluginClass(this.services);
      this.loadedPlugins[`${plugin.module}/${plugin.class_file}`] =
        pluginInstance;

      this.linkPlugin(pluginInstance, classInstance, plugin, targetFile);
    }
  }

  @PluginSystem
  private async loadConfigProcessor(
    moduleName: string,
    processor: string,
    configData: any
  ): Promise<void> {
    try {
      const classPath = path.resolve(
        `dist/modules/${moduleName}/${processor}.js`
      );
      const ProcessorClass = require(classPath).default;
      if (typeof ProcessorClass !== "function") {
        console.error(`No class was found in ${moduleName}/${processor}.js`);
        return;
      }

      const processorInstance = new ProcessorClass();
      this.createPlugins(`${moduleName}/${processor}`, processorInstance);
      if (typeof processorInstance.process !== "function") {
        console.error(
          `The class in ${moduleName}/${processor}.js does not implement the required 'process' method.`
        );
        return;
      }

      await processorInstance.process(this.services, configData);
      return processorInstance;
    } catch (error) {
      console.error(
        `Failed to load processor: ${moduleName}/${processor}`,
        error
      );
    }
  }

  @PluginSystem
  private async processConfig(configData, schemaName: string) {
    // run processors w/ not matching module
    if (this.configProcessors[schemaName]) {
      for (let processorModule in this.configProcessors[schemaName]) {
        const processorFile =
          this.configProcessors[schemaName][processorModule];
        await this.loadConfigProcessor(
          processorModule,
          processorFile,
          configData
        );
      }
    }

    // processors attaches to a configuration section
    for (let name in configData) {
      if (!configData[name].config_processors) {
        continue;
      }

      await this.loadConfigProcessor(
        name,
        configData[name].config_processors[schemaName],
        configData
      );
    }
  }

  // loads any configuration files defined in any modules arcane.json file
  @PluginSystem
  private loadAdditionalConfigs(arcaneConfig: any) {
    // load all config files that are defined in each module
    for (let name in arcaneConfig) {
      // check if any config filea re defined in the json config
      if (!arcaneConfig[name].config_file) {
        continue;
      }

      // load all config files defined in the config_file key
      const configFiles = arcaneConfig[name].config_file;
      for (let i = 0; i < configFiles.length; i++) {
        this.config[configFiles[i].name] = this.loadConfigs(
          configFiles[i].name
        );
      }
    }
  }

  private async afterProcessConfig() {
    for (let service in this.services) {
      let checkService = this.services[service];
      if (!checkService || typeof checkService.afterConfig !== "function") {
        continue;
      }

      await checkService.afterConfig();
    }
  }

  @PluginSystem
  async load() {
    // init config object
    this.config = {};

    // load core config files
    let arcaneConfig = this.loadConfigs("arcane");

    // loads any configuration files defined in any modules arcane.json file
    this.loadAdditionalConfigs(arcaneConfig);

    // parse CLI params defined in arcane.json
    const cliOptions = this.loadCliOptions(arcaneConfig);

    // start services
    await this.startServices(cliOptions, arcaneConfig);

    // run configuration processors defined for arcane.json
    await this.processConfig(arcaneConfig, "arcane");

    // process other config files
    for (let configKey in this.config) {
      await this.processConfig(this.config[configKey], configKey);
    }

    // run postProcess functions on services
    await this.afterProcessConfig();

    // add modules key to global configuration object
    this.config["modules"] = arcaneConfig;

    // application started!
    console.log(`🚀 arcane bridge started 🚀`);
  }
}

const app = new ArcaneBridge();
app.load();
