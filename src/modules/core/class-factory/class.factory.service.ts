import * as path from "path";
import {
  ClassFactoryServiceInterface,
  EmptyCliOptions,
  LoggerServiceInterface,
  ServicesConstructorInterface,
} from "types";
import { PluginSystem } from "../../../plugin";

export class ClassFactoryService implements ClassFactoryServiceInterface {
  private loadedClasses: Map<string, Function>;
  private services: ServicesConstructorInterface;
  private servicesFileIndex: Map<string, Function>;
  private logger: LoggerServiceInterface;
  private app: any;

  constructor(
    cliOptions: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.services = null;
    this.loadedClasses = new Map();
    this.app = services["ArcaneBridge"];
    this.logger = services["LoggerService"];
  }

  @PluginSystem
  create(module: string, className: string): Function {
    if (!module || !className) {
      this.logger.error(`invalid module or class name given to class factory`);
      return null;
    }

    // class already loaded
    if (this.loadedClasses.has(`${module}/${className}`)) {
      return this.loadedClasses.get(`${module}/${className}`);
    }

    // trying to load a service
    if (this.servicesFileIndex.has(`${module}/${className}`)) {
      return this.servicesFileIndex.get(`${module}/${className}`);
    }

    let newClass = null;
    try {
      const classPath: string = path.resolve(
        `dist/modules/${module}/${className}.js`
      );
      newClass = require(classPath).default;
    } catch (ex) {
      this.logger.error(`could not load module`, null, [ex]);
    }

    if (typeof newClass !== "function") {
      this.logger.error(`the class was not found in ${className}.`);
      console.log(typeof newClass);
      console.log(newClass);
      return null;
    }

    this.logger.info(`class ${module}/${className} created`, {
      icon: "🏭",
    });

    // create the class and return its instance
    const classInstance = new newClass(this.services);

    // load plugins
    this.app.createPlugins(`${module}/${className}`, classInstance);

    this.loadedClasses.set(`${module}/${className}`, classInstance);
    return classInstance;
  }

  @PluginSystem
  async start(
    cliOptions: EmptyCliOptions,
    services: ServicesConstructorInterface
  ): Promise<boolean> {
    this.services = services;
    this.logger.info(`class factory started`, { icon: "🏭" });
    return true;
  }

  @PluginSystem
  setServices(
    services: ServicesConstructorInterface,
    servicesFileIndex: Map<string, Function>
  ) {
    this.services = services;
    this.servicesFileIndex = servicesFileIndex;
  }
}

export default ClassFactoryService;
