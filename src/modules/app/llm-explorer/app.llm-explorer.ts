import { PluginSystem } from "../../../plugin";
import chalk from "chalk";
import {
  LoggerServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
  SocketMessage,
  SpellbookServiceInterface,
} from "types";

export class AppLlmExplorer {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private modelService: SequelizeServiceInterface;
  private spellbookService: SpellbookServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.modelService = services["SequelizeService"];
    this.spellbookService = services["SpellbookService"];
  }

  @PluginSystem
  async handleStopGeneration(message: SocketMessage): Promise<boolean> {
    this.logger.info("stop generation requested", { icon: "🛑️" });
    return await this.spellbookService.publishCommand(
      "golem_broadcast",
      "",
      "stop_generation",
      {
        command: "stop_generation",
        socket_id: message.socket_id,
        routing_key: message.payload.routing_key,
      },
      { socket_id: message.socket_id }
    );
  }

  @PluginSystem
  async deleteChat(args, info) {
    const llmChat = this.modelService.create("LlmExplorerChat");
    const loadedChat = await llmChat.findOne({
      where: { id: args.id, user_id: args.user_id },
    });

    if (!loadedChat) {
      this.logger.error(
        `user ${args.user_id} attempting to delete llm-explorer record of another user ${loadedChat.user_id}`
      );
      return { id: 0 };
    }

    llmChat.destroy({ where: { id: args.id } });
    return { id: args.id };
  }

  @PluginSystem
  async updateChat(args, info) {
    this.logger.info(`updating multi-shot record`, { icon: "🎯" });
    const llmChat = this.modelService.create("LlmExplorerChat");
    const examples = JSON.parse(args.examples);
    for (let i = 0; i < examples.length; i++) {
      examples[i].exclude =
        Array.isArray(examples[i].exclude) && examples[i].exclude.length
          ? "true"
          : "false";
    }

    const modelData = {
      examples: JSON.stringify(examples),
      system_message: args.system_message,
      top_p: args.top_p,
      top_k: args.top_k,
      min_p: args.min_p,
      seed: args.seed,
      mirostat: args.mirostat,
      mirostat_eta: args.mirostat_eta,
      mirostat_tau: args.mirostat_tau,
      temperature: args.temperature,
      user_id: args.user_id,
    };

    const loadedChat = await llmChat.findOne({
      where: { unique_key: args.unique_key, user_id: args.user_id },
    });
    if (!loadedChat || !loadedChat.id) {
      const newChat = await llmChat.create({
        examples: args.examples,
        system_message: args.system_message,
        top_p: args.top_p,
        top_k: args.top_k,
        min_p: args.min_p,
        seed: args.seed,
        mirostat: args.mirostat,
        mirostat_eta: args.mirostat_eta,
        mirostat_tau: args.mirostat_tau,
        unique_key: args.unique_key,
        user_id: args.user_id,
        temperature: args.temperature,
      });
      return { id: newChat.id };
    } else {
      await loadedChat.update(modelData);
      return { id: loadedChat.id };
    }
  }
}

export default AppLlmExplorer;
