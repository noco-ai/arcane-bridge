import { SocketMessage } from "types/spellbook/core";

export interface UserAuthentication {
  id: number;
  password_hash: string;
  username: string;
}

export interface AuthenticationServiceInterface {
  start(): Promise<boolean>;
  handleUserLogin(username, password);
  handleSaveUser(message: SocketMessage);
  handleDeleteUser(message: SocketMessage);
  handleGetUsers(message: SocketMessage): Promise<boolean>;
  handleDeleteUserGroup(message: SocketMessage);
  handleGetUserGroups(message: SocketMessage): Promise<boolean>;
  handleSaveUserGroup(message: SocketMessage);
}
