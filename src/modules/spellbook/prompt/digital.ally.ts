import def from "ajv/dist/vocabularies/discriminator";
import emojiRegex from "emoji-regex";
import {
  EmbeddingInfo,
  LoadedEmbeddings,
  LoggerServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
  SpellbookServiceInterface,
  UserPermissions,
} from "types";

export class SpelbookDigitalAlly {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private spellbookService: SpellbookServiceInterface;
  private modelService: SequelizeServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.spellbookService = services["SpellbookService"];
    this.modelService = services["SequelizeService"];
  }

  async deleteDigitalAlly(args: any, options: any) {
    const ally = this.modelService.create("DigitalAlly");
    const loadedChat = await ally.findOne({
      where: { id: args.id },
    });

    if (args.id && (!loadedChat || loadedChat.user_id != args.user_id)) {
      this.logger.error(`invalid update of digital ally`);
      return;
    }

    this.logger.info(`deleting digital ally ${args.id}`);
    const deleteAlly = this.modelService.create("DigitalAlly");
    deleteAlly.destroy({ where: { id: args.id } });
    return { id: loadedChat.id };
  }

  async updateDigitalAlly(args: any, options: any) {

    if (!args.id) {
      const ally = this.modelService.create("DigitalAlly");
      const newAlly = await ally.create(args);
      return { id: newAlly.id };
    }

    const ally = this.modelService.create("DigitalAlly");
    const loadedChat = await ally.findOne({
      where: { id: args.id },
    });

    if (args.id && (!loadedChat || loadedChat.user_id != args.user_id)) {
      this.logger.error(`invalid update of digital ally`);
      return;
    }

    if (!loadedChat || !loadedChat.id) {
      const newChat = await ally.create(args);
      return { id: newChat.id };
    } else {
      await loadedChat.update(args);
      return { id: loadedChat.id };
    }
  }
}

export default SpelbookDigitalAlly;
