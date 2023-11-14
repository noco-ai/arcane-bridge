import {
  ServiceInterface,
  VaultServiceInterface,
  LoggerServiceInterface,
  ServicesConstructorInterface,
  AmqpServiceInterface,
} from "types";
import amqp, {
  Connection,
  Channel,
  ConsumeMessage,
} from "amqplib/callback_api";
import { PluginSystem } from "../../../plugin";

interface AmqpCliOptions {
  serverId: string;
}

export class AmqpService implements AmqpServiceInterface {
  private connection: Connection | null;
  private channel: Channel | null;
  private connectionAttempts: number;
  private connectionIntervalId: NodeJS.Timeout | null;
  private uri: string;
  private isServerOnline: boolean;
  private serverId: string;
  private createdQueues: Map<string, boolean>;
  private createdExchanges: Map<string, boolean>;
  private logger: LoggerServiceInterface;
  private vault: VaultServiceInterface;

  constructor(
    cliOptions: AmqpCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.connection = null;
    this.channel = null;
    this.connectionAttempts = 0;
    this.connectionIntervalId = null;
    this.isServerOnline = false;
    this.serverId = null;
    this.createdQueues = new Map();
    this.createdExchanges = new Map();
    this.logger = services["LoggerService"];
    this.vault = services["VaultService"];
    this.serverId = cliOptions.serverId;
  }

  async start(): Promise<boolean> {
    // service has already been started
    if (this.isServerOnline) {
      return true;
    }

    // get credentials from vault for amqp
    const keys = await this.vault.getGroup("core/amqp");
    if (
      !keys ||
      typeof keys.host == "undefined" ||
      typeof keys.username == "undefined" ||
      typeof keys.password == "undefined"
    ) {
      this.logger.error(
        `could not start amqp service, invalid credentials found`
      );
      return false;
    }

    const uri = !keys.vhost
      ? `amqp://${keys.username}:${keys.password}@${keys.host}`
      : `amqp://${keys.username}:${keys.password}@${keys.host}/${keys.vhost}`;
    this.uri = uri;

    const connected = await this.connect(uri);
    if (connected) {
      this.isServerOnline = true;
      this.logger.info(`connected to amqp://${keys.host}`, {
        icon: "🔐",
        config: 1,
      });
    }

    return this.isServerOnline;
  }

