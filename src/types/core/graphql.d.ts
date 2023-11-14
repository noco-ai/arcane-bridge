import { ServiceInterface } from "types";

export interface GraphQLArgumentsInterface {
  name: string;
  type:
    | "string"
    | "text"
    | "integer"
    | "bigint"
    | "time"
    | "float"
    | "real"
    | "double"
    | "decimal"
    | "boolean"
    | "date"
    | "dateonly";
}

export interface GraphQLQueryInterface {
  query: string;
  schema_type: string;
  args: GraphQLArgumentsInterface[];
  resolver_file: string;
  resolver_function: string;
  response_type: "list" | "object";
  exclude_data: string[];
  model_name: string;
}

export interface GraphQLMutationInterface {
  mutation: string;
  schema_type: string;
  args: GraphQLArgumentsInterface[];
  resolver_file: string;
  resolver_function: string;
  model_name: string;
  module: string;
}

export interface GraphQLServiceInterface extends ServiceInterface {
  afterConfig(): Promise<boolean>;
  addQuery(query: GraphQLQueryInterface);
  addMutation(mutation: GraphQLMutationInterface);
}
