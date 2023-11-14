import {
  LoggerServiceInterface,
  ServicesConstructorInterface,
  SpellbookServiceInterface,
} from "types";
import { PluginSystem } from "../../../../plugin";
import { Request, Response } from "express";

interface ApiRequest {
  routing_key: string;
  request: Request;
  response: Response;
}

export class AccessSkillRoute {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private spellbookService: SpellbookServiceInterface;
  private requestIndex: Map<string, ApiRequest>;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.spellbookService = services["SpellbookService"];
    this.requestIndex = new Map();
  }

  @PluginSystem
  async handleSkillResponse(message): Promise<boolean> {
    const headers = message.properties.headers;
    const data = JSON.parse(message.content);

    const current = this.requestIndex.get(headers.request_id);
    if (headers.success == false) {
      current.response.status(200).send({
        success: false,
        errors: headers.errors,
        payload: {},
      });
      return true;
    }

    current.response.status(200).send({
      success: true,
      errors: [],
      payload: data,
    });
    this.requestIndex.delete(message.properties.headers.request_id);
  }

  @PluginSystem
  async executeSkill(req: Request, res: Response) {
    const { routing_key } = req.params;

    // check if the skill is online
    if (!this.spellbookService.getOnlineSkillFromKey(routing_key)) {
      res.status(200).send({
        success: false,
        errors: [`skill ${routing_key} is not online`],
        payload: {},
      });
      return;
    }

    this.logger.info(`api request to skill ${routing_key}`, { icon: "🌐" });
    this.requestIndex.set(req.id, {
      routing_key: routing_key,
      request: req,
      response: res,
    });

    if (req.body.stream && req.body.stream != false) {
      this.logger.warn("api streaming not supported atm!");
      req.body.stream = false;
    }
    await this.spellbookService.publishCommand(
      "golem_skill",
      routing_key,
      "api_request",
      req.body,
      {
        request_id: req.id,
        model_name: routing_key,
      }
    );
  }

  @PluginSystem
  async apiOnlineSkills(req: Request, res: Response) {
    this.logger.info(`/api/v1/skill/online: getting online skills`, {
      icon: "🌐",
    });
    const outputSkills = [];
    const onlineSkills = this.spellbookService.getOnlineSkills();
    onlineSkills.forEach((skill) => {
      outputSkills.push({
        label: skill.label,
        instances: skill.instances,
        routing_key: skill.routing_key,
      });
    });
    res.status(200).send(outputSkills);
  }
}

export default AccessSkillRoute;
