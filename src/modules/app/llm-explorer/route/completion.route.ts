import {
  AmqpGolemMessage,
  LoggerServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
  SocketMessage,
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

export class CompletionRoute {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private spellbookService: SpellbookServiceInterface;
  private modelService: SequelizeServiceInterface;
  private requestIndex: Map<string, ApiRequest>;
  private socketService: SocketsServiceInterface;
  private socketMap: Map<string, string>;
  private vault: VaultServiceInterface;

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
  async handleCompletionResponse(message: AmqpGolemMessage): Promise<boolean> {
    const headers = message.properties.headers;
    // @ts-ignore
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

    // @ts-ignore
    this.requestIndex.delete(message.properties.headers.request_id);
    if (headers.socket_id) this.socketMap.delete(headers.socket_id);
    return true;
  }

  @PluginSystem
  async completionHandler(req: Request, res: Response) {
    // check if user is authorized
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

    const requestData = req.body;
    const llmHeaders: any = {
      request_id: req.id,
      model_name: requestData.use_model,
    };

    // we want to stream response to a socket
    requestData.stream = false;
    requestData.debug = true;
    requestData.messages = [];
    if (req.body.socket_id) {
      requestData.stream = true;
      llmHeaders.socket_id = req.body.socket_id;
      llmHeaders.stream_to_override = "llm_explorer_completion_fragment";
    }

    this.requestIndex.set(req.id, {
      routing_key: requestData.use_model,
      request: req,
      response: res,
      response_buffer: "",
      socket_id: req.body.socket_id ? req.body.socket_id : null,
    });
    if (req.body.socket_id) this.socketMap.set(req.body.socket_id, req.id);

    await this.spellbookService.publishCommand(
      "golem_skill",
      requestData.use_model,
      "llm_explorer_completion",
      requestData,
      llmHeaders
    );
  }
}

export default CompletionRoute;
