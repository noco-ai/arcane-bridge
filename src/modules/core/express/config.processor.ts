import {
  ClassFactoryServiceInterface,
  ExpressRoute,
  LoggerServiceInterface,
  ModuleConfig,
  ProcessorInterface,
  ServicesConstructorInterface,
} from "types";
import { PluginSystem } from "../../../plugin";

interface ExpressConfig extends ModuleConfig {
  express_route: ExpressRoute[];
}

class ExpressProcessor implements ProcessorInterface {
  // process the config file for express routes
  @PluginSystem
  async process(services: ServicesConstructorInterface, config: ExpressConfig) {
    const expressService = services["ExpressService"];
    const classFactoryService: ClassFactoryServiceInterface =
      services["ClassFactoryService"];
    const logger: LoggerServiceInterface = services["LoggerService"];
    const expressInstance = expressService.getExpress();

    for (let moduleName in config) {
      const currentModule: ExpressConfig = config[moduleName];
      if (!currentModule.express_route) {
        continue;
      }

      for (let i = 0; i < currentModule.express_route.length; i++) {
        const route: ExpressRoute = currentModule.express_route[i];
        const routeClass = classFactoryService.create(
          currentModule.name,
          route.route_file
        );

        if (!routeClass) {
          logger.warn(
            `could not create instance of ${currentModule.name}/${route.route_file}`
          );
          continue;
        }

        // make sure the function is defined
        const routeFunction = routeClass[route.route_function];
        if (typeof routeFunction !== "function") {
          logger.warn(
            `function ${route.route_function} not defined in ${currentModule.name}/${route.route_file}`
          );
          continue;
        }

        logger.info(
          `registering express route ${route.route}, type: ${route.request_type}`,
          {
            icon: "\u{1F310}",
          }
        );

        if (route.request_type == "get") {
          expressInstance.use(route.route, routeFunction.bind(routeClass));
        } else {
          expressInstance.post(route.route, routeFunction.bind(routeClass));
        }
      }
    }
  }
}

export default ExpressProcessor;
