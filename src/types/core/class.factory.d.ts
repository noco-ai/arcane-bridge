import { ServicesConstructorInterface } from "./core";

export interface ClassFactoryServiceInterface {
  create(module: string, className: string): Function | undefined;

  start(
    cliOptions: any,
    services: ServicesConstructorInterface
  ): Promise<boolean>;

  setServices(
    services: ServicesConstructorInterface,
    servicesFileIndex: Map<string, Function>
  ): void;
}