  private async connect(url: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Connect to amqp server
      amqp.connect(url, (err, conn) => {
        if (err) {
          this.handleError(`error connecting to amqp: ${err}`);
          resolve(false);
          return;
        }

        this.connection = conn;
        conn.on("error", this.handleConnectionError.bind(this));
        conn.on("close", this.handleConnectionClose.bind(this));

        conn.createConfirmChannel((err, ch) => {
          if (err) {
            this.handleError(`error creating amqp channel: ${err}`);
            resolve(false);
            return;
          }
          this.channel = ch;
          resolve(true);
        });
      });
    });
  }

  private handleConnectionError(error: Error): void {
    this.handleError(`amqp connection error: ${error}`);
    this.connection = null;
    this.channel = null;
    setTimeout(() => this.connectWithRetry(), this.getNextRetryDelay());
  }

  private handleConnectionClose(): void {
    this.handleError("amqp connection closed");
    this.connection = null;
    this.channel = null;
  }

  private async connectWithRetry(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (this.connectionAttempts >= 10) {
        clearInterval(this.connectionIntervalId as NodeJS.Timeout);
        this.handleError(
          "max number of connection attempts reached, giving up"
        );
        return;
      }

      this.handleError("attempting to reconnect to amqp...");
      const connected = await this.connect(this.uri);
      if (connected) {
        this.connectionAttempts = 0;
        this.logger.info(`amqp connection recovered`);
        return;
      }

      this.connectionAttempts += 1;
      setTimeout(() => this.connectWithRetry(), this.getNextRetryDelay());
    });
  }

  private getNextRetryDelay(): number {
    return Math.pow(2, this.connectionAttempts) * 1000;
  }

  @PluginSystem
  isOnline(): boolean {
    return this.isServerOnline;
  }

  @PluginSystem
  getServerId(): string {
    return this.serverId;
  }

  @PluginSystem
  async publishMessage(
    exchangeName: string,
    routingKey: string,
    returnRoutingKey: string,
    message: any,
    customHeaders?: { [header: string]: any },
    rawMessage?: boolean
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.channel) {
        reject(new Error("amqp channel not initialized"));
        return;
      }

      const defaultHeaders = {
        "x-delay": 0,
        return_routing_key: returnRoutingKey,
      };
      const headers = { ...defaultHeaders, ...customHeaders };

      const encodedMessage = rawMessage
        ? Buffer.from(message)
        : Buffer.from(JSON.stringify(message));

      this.channel.publish(
        exchangeName,
        routingKey,
        encodedMessage,
        { headers, contentType: "application/json", deliveryMode: 2 },
        (err) => {
          if (err) {
            this.handleError(
              `Error sending message to exchange ${exchangeName}: ${err}`
            );
            reject(err);
            return;
          }
          resolve();
        }
      );
    });
  }

  @PluginSystem
  public close(): void {
    // Close the connection to amqp
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  }

  // binds a queue to an exchange
  @PluginSystem
  async bindQueueToExchange(
    queue: string,
    exchange: string,
    routingKey: string
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        queue = queue.replace("{serverid}", this.serverId);
        exchange = exchange.replace("{serverid}", this.serverId);
        routingKey = routingKey.replace("{serverid}", this.serverId);
        this.channel!.bindQueue(queue, exchange, routingKey, {}, (err, ok) => {
          if (err) {
            reject(err);
            return;
          }
          this.logger.info(`binding ${queue} to ${exchange}`, {
            icon: "🔗",
          });
          resolve(ok);
        });
      } catch (ex) {
        reject(ex);
      }
    });
  }

  // create a exchange
  @PluginSystem
  async createExchange(
    exchangeName: string,
    type: string = "direct",
    autoDelete: boolean = false,
    durable: boolean = false
  ): Promise<void> {
    if (!this.channel) {
      throw new Error("channel is not initialized");
    }

    return new Promise((resolve, reject) => {
      try {
        // Exchange already asserted
        exchangeName = exchangeName.replace("{serverid}", this.serverId);
        if (this.createdExchanges.has(exchangeName)) {
          this.logger.warn(`exchange ${exchangeName} already asserted`);
          resolve();
          return;
        }

        this.createdExchanges.set(exchangeName, true);
        this.channel!.assertExchange(
          exchangeName,
          type,
          { durable: durable, autoDelete: autoDelete },
          (err, ok) => {
            if (err) {
              reject(err);
            } else {
              resolve(ok);
            }
          }
        );
      } catch (ex) {
        reject(ex);
      }
    });
  }

  // create a queue
  @PluginSystem
  async createQueue(
    queueName: string,
    autoDelete: boolean = false,
    durable: boolean = false,
    deadLetterExchange?: string,
    deadLetterRoutingKey?: string
  ): Promise<void> {
    if (!this.channel) {
      throw new Error("channel is not initialized");
    }

    const options = {
      durable: durable,
      autoDelete: autoDelete,
      arguments: {},
    };

    if (deadLetterExchange) {
      options.arguments["x-dead-letter-exchange"] = deadLetterExchange;
    }

    if (deadLetterRoutingKey) {
      options.arguments["x-dead-letter-routing-key"] = deadLetterRoutingKey;
    }

    return new Promise((resolve, reject) => {
      queueName = queueName.replace("{serverid}", this.serverId);

      // Exchange already asserted
      if (this.createdQueues.has(queueName)) {
        this.logger.warn(`queue ${queueName} already asserted`);
        resolve();
        return;
      }

      this.createdQueues.set(queueName, true);
      this.channel!.assertQueue(queueName, options, (err, ok) => {
        if (err) {
          reject(err);
        } else {
          resolve(ok);
        }
      });
    });
  }

  // creates a consumer and attaches it to a class and function
  @PluginSystem
  async createConsumer(
    queueName: string,
    handlerClass: Function,
    handlerFunction: string
  ): Promise<void> {
    if (!this.channel) {
      throw new Error("amqp channel not initialized");
    }

    queueName = queueName.replace("{serverid}", this.serverId);
    this.logger.info(`starting consumer for ${queueName}`, {
      icon: "🔗",
    });
    this.channel.consume(queueName, async (message: ConsumeMessage | null) => {
      if (!message) {
        return;
      }
      try {
        const result = await handlerClass[handlerFunction](message);
        if (result) {
          this.channel.ack(message);
        } else {
          this.channel.reject(message, false);
        }
      } catch (error) {
        console.log(message);
        this.handleError(`error handling message: ${error}`);
        this.channel.reject(message, false);
      }
    });
  }

  private handleError(error: string): void {
    this.logger.error(error);
  }
}

export default AmqpService;
