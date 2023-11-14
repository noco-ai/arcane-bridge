import ChatAbilityBase from "../../spellbook/prompt/chat.ability.base";
import {
  AbilityResponseHelperInterface,
  AmqpGolemMessage,
  AsyncJob,
  ChatAbilityInterface,
  LoggerServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
  SocketMessage,
  SpellbookServiceInterface,
} from "types";

interface CodingJob extends AsyncJob {
  skill_data: any;
  function_definition: any;
}

class DynamicFunctionSkill
  extends ChatAbilityBase
  implements ChatAbilityInterface
{
  private spellbookService: SpellbookServiceInterface;
  private responseClass: AbilityResponseHelperInterface;
  private modelService: SequelizeServiceInterface;
  private jobsBuffer: Map<string, CodingJob>;

  constructor(services: ServicesConstructorInterface) {
    super(services);
    this.spellbookService = services["SpellbookService"];
    this.modelService = services["SequelizeService"];
    this.jobsBuffer = new Map();
  }

  async codingDone(message: AmqpGolemMessage) {
    const headers = message.properties.headers;
    const socketId = headers.socket_id;
    const content = message.content.toString();
    if (!this.jobsBuffer.has(socketId)) {
      await this.responseClass.sendError(
        `Could not find open coding job.`,
        socketId
      );
      return true;
    }

    if (!headers.success) {
      await this.responseClass.sendError(
        headers.errors.join("<br/>"),
        headers.socket_id
      );

      const job = this.jobsBuffer.get(socketId);
      job.resolve(true);
      this.jobsBuffer.delete(socketId);
      return true;
    }
    const currentJob = this.jobsBuffer.get(headers.socket_id);

    if (!headers.success) {
      await this.responseClass.sendError(
        headers.errors.join("\n"),
        headers.socket_id
      );
      currentJob.resolve(true);
      this.jobsBuffer.delete(headers.socket_id);
      return true;
    }

    // parse the function and run it
    try {
      const json = JSON.parse(content);
      const functionCode = json.content;
      const loadAndRunFunction = new Function(
        "parameters",
        `${functionCode}return executeFunction(parameters);`
      );
      const result = loadAndRunFunction(currentJob.skill_data);
      await this.responseClass.sendResponse(result, result, headers.socket_id);
      const functionModel = this.modelService.create("DynamicFunction");
      await functionModel.create({
        definition: currentJob.function_definition,
        code: functionCode,
      });
      await this.responseClass.clearEmbeddings();
    } catch (ex) {
      await this.responseClass.sendError(
        `An error occurred with the generated dynamic function.`,
        headers.socket_id
      );
    }

    currentJob.resolve(true);
    this.jobsBuffer.delete(headers.socket_id);
    return true;
  }

  async executeSkill(
    socketMessage: SocketMessage,
    skillData: any,
    responseClass: AbilityResponseHelperInterface
  ): Promise<boolean> {
    if (!socketMessage) return false;

    let gpt4Online =
      this.spellbookService.getOnlineSkillFromKey("openai_gpt_4");

    if (!gpt4Online) {
      await responseClass.sendError(
        `GPT 4 is required to code a dynamic function.`,
        socketMessage.socket_id
      );
      return true;
    }

    const extractedParams = {};
    const functionDefinition = JSON.parse(
      JSON.stringify(
        await responseClass.getActiveConversationParameter(
          socketMessage.socket_id,
          "guessed_function"
        )
      )
    );
    if (functionDefinition.knowledge_domain)
      delete functionDefinition.knowledge_domain;
    if (functionDefinition.parameters) {
      for (const paramName in functionDefinition.parameters) {
        extractedParams[paramName] =
          functionDefinition.parameters[paramName].value;
        delete functionDefinition.parameters[paramName].value;
      }
    }

    // build prompt to send to GPT4
    const systemPrompt = this.spellbookService.getPrompt(
      "chat-ability/dynamic-functions",
      "system"
    );
    const exampleDefinition = this.spellbookService.getPrompt(
      "chat-ability/dynamic-functions",
      "user_1"
    );
    const exampleFunction = this.spellbookService.getPrompt(
      "chat-ability/dynamic-functions",
      "assistant_1"
    );
    const functionDefinitionJson = JSON.stringify(functionDefinition, null, 2);
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: exampleDefinition,
      },
      {
        role: "assistant",
        content: exampleFunction,
      },
      {
        role: "user",
        content: functionDefinitionJson,
      },
    ];
    this.responseClass = responseClass;

    // show progress bar while getting webpage
    this.responseClass.updateProgressBar(
      {
        label: "Coding Function",
        total: 100,
        current: -1,
      },
      socketMessage.socket_id
    );

    return new Promise(async (resolve, reject) => {
      this.jobsBuffer.set(socketMessage.socket_id, {
        resolve: resolve,
        reject: reject,
        skill_data: extractedParams,
        function_definition: functionDefinitionJson,
      });

      return await this.spellbookService.publishCommand(
        "golem_skill",
        "openai_gpt_4",
        "code_dynamic_function",
        {
          messages: messages,
          debug: true,
          stream: false,
        },
        {
          socket_id: socketMessage.socket_id,
          job: "code_dynamic_function",
          model_name: "openai_gpt_4",
        }
      );
    });
  }
}

export default DynamicFunctionSkill;
