import {
  AmqpGolemMessage,
  LoggerServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
  SocketsServiceInterface,
  SpellbookServiceInterface,
  VaultServiceInterface,
} from "types";
import { PluginSystem } from "../../../../plugin";
import { Request, Response } from "express";

interface ApiRequest {
  routing_key: string;
  request: Request;
  response: Response;
  response_buffer: string;
  socket_id?: string;
}

export class ChatRoute {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private spellbookService: SpellbookServiceInterface;
  private modelService: SequelizeServiceInterface;
  private requestIndex: Map<string, ApiRequest>;
  private socketService: SocketsServiceInterface;
  private vault: VaultServiceInterface;
  private socketMap: Map<string, string>;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.spellbookService = services["SpellbookService"];
    this.socketService = services["SocketService"];
    this.modelService = services["SequelizeService"];
    this.vault = services["VaultService"];
    this.requestIndex = new Map();
    this.socketMap = new Map();
  }

  @PluginSystem
  async handleResponseFragment(message: AmqpGolemMessage): Promise<boolean> {
    const headers = message.properties.headers;
    if (!headers.socket_id || !message.content) return true;
    const fragment = message.content.toString();
    // @ts-ignore
    const current = this.requestIndex.get(headers.request_id);
    current.response_buffer += fragment;
    this.socketService.emit(
      headers.socket_id,
      "prompt_response_simple",
      fragment
    );
    return true;
  }

  @PluginSystem
  async handleChatResponse(message): Promise<boolean> {
    const headers = message.properties.headers;
    const current = this.requestIndex.get(headers.request_id);

    const data = headers.success ? JSON.parse(message.content) : {};
    if (current.response_buffer.length) {
      data.content = current.response_buffer;
    }

    if (data.content) data.content = data.content.trim();
    current.response.status(200).send({
      success: !headers.success ? false : true,
      errors: headers.errors,
      payload: data,
    });
    this.requestIndex.delete(message.properties.headers.request_id);
    if (headers.socket_id) this.socketMap.delete(headers.socket_id);
    return true;
  }

  @PluginSystem
  async chatHandler(req: Request, res: Response) {
    const { unique_key } = req.params;
    this.logger.info(`handling llm explorer chat api call for ${unique_key}`, {
      icon: "🎯",
    });

    const userId = await this.vault.validateAuthToken(
      req.headers.authorization,
      null,
      "llm_explorer_chat"
    );
    if (!userId) {
      res.status(200).send({
        success: false,
        errors: ["invalid auth token provided"],
        payload: {},
      });
      return;
    }

    const llmChat = this.modelService.create("LlmExplorerChat");
    const chatData = await llmChat.findOne({
      where: { unique_key: unique_key, user_id: userId },
    });

    if (!chatData) {
      res.status(200).send({
        success: false,
        errors: ["example set not found"],
        payload: {},
      });
      return;
    }

    const llmPayload = {
      temperature: chatData.temperature,
      top_k: chatData.top_k,
      top_p: chatData.top_p,
      min_p: chatData.min_p,
      seed: chatData.seed,
      mirostat: chatData.mirostat,
      mirostat_eta: chatData.mirostat_eta,
      mirostat_tau: chatData.mirostat_tau,
      max_new_tokens: req.body.max_new_tokens,
      messages: [],
      stream: false,
      debug: true,
    };

    const llmHeaders: any = {
      request_id: req.id,
      model_name: chatData.use_model,
    };

    // we want to stream response to a socket
    if (req.body.socket_id) {
      llmPayload.stream = true;
      llmHeaders.socket_id = req.body.socket_id;
      llmHeaders.stream_to_override = "llm_explorer_chat_fragment";
    }

    // build payload for llm
    const examples = JSON.parse(chatData.examples);
    llmPayload.messages.push({
      role: "system",
      content: chatData.system_message,
    });

    for (let i = 0; i < examples.length; i++) {
      if (examples[i].exclude === "true") continue;
      llmPayload.messages.push({ role: "user", content: examples[i].user });
      llmPayload.messages.push({
        role: "assistant",
        content: examples[i].assistant,
      });
    }
    llmPayload.messages.push({ role: "user", content: req.body.input });

    if (!this.spellbookService.getOnlineSkillFromKey(req.body.use_model)) {
      res.status(200).send({
        success: false,
        errors: [`skill ${unique_key} is not online`],
        payload: {},
      });
      return;
    }

    this.requestIndex.set(req.id, {
      routing_key: req.body.use_model,
      request: req,
      response: res,
      response_buffer: "",
      socket_id: req.body.socket_id ? req.body.socket_id : null,
    });
    if (req.body.socket_id) this.socketMap.set(req.body.socket_id, req.id);

    await this.spellbookService.publishCommand(
      "golem_skill",
      req.body.use_model,
      "llm_explorer_chat",
      llmPayload,
      llmHeaders
    );
  }
}

export default ChatRoute;
