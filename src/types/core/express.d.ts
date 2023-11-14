import { Server } from "http";
import { Express } from "express";

export interface ExpressRoute {
  route: string;
  route_file: string;
  route_function: string;
  request_type: string;
}

export interface ExpressServiceInterface {
  start();
  afterConfig(): Promise<boolean>;
  getExpress(): Express;
  getServer(): Server;
  getPort(): number;
}
