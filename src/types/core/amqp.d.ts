import { ServiceInterface } from "types";
export interface AmqpServiceOptions {
  uri: string;
}

export interface AmqpExchangeInterface {
  name: string;
  type: string;
  auto_delete: boolean;
  durable: boolean;
}

export interface AmqpConsumerInterface {
  class_name: string;
  function: string;
  filter: string;
}

export interface AmqpRunningConsumerInterface {
  queue: string;
  classInstance: Function;
  consumer: AmqpConsumerInterface;
}

export interface AmqpBindingInterface {
  exchange: string;
  routing_key: string;
}

export interface AmqpQueueInterface {
  name: string;
  auto_delete: boolean;
  durable: boolean;
  dead_letter_exchange: string;
  dead_letter_routing_key: string;
  binding: AmqpBindingInterface[];
  consumer: AmqpConsumerInterface[];
}

export interface AmqpServiceInterface extends ServiceInterface {
  isOnline(): boolean;
  getServerId(): string;

  start(): Promise<boolean>;
  publishMessage(
    exchangeName: string,
    routingKey: string,
    returnRoutingKey: string,
    message: any,
    customHeaders?: { [header: string]: any },
    rawMessage?: boolean
  ): Promise<void>;

  close(): void;

  bindQueueToExchange(
    queue: string,
    exchange: string,
    routingKey: string
  ): Promise<boolean>;

  createExchange(
    exchangeName: string,
    type: string,
    autoDelete?: boolean,
    durable?: boolean
  ): Promise<void>;

  // create a queue
  createQueue(
    queueName: string,
    autoDelete: boolean,
    durable: boolean,
    deadLetterExchange?: string,
    deadLetterRoutingKey?: string
  ): Promise<void>;

  // creates a consumer and attaches it to a class and function
  createConsumer(
    queueName: string,
    handlerClass: Function,
    handlerFunction: string
  ): Promise<void>;

  cancelMessages(
    routingKey: string,
    headersToMatch: string[],
    messageCount: number
  ): Promise<void>;
}
