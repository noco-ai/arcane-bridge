import chalk from "chalk";
import {
  LogOptions,
  LogLevel,
  VaultServiceInterface,
  LoggerServiceInterface,
  LogConfiguration,
  EmptyCliOptions,
  ServicesConstructorInterface,
} from "types";
import { PluginSystem } from "../../../plugin";

export class LoggerService implements LoggerServiceInterface {
  private configs: Array<LogConfiguration>;
  private vaultService: VaultServiceInterface;

  constructor(
    cliParams: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.vaultService = services["VaultService"];
    this.configs = [
      {
        format: "${icon} [${date}] ${message} ${icon}",
        level: "info",
      },
    ];
  }

  @PluginSystem
  async loadConfigPaths(configKeys: string[] = []): Promise<void> {
    if (!configKeys.length) {
      return;
    }

    let configs = [];
    for (let i = 0; i < configKeys.length; i++) {
      const logConfig = await this.vaultService.getGroup(configKeys[i]);
      if (!logConfig || !logConfig.format || !logConfig.level) {
        //this.warn(`Invalid logger configuration found for ${configKeys[i]}`);
        continue;
      }
      configs.push(logConfig);
    }

    if (configs.length) {
      this.configs = configs;
    }
  }

  @PluginSystem
  private processTemplate(
    template: string,
    values: { [key: string]: string | number | boolean }
  ) {
    let result = template;
    for (const key in values) {
      const re = new RegExp("\\${" + key + "}", "g");
      result = result.replace(re, String(values[key]));
    }
    return result;
  }

  @PluginSystem
  private log(
    level: LogLevel,
    message: string,
    options: LogOptions = {},
    ...args: any[]
  ): void {
    // get the config for this module
    let useConfig: LogConfiguration = this.configs[0];
    if (
      options.config &&
      options.config >= 0 &&
      options.config < this.configs.length
    ) {
      useConfig = this.configs[options.config];
    }
    const logLevel = useConfig.level;
    const format = useConfig.format;

    if (
      LoggerService.logLevelMap[level] > LoggerService.logLevelMap[logLevel]
    ) {
      return;
    }

    if (!options) return;

    const icon = options.icon || "";
    const logLevelText = level.toUpperCase().padEnd(5, " ");
    const date = new Date().toISOString();
    const logMessage = this.processTemplate(format, {
      icon: icon,
      logLevelText: logLevelText,
      date: date,
      message: message,
    });
    let styledMessage = (options.color || chalk.white)(logMessage);

    if (options.style) {
      options.style.forEach((style) => {
        styledMessage = style(styledMessage);
      });
    }
    console.log(styledMessage, ...args);
  }

  @PluginSystem
  public error(
    message: string,
    options: LogOptions = {},
    ...args: any[]
  ): void {
    options = !options ? {} : options;
    this.log(
      "error",
      message,
      {
        ...options,
        color: options.color ? options.color : chalk.red,
        icon: options.icon ? options.icon : "\u{1F525}",
      },
      ...args
    );
  }

  @PluginSystem
  public warn(message: string, options: LogOptions = {}, ...args: any[]): void {
    options = !options ? {} : options;
    this.log(
      "warn",
      message,
      {
        ...options,
        color: options.color ? options.color : chalk.yellow,
        icon: options.icon ? options.icon : "\u{1F514}",
      },
      ...args
    );
  }

  @PluginSystem
  public info(message: string, options: LogOptions = {}, ...args: any[]): void {
    options = !options ? {} : options;
    this.log(
      "info",
      message,
      {
        ...options,
        icon: options.icon ? options.icon : "\u{1F535}",
      },
      ...args
    );
  }

  @PluginSystem
  public debug(
    message: string,
    options: LogOptions = {},
    ...args: any[]
  ): void {
    options = !options ? {} : options;
    this.log(
      "debug",
      message,
      {
        ...options,
        color: options.color ? options.color : chalk.cyan,
        icon: options.icon ? options.icon : "\u{1F41B}",
      },
      ...args
    );
  }

  private static logLevelMap: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  @PluginSystem
  start() {
    this.info(`started logger service`);
    return true;
  }
}

export default LoggerService;
