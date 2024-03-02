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
const DDG = require("duck-duck-scrape");

export class FunctionCallingProcessor {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private spellbookService: SpellbookServiceInterface;
  private modelService: SequelizeServiceInterface;
  private llmService: any;
  private embeddingService: any;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.spellbookService = services["SpellbookService"];
    this.modelService = services["SequelizeService"];
    this.llmService = services["GolemLlmService"];
    this.embeddingService = services["GolemEmbeddingService"];
  }

  async processFunctionCalling() {
    try {
      /*const result = await this.embeddingService.generateEmbedding(
        ["TEST ONE TWO"],
        "e5_large_v2"
      );
      console.log(result);

      
      const searchResults = await DDG.search('node.js', {
        safeSearch: DDG.SafeSearchType.STRICT
      });

      console.log(searchResults);*/
      /*const result = await this.llmService.generate(
        [{ role: "user", content: "Hello!" }],
        "llama2_7b_exllama",
        0
      );
      console.log("CALLED");
      console.log(result);*/
    } catch (ex) {
      this.logger.error(ex.message);
    }
  }
}

export default FunctionCallingProcessor;
