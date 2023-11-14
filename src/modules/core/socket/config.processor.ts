import {
  ClassFactoryServiceInterface,
  LoggerServiceInterface,
  ProcessorInterface,
  ServicesConstructorInterface,
  SocketConsumerInterface,
  SocketEventInterface,
  SocketsServiceInterface,
} from "types";
import { PluginSystem } from "../../../plugin";

class SocketConfigProcessor implements ProcessorInterface {
  // process the config file for socket listeners
  @PluginSystem
  async process(services: ServicesConstructorInterface, config: any) {
    const logger: LoggerServiceInterface = services["LoggerService"];
    const socketService: SocketsServiceInterface = services["SocketService"];
    const classFactoryService: ClassFactoryServiceInterface =
      services["ClassFactoryService"];
    const consumers: Map<string, Array<SocketConsumerInterface>> = new Map();

    // load socket events
    for (let moduleName in config) {
      const currentModule = config[moduleName];
      if (!currentModule.socket_event || !currentModule.socket_event) {
        continue;
      }

      // loop through socket events
      const events: Array<SocketEventInterface> = currentModule.socket_event;
      for (let i = 0; i < events.length; i++) {
        const event: SocketEventInterface = events[i];
        if (!event.event || !event.consumer) {
          logger.warn(
            `invalid configuration for socket events in ${moduleName}`
          );
          continue;
        }

        // create the socket events consumers
        for (let j = 0; j < event.consumer.length; j++) {
          const consumer: SocketConsumerInterface = event.consumer[j];

          // create the class instance for the consumer
          const consumerClass = classFactoryService.create(
            currentModule.name,
            consumer.class_name
          );

          // check to make sure the class instance is valid
          if (!consumerClass) {
            logger.warn(
              `could not create instance of ${currentModule.name}/${consumer.class_name}`
            );
            continue;
          }

          // check to make sure the function is valid
          if (typeof consumerClass[consumer.function] !== "function") {
            logger.warn(
              `function ${consumer.function} not defined in ${currentModule.name}/${consumer.class_name}`
            );
            continue;
          }

          // add to the list of consumers
          if (!consumers.has(event.event)) {
            consumers.set(event.event, []);
          }

          const newConsumer: SocketConsumerInterface = {
            function: consumer.function,
            classInstance: consumerClass,
            class_name: consumer.class_name,
            filter: consumer.filter,
          };

          const currentConsumers = consumers.get(event.event);
          currentConsumers.push(newConsumer);
          consumers.set(event.event, currentConsumers);

          logger.info(
            `binding ${consumer.function} in ${currentModule.name}/${consumer.class_name} to socket event "${event.event}"`,
            { icon: "🔗" }
          );
        }
      }
    }

    // set the socket consumer data
    socketService.setConsumers(consumers);
  }
}

export default SocketConfigProcessor;
