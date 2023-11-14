import { Server as SocketIOServer, Socket as SocketIOSocket } from "socket.io";
import {
  EmptyCliOptions,
  ExpressServiceInterface,
  LoggerServiceInterface,
  ServicesConstructorInterface,
  SocketConsumerInterface,
  SocketOpenSession,
  SocketsServiceInterface,
} from "types";
import { PluginSystem } from "../../../plugin";

export class SocketsService implements SocketsServiceInterface {
  private express: ExpressServiceInterface;
  private logger: LoggerServiceInterface;
  private io: SocketIOServer;
  private openSessions: Map<string, SocketOpenSession>;
  private consumers: Map<string, Array<SocketConsumerInterface>>;

  constructor(
    cliParams: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.express = services["ExpressService"];
    this.logger = services["LoggerService"];
  }

  @PluginSystem
  private handleDisconnect(socket: SocketIOSocket) {
    // delete the session data
    if (this.openSessions.has(socket.id)) {
      this.logger.info(`cleaning up session for ${socket.id}`, {
        icon: "🔌",
      });
      this.openSessions.delete(socket.id);
    }

    this.logger.info(`socket disconnected ${socket.id}`, {
      icon: "🔌",
    });
  }

  @PluginSystem
  private configureEvents(socket: SocketIOSocket) {
    for (let [eventName, consumers] of this.consumers.entries()) {
      if (eventName === "connection") continue;

      // on socket event
      socket.on(eventName, async (payload) => {
        for (let i = 0; i < consumers.length; i++) {
          const consumer: SocketConsumerInterface = consumers[i];
          try {
            // check if filter is set
            if (consumer.filter) {
              const filter = consumer.filter.split(":");
              if (!payload[filter[0]] || payload[filter[0]] !== filter[1]) {
                continue;
              }
            }

            await consumer.classInstance[consumer.function]({
              event: eventName,
              socket_id: socket.id,
              payload: payload,
            });
          } catch (err) {
            this.logger.error(
              `error in consumer for event "${eventName}"`,
              {},
              err
            );
          }
        }
      });
    }
  }

  @PluginSystem
  async setupServer() {
    // client has connected using socket.io
    this.io.on("connection", async (socket: SocketIOSocket) => {
      this.logger.info(`socket connected ${socket.id}`, { icon: "🔌" });

      // select chat queue to use
      if (typeof this.openSessions[socket.id] === "undefined") {
        this.logger.info(`new session for socket ${socket.id}`, {
          icon: "🔌",
        });

        const newSession: SocketOpenSession = {
          socket: socket,
        };
        this.openSessions.set(socket.id, newSession);
      }

      this.configureEvents(socket);

      socket.on("disconnect", () => {
        this.handleDisconnect(socket);
      });

      // notify other classes of new socket connect
      const consumers: Array<SocketConsumerInterface> =
        this.consumers.get("connection");
      if (!consumers) return;
      for (let i = 0; i < consumers.length; i++) {
        const consumer: SocketConsumerInterface = consumers[i];
        await consumer.classInstance[consumer.function]({
          event: "connection",
          socket_id: socket.id,
          payload: {},
        });
      }
    });
  }

  // start the socket server
  @PluginSystem
  async start(): Promise<boolean> {
    this.openSessions = new Map();

    // configure the socket.io server
    this.io = new SocketIOServer(this.express.getServer(), {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });
    return true;
  }

  @PluginSystem
  getOpenSockets() {
    return [...this.openSessions.keys()];
  }

  @PluginSystem
  emit(socketId: string, event: string, message: any) {
    const session: SocketOpenSession = this.openSessions.get(socketId);
    if (session) {
      session.socket.emit(event, message);
    } else {
      this.logger.warn(
        `unable to send message. no open session found for socket id: ${socketId}`
      );
    }
  }

  @PluginSystem
  setConsumers(consumers: Map<string, Array<SocketConsumerInterface>>) {
    this.consumers = consumers;
  }

  @PluginSystem
  async afterConfig() {
    await this.setupServer();

    // output to console
    this.logger.info(
      `socket.io server started on port ${this.express.getPort()}`,
      { icon: "🔌" }
    );
  }
}

export default SocketsService;
