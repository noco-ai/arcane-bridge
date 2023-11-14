import {
  LoggerServiceInterface,
  ModuleConfig,
  ProcessorInterface,
  ServicesConstructorInterface,
  SequelizeModelInterface,
} from "types";
import { PluginSystem } from "../../../plugin";

interface ExpressConfig extends ModuleConfig {
  sequelize_model: SequelizeModelInterface[];
}

class SequelizeProcessor implements ProcessorInterface {
  // process the config file for queues, exchanges, bindings, and consumers
  @PluginSystem
  async process(services: ServicesConstructorInterface, config: any) {
    // Get service and make sure server is online
    const logger: LoggerServiceInterface = services["LoggerService"];
    const sqlService = services["SequelizeService"];

    if (!sqlService.isOnline()) {
      logger.error(`sequelize server is not online!`);
      return;
    }

    // load exchanges, queues and consumers for all modules
    for (let moduleName in config) {
      const currentModule: ExpressConfig = config[moduleName];

      // setup models
      if (!currentModule.sequelize_model) {
        continue;
      }
      for (let i = 0; i < currentModule.sequelize_model.length; i++) {
        const model: SequelizeModelInterface = currentModule.sequelize_model[i];
        sqlService.addModel({
          class_file: model.class_file,
          factory_file: model.factory_file,
          name: model.name,
          module: currentModule.name,
        });
      }
    }
  }
}

export default SequelizeProcessor;
