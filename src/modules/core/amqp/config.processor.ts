import {
  AmqpConsumerInterface,
  AmqpExchangeInterface,
  AmqpQueueInterface,
  AmqpRunningConsumerInterface,
  ClassFactoryServiceInterface,
  LoggerServiceInterface,
  ProcessorInterface,
  ServicesConstructorInterface,
  ModuleConfig,
} from "types";
import { PluginSystem } from "../../../plugin";

interface AmqpConfigInterface extends ModuleConfig {
  exchange: AmqpExchangeInterface[];
  queue: AmqpQueueInterface[];
}

class AmqpConfigProcessor implements ProcessorInterface {
  // process the config file for queues, exchanges, bindings, and consumers
  @PluginSystem
  async process(services: ServicesConstructorInterface, config: any) {
    // Get service and make sure server is online
    const amqpService = services["AmqpService"];
    const classFactoryService: ClassFactoryServiceInterface =
      services["ClassFactoryService"];
    const logger: LoggerServiceInterface = services["LoggerService"];
    let consumerMap: Map<string, AmqpRunningConsumerInterface[]> = new Map();
    let createdQueues: Map<string, boolean> = new Map();

    if (!amqpService.isOnline()) {
      logger.error(`amqp server is not online`);
      return;
    }

    // load exchanges, queues and consumers for all modules
    for (let moduleName in config) {
      const currentModule: AmqpConfigInterface = config[moduleName];

      // setup exchanges
      if (currentModule.exchange) {
        for (let i = 0; i < currentModule.exchange.length; i++) {
          const exchange: AmqpExchangeInterface = currentModule.exchange[i];

          try {
            await amqpService.createExchange(
              exchange.name,
              exchange.type,
              exchange.auto_delete,
              exchange.durable
            );
          } catch (ex) {
            logger.error(`could not create exchange ${exchange.name}`);
          }
        }
      }

      // setup queues
      if (currentModule.queue) {
        for (let i = 0; i < currentModule.queue.length; i++) {
          // create the queue
          const queue: AmqpQueueInterface = currentModule.queue[i];
          if (!createdQueues.has(queue.name)) {
            await amqpService.createQueue(
              queue.name,
              queue.auto_delete,
              queue.durable,
              queue.dead_letter_exchange,
              queue.dead_letter_routing_key
            );
            createdQueues.set(queue.name, true);
          }

          // setup exchange bindings
          if (queue.binding) {
            for (let j = 0; j < queue.binding.length; j++) {
              const binding = queue.binding[j];
              await amqpService.bindQueueToExchange(
                queue.name,
                binding.exchange,
                binding.routing_key
              );
            }
          }

          if (queue.consumer) {
            for (let j = 0; j < queue.consumer.length; j++) {
              const consumer = queue.consumer[j];
              const consumerClass = classFactoryService.create(
                currentModule.name,
                consumer.class_name
              );
              if (!consumerMap.has(queue.name)) {
                consumerMap.set(queue.name, []);
              }

              const currentConsumers = consumerMap.get(queue.name);
              const newConsumer: AmqpRunningConsumerInterface = {
                queue: queue.name,
                classInstance: consumerClass,
                consumer: consumer,
              };
              currentConsumers.push(newConsumer);
              consumerMap.set(queue.name, currentConsumers);
            }
          }
        }
      }

      let wrapperClass = class {
        private consumers: AmqpRunningConsumerInterface[];
        private filterLookup: {
          [key: string]: { [subKey: string]: AmqpRunningConsumerInterface[] };
        };
        private nonFilterConsumers: AmqpRunningConsumerInterface[];

        constructor(consumers: AmqpRunningConsumerInterface[]) {
          this.consumers = consumers;
          this.nonFilterConsumers = [];
          this.filterLookup = null;
        }

        private buildMap() {
          this.filterLookup = {};
          for (let i = 0; i < this.consumers.length; i++) {
            const consumer: AmqpRunningConsumerInterface = this.consumers[i];
            const consumerDetails = consumer.consumer;
            if (!consumerDetails.filter) {
              this.nonFilterConsumers.push(consumer);
              continue;
            }

            // setup the filter maps for quicker execution
            const filter = consumerDetails.filter.split(":");
            if (!this.filterLookup[filter[0]])
              this.filterLookup[filter[0]] = {};
            if (!this.filterLookup[filter[0]][filter[1]])
              this.filterLookup[filter[0]][filter[1]] = [];

            this.filterLookup[filter[0]][filter[1]].push(consumer);
          }
        }

        async consume(message) {
          let result = false;

          const headers = message.properties.headers;
          if (!this.filterLookup) this.buildMap();
          for (let key in headers) {
            if (
              this.filterLookup[key] &&
              this.filterLookup[key][headers[key]]
            ) {
              // loop through matched consumers and call handler
              const matchedConsumers = this.filterLookup[key][headers[key]];
              for (let i = 0; i < matchedConsumers.length; i++) {
                const consumer = matchedConsumers[i];
                const consumerDetails = consumer.consumer;
                if (
                  typeof consumer.classInstance[consumerDetails.function] !==
                  "function"
                ) {
                  logger.warn(`no function ${consumerDetails.function} found`);
                  continue;
                }

                result = await consumer.classInstance[consumerDetails.function](
                  message
                );
              }
            }
          }

          for (let i = 0; i < this.nonFilterConsumers.length; i++) {
            const consumer = this.nonFilterConsumers[i];
            const consumerDetails = consumer.consumer;

            if (
              typeof consumer.classInstance[consumerDetails.function] !==
              "function"
            ) {
              logger.warn(`no function ${consumerDetails.function} found`);
              continue;
            }

            result = await consumer.classInstance[consumerDetails.function](
              message
            );
          }
          return result;
        }
      };

      consumerMap.forEach(async (consumers, queueName) => {
        const params = consumerMap.get(queueName);
        const consumerWrapper = new wrapperClass(params);
        await amqpService.createConsumer(queueName, consumerWrapper, "consume");
      });
    }
  }
}

export default AmqpConfigProcessor;
