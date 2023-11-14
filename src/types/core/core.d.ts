export interface ServicesConstructorInterface {
  [serviceName: string]: any;
}

export interface ServiceInterface {
  start(cliOptions: any, services: ServicesConstructorInterface): void;
}

export interface ProcessorInterface {
  process(services: ServicesConstructorInterface, config: any): void;
}

export interface AppInterface {
  createPlugins(pluginName: string, instance: any): void;
}

export interface ModuleConfig {
  name: string;
}

export interface EmptyCliOptions {}
