import { Model } from "sequelize";
import { PluginSystem } from "../../../plugin";
import { RequestContext, createHandler } from "graphql-http/lib/use/express";
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
  VaultServiceInterface,
} from "types";

interface GraphQLModelInterface {
  typeDefinition: GraphQLObjectType;
  isUserSpecific: boolean;
}

export class GraphqlService implements GraphQLServiceInterface {
  private logger: LoggerServiceInterface;
  private expressService: ExpressServiceInterface;
  private sequelizeService: SequelizeServiceInterface;
  private classFactoryService: ClassFactoryServiceInterface;
  private vault: VaultServiceInterface;
  private queryList: GraphQLQueryInterface[];
  private mutationList: GraphQLMutationInterface[];
  private userResourceMap: Map<string, boolean>;

  constructor(
    cliParams: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.logger = services["LoggerService"];
    this.expressService = services["ExpressService"];
    this.sequelizeService = services["SequelizeService"];
    this.classFactoryService = services["ClassFactoryService"];
    this.vault = services["VaultService"];
    this.queryList = [];
    this.mutationList = [];
    this.userResourceMap = new Map();
  }

  @PluginSystem
  private getGraphQLType(dataType: string) {
    switch (dataType.toLowerCase()) {
      case "string":
      case "text":
        return GraphQLString;
      case "bigint":
        return GraphQLFloat;
      case "integer":
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
  ): GraphQLModelInterface {
    const fields = {};
    let isUserSpecific = false;

    // Iterate over the model's fields
    for (let [key, value] of Object.entries(model["rawAttributes"])) {
      if (!skipFields.includes(key)) {
        fields[key] = {
          type: this.getGraphQLType((value as any).type.key),
        };
        if (key === "user_id") isUserSpecific = true;
      }
    }

    return {
      typeDefinition: new GraphQLObjectType({
        name,
        fields,
      }),
      isUserSpecific: isUserSpecific,
    };
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
  private applyAuthResolvers(queryFields, mutationFields) {
    for (const key in mutationFields) {
      const originalResolve = mutationFields[key].resolve;
      mutationFields[key].resolve = async (...args) => {
        const headers = args[2].req.headers;
        const userId = await this.vault.validateAuthToken(
          headers["authorization"],
          headers["socket-id"],
          "graphql_query"
        );

        if (!userId) {
          this.logger.info(`invalid token provided to graphql endpoint`);
          throw new Error("Invalid token provided");
        }

        // is a user specific resource
        if (this.userResourceMap.has(args[3].fieldName)) {
          args[3].variableValues.user_id = userId;
          args[1].user_id = userId;
        }
        return await originalResolve(...args);
      };
    }

    for (const key in queryFields) {
      const originalResolve = queryFields[key].resolve;
      queryFields[key].resolve = async (...args) => {
        // check to see if this is a valid user making the request
        const headers = args[2].req.headers;
        const userId = await this.vault.validateAuthToken(
          headers["authorization"],
          headers["socket-id"],
          "graphql_query"
        );

        if (!userId) {
          this.logger.info(`invalid token provided to graphql endpoint`);
          throw new Error("Invalid token provided");
        }

        // is a user specific resource
        if (this.userResourceMap.has(args[3].fieldName)) {
          args[3].variableValues.user_id = userId;
          args[1].user_id = userId;
        }
        return await originalResolve(...args);
      };
    }
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
      const modelType: GraphQLModelInterface = this.modelToGraphQLObjectType(
        mutation.schema_type,
        loadModel,
        []
      );

      let args = {};
      for (let j = 0; j < mutation.args.length; j++) {
        const arg = mutation.args[j];
        args[arg.name] = { type: this.getGraphQLType(arg.type) };
      }

      // require a user id as a parameter if is a user specific table
      if (modelType.isUserSpecific)
        args["user_id"] = { type: this.getGraphQLType("int") };

      // keep track of user specific queries
      this.userResourceMap.set(mutation.mutation, modelType.isUserSpecific);

      const resolverClass = this.classFactoryService.create(
        mutation.module,
        mutation.resolver_file
      );
      mutationFields[mutation.mutation] = {
        type: modelType.typeDefinition,
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

      // keep track of user specific queries
      this.userResourceMap.set(query.query, modelType.isUserSpecific);

      // build the args to use in where
      let args = {};
      for (let j = 0; j < query.args.length; j++) {
        const arg = query.args[j];
        args[arg.name] = { type: this.getGraphQLType(arg.type) };
      }

      // require a user id as a parameter if is a user specific table
      if (modelType.isUserSpecific)
        args["user_id"] = { type: this.getGraphQLType("int") };

      // set if this is a array or an object returned by graphql
      const type =
        query.response_type === "object"
          ? modelType.typeDefinition
          : new GraphQLList(modelType.typeDefinition);

      // add the query to the list
      queryFields[query.query] = {
        type: type,
        resolve: resolver(loadModel),
        args: args,
      };
    }

    this.applyAuthResolvers(queryFields, mutationFields);

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
    express.all(
      "/graphql",
      createHandler({
        schema,
        context: async (req, args) => {
          return { req, args };
        },
      })
    );

    this.logger.info(`graphql endpoint /graphql online`, {
      icon: "🔀",
    });

    return true;
  }
}

export default GraphqlService;
