import { Socket } from "socket.io";

export interface SocketEventInterface {
  event: string;
  consumer?: SocketConsumerInterface[];
}

export interface SocketConsumerInterface {
  classInstance: Function;
  class_name: string;
  function: string;
  filter?: string;
}

export interface SocketsServiceInterface {
  setupServer(): Promise<void>;
  start(): void;
  getOpenSockets(): string[];
  emit(socketId: string, event: string, message: any): void;
  setConsumers(consumers: Map<string, Array<SocketConsumerInterface>>): void;
  afterConfig(): Promise<void>;
}

export interface SocketOpenSession {
  socket: Socket;
}
