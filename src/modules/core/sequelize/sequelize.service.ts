import { Sequelize } from "sequelize";
import { PluginSystem } from "../../../plugin";
import * as path from "path";
import {
  LoggerServiceInterface,
  SequelizeModelInterface,
  VaultServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
} from "types";

interface SequelizeCliOptions {
  createSchema: boolean;
}

export class SequelizeService implements SequelizeServiceInterface {
  private logger: LoggerServiceInterface;
  private vault: VaultServiceInterface;
  private sequelize: Sequelize;
  private isServerOnline: boolean;
  private models: SequelizeModelInterface[];
  private modelsIndex: Map<string, SequelizeModelInterface>;
  private factoryIndex: Map<string, Function>;
  private syncSchema: boolean;

  constructor(
    cliParams: SequelizeCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.logger = services["LoggerService"];
    this.vault = services["VaultService"];
    this.isServerOnline = false;
    this.models = [];
    this.modelsIndex = new Map();
    this.factoryIndex = new Map();
    this.syncSchema = cliParams.createSchema;
  }

  @PluginSystem
  async start(): Promise<boolean> {
    if (this.isOnline()) return true;
    return new Promise(async (resolve, reject) => {
      // get credentials from vault for amqp
      const keys = await this.vault.getGroup("core/sequelize");
      const requiredKeys = [
        "dialect",
        "host",
        "port",
        "database",
        "username",
        "password",
      ];

      if (!keys || !requiredKeys.every((key) => keys.hasOwnProperty(key))) {
        this.logger.error(
          `could not start sequelize service, invalid credentials stored in vault.`
        );
        return false;
      }

      keys.logging = false;
      keys.define = { charset: "utf8mb4", collate: "utf8mb4_unicode_ci" };
      const sequelize = new Sequelize(keys);
      sequelize
        .authenticate()
        .then(() => {
          this.logger.info(` connected to ${keys.dialect}://${keys.host}`, {
            icon: "\u{1F5C3}",
          });
          this.isServerOnline = true;
          this.sequelize = sequelize;
          resolve(true);
        })
        .catch((err) => {
          this.logger.error(
            `unable to connect to the database ${keys.database} on ${keys.host}`,
            err
          );
          resolve(false);
        });
    });
  }

  @PluginSystem
  isOnline(): boolean {
    return this.isServerOnline;
  }

  @PluginSystem
  async addModel(model: SequelizeModelInterface): Promise<boolean> {
    if (!this.isOnline()) return false;
    this.models.push(model);
    this.modelsIndex.set(model.name, model);

    let factory = null;
    try {
      const factoryPath = path.resolve(
        `dist/modules/${model.module}/${model.factory_file}.js`
      );

      // load the factory
      factory = require(factoryPath).default;
    } catch (ex) {
      this.logger.error(
        `could not find model ${model.module}/${model.factory_file}`
      );
      return false;
    }

    if (typeof factory !== "function") {
      this.logger.error(
        `the model factory was not found in ${model.factory_file}.`
      );
      return false;
    }
    this.factoryIndex.set(model.name, factory);

    // create the database schema
    if (this.syncSchema) {
      this.logger.info(` creating schema for ${model.name}`, {
        icon: "💾",
      });
      const modelInstance = this.create(model.name);
      // SETTING THIS TO TRUE WILL DELETE ALL DATA IN THE DB!!!!
      await modelInstance.sync({ force: false });
    }
    return true;
  }

  @PluginSystem
  create(modelName: string) {
    if (!modelName) return null;
    if (!this.factoryIndex.has(modelName)) return null;
    const factory = this.factoryIndex.get(modelName);
    return factory(this.sequelize);
  }
}

export default SequelizeService;
