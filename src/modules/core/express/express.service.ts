import express, { Express } from "express";
import http from "http";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import {
  ExpressServiceInterface,
  LoggerServiceInterface,
  ServicesConstructorInterface,
} from "types";
import { PluginSystem } from "../../../plugin";
import cookieParser from "cookie-parser";

interface ExpressCliOptions {
  port: number;
}

export class ExpressService implements ExpressServiceInterface {
  private logger: LoggerServiceInterface;
  private server: http.Server;
  private http: Express;
  private port: number;

  constructor(
    cliParams: ExpressCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.logger = services["LoggerService"];

    var corsOptions = {
      origin: function (origin, callback) {
        if (origin === undefined) {
          callback(null, true);
        } else {
          callback(null, origin);
        }
      },
      credentials: true,
      optionsSuccessStatus: 200,
    };

    // setup the http server classes
    this.http = express();
    this.server = new http.Server(this.http);
    this.http.use(express.json());
    this.http.use(cors(corsOptions));
    this.http.use(cookieParser());
    this.port = cliParams.port || 3000;

    this.http.use((req, res, next) => {
      req.id = uuidv4();
      next();
    });
  }

  @PluginSystem
  async start(): Promise<boolean> {
    return true;
  }

  @PluginSystem
  async afterConfig(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // start listening on the port specified
      this.server.listen(this.port, () => {
        this.logger.info(`web server started on port ${this.port}`, {
          icon: "🌐",
        });
        resolve(true);
      });
    });
  }

  @PluginSystem
  getExpress(): Express {
    return this.http;
  }

  @PluginSystem
  getServer(): http.Server {
    return this.server;
  }

  @PluginSystem
  getPort(): number {
    return this.port;
  }
}

export default ExpressService;
