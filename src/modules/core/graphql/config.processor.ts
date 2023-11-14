import {
  GraphQLServiceInterface,
  ProcessorInterface,
  ServicesConstructorInterface,
} from "types";
import { PluginSystem } from "../../../plugin";

class GarphqlProcessor implements ProcessorInterface {
  // process the config file for graphql bindings
  @PluginSystem
  async process(services: ServicesConstructorInterface, config: any) {
    const garphqlService: GraphQLServiceInterface = services["GraphqlService"];

    for (let moduleName in config) {
      const currentModule = config[moduleName];

      if (currentModule.sequelize_model) {
        for (let i = 0; i < currentModule.sequelize_model.length; i++) {
          const model = currentModule.sequelize_model[i];

          if (model.graphql_query) {
            for (let j = 0; j < model.graphql_query.length; j++) {
              const query = model.graphql_query[j];
              query.module = currentModule.name;
              query.model_name = model.name;
              garphqlService.addQuery(query);
            }
          }

          if (model.graphql_mutation) {
            for (let j = 0; j < model.graphql_mutation.length; j++) {
              const mutation = model.graphql_mutation[j];
              mutation.module = currentModule.name;
              mutation.model_name = model.name;
              garphqlService.addMutation(mutation);
            }
          }
        }
      }
    }
  }
}

export default GarphqlProcessor;
