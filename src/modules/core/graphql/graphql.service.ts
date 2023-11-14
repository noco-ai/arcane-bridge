import { Model } from "sequelize";
import { PluginSystem } from "../../../plugin";
import { createHandler } from "graphql-http/lib/use/express";
import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
  GraphQLSchema,
} from "graphql";
import { resolver } from "graphql-sequelize";
import {
  ClassFactoryServiceInterface,
  EmptyCliOptions,
  ExpressServiceInterface,
  GraphQLMutationInterface,
  GraphQLQueryInterface,
  GraphQLServiceInterface,
  LoggerServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
} from "types";

export class GarphqlService implements GraphQLServiceInterface {
  private logger: LoggerServiceInterface;
  private expressService: ExpressServiceInterface;
  private sequelizeService: SequelizeServiceInterface;
  private classFactoryService: ClassFactoryServiceInterface;
  private queryList: GraphQLQueryInterface[];
  private mutationList: GraphQLMutationInterface[];

  constructor(
    cliParams: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.logger = services["LoggerService"];
    this.expressService = services["ExpressService"];
    this.sequelizeService = services["SequelizeService"];
    this.classFactoryService = services["ClassFactoryService"];
    this.queryList = [];
    this.mutationList = [];
  }

  @PluginSystem
  private getGraphQLType(dataType: string) {
    switch (dataType.toLowerCase()) {
      case "string":
      case "text":
        return GraphQLString;
      case "integer":
      case "bigint":
      case "time":
        return GraphQLInt;
      case "float":
      case "real":
      case "double":
      case "decimal":
        return GraphQLFloat;
      case "boolean":
        return GraphQLBoolean;
      case "date":
      case "dateonly":
        return GraphQLString;
      case "array":
        return new GraphQLList(GraphQLString);
      default:
        return GraphQLString;
    }
  }

  @PluginSystem
  private modelToGraphQLObjectType(
    name: string,
    model: Model,
    skipFields: string[] = []
  ): GraphQLObjectType {
    const fields = {};

    // Iterate over the model's fields
    for (let [key, value] of Object.entries(model["rawAttributes"])) {
      if (!skipFields.includes(key)) {
        fields[key] = {
          type: this.getGraphQLType((value as any).type.key),
        };
      }
    }

    return new GraphQLObjectType({
      name,
      fields,
    });
  }

  @PluginSystem
  addQuery(query: GraphQLQueryInterface) {
    this.queryList.push(query);
  }

  @PluginSystem
  addMutation(mutation: GraphQLMutationInterface) {
    this.mutationList.push(mutation);
  }

  @PluginSystem
  async start(): Promise<boolean> {
    return true;
  }

  @PluginSystem
  async afterConfig(): Promise<boolean> {
    let queryFields = {};
    let mutationFields = {};

    // build a list of all mutations
    for (let i = 0; i < this.mutationList.length; i++) {
      const mutation = this.mutationList[i];
      const loadModel = this.sequelizeService.create(mutation.model_name);

      // build the schema for the model
      const modelType = this.modelToGraphQLObjectType(
        mutation.schema_type,
        loadModel,
        []
      );

      let args = {};
      for (let j = 0; j < mutation.args.length; j++) {
        const arg = mutation.args[j];
        args[arg.name] = { type: this.getGraphQLType(arg.type) };
      }

      const resolverClass = this.classFactoryService.create(
        mutation.module,
        mutation.resolver_file
      );
      mutationFields[mutation.mutation] = {
        type: modelType,
        resolve: async (...args) => {
          return await resolverClass[mutation.resolver_function](
            args[1],
            args[3]
          );
        },
        args: args,
      };
    }

    // build all the queries defined for models
    for (let i = 0; i < this.queryList.length; i++) {
      const query = this.queryList[i];
      const loadModel = this.sequelizeService.create(query.model_name);

      // build the schema for the model
      const modelType = this.modelToGraphQLObjectType(
        query.schema_type,
        loadModel,
        query.exclude_data
      );

      // build the args to use in where
      let args = {};
      for (let j = 0; j < query.args.length; j++) {
        const arg = query.args[j];
        args[arg.name] = { type: this.getGraphQLType(arg.type) };
      }

      // set if this is a array or an object returned by graphql
      const type =
        query.response_type === "object"
          ? modelType
          : new GraphQLList(modelType);

      // add the query to the list
      queryFields[query.query] = {
        type: type,
        resolve: resolver(loadModel),
        args: args,
      };
    }

    // build the schema
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "Query",
        fields: queryFields,
      }),
      mutation: new GraphQLObjectType({
        name: "Mutation",
        fields: mutationFields,
      }),
    });

    // setup express w/ graphql
    const express = this.expressService.getExpress();
    express.all("/graphql", createHandler({ schema }));

    this.logger.info(`graphql endpoint /graphql online`, {
      icon: "🔀",
    });

    return true;
  }
}

export default GarphqlService;
