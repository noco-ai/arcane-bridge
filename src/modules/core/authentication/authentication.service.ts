import {
  ServiceInterface,
  VaultServiceInterface,
  LoggerServiceInterface,
  ServicesConstructorInterface,
  SocketMessage,
  SocketsServiceInterface,
  AuthenticationServiceInterface,
} from "types";
import { PluginSystem } from "../../../plugin";
import bcrypt from "bcrypt";

interface AmqpCliOptions {
  serverId: string;
}

export class AuthenticationService implements AuthenticationServiceInterface {
  private logger: LoggerServiceInterface;
  private vault: VaultServiceInterface;
  private socketService: SocketsServiceInterface;

  constructor(
    cliOptions: AmqpCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.logger = services["LoggerService"];
    this.vault = services["VaultService"];
    this.socketService = services["SocketService"];
  }

  @PluginSystem
  async handleSaveUserGroup(message: SocketMessage) {
    let userGroups = (await this.vault.getGroup("core/user_groups")) || {};
    const group = message.payload.group;
    if (!group || !group.name) {
      this.logger.error(`invalid group data sent to save user group`);
      return true;
    }

    group.unique_key =
      group.unique_key ||
      group.name
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/ /g, "_");

    group.name_static = group.name;
    group.description_static = group.description;
    userGroups[group.unique_key] = group;
    await this.vault.setGroup("core/user_groups", userGroups);
    this.socketService.emit(message.socket_id, "finish_command", {
      command: "save_user_group",
    });
  }

  @PluginSystem
  async handleGetUserGroups(message: SocketMessage): Promise<boolean> {
    try {
      const ret = [];
      let userGroups = await this.vault.getGroup("core/user_groups");
      if (userGroups) {
        Object.keys(userGroups).forEach((key) => {
          ret.push(userGroups[key]);
        });
      }

      this.socketService.emit(message.socket_id, "finish_command", {
        command: "get_user_groups",
        groups: ret,
      });
    } catch (error) {
      this.logger.error("error fetching user list", null, error);
    }
    return true;
  }

  @PluginSystem
  async handleDeleteUserGroup(message: SocketMessage) {
    const uniqueKeyToDelete = message.payload.unique_key;

    if (!uniqueKeyToDelete) {
      this.logger.error("No unique key provided for deleting user group");
      return true;
    }

    let userGroups = (await this.vault.getGroup("core/user_groups")) || {};
    delete userGroups[uniqueKeyToDelete];

    await this.vault.setGroup("core/user_groups", userGroups);
    this.socketService.emit(message.socket_id, "finish_command", {
      command: "delete_user_group",
    });
    return true;
  }

  @PluginSystem
  async handleGetUsers(message: SocketMessage): Promise<boolean> {
    try {
      const ret = [];
      let users = await this.vault.getGroup("core/users");
      if (users) {
        Object.values(users).forEach((user: any) => {
          user.password_confirm = "";
          user.password = "";
          ret.push(user);
        });
      }

      this.socketService.emit(message.socket_id, "finish_command", {
        command: "get_users",
        users: ret,
      });
    } catch (error) {
      this.logger.error("Error fetching user list", null, error);
    }
    return true;
  }

  @PluginSystem
  async handleDeleteUser(message: SocketMessage) {
    const usernameToDelete = message.payload.username;
    if (!usernameToDelete) {
      this.logger.error("No username provided for deleting user");
      return true;
    }

    let users = (await this.vault.getGroup("core/users")) || {};
    delete users[usernameToDelete];

    await this.vault.setGroup("core/users", users);
    this.socketService.emit(message.socket_id, "finish_command", {
      command: "delete_user",
    });
    return true;
  }

  @PluginSystem
  async handleSaveUser(message: SocketMessage) {
    let users = (await this.vault.getGroup("core/users")) || {};
    const userMeta = await this.vault.getGroup("core/users_metadata");
    if (!userMeta) {
      this.logger.error(`invalid user meta data`);
      return true;
    }

    const newUser = message.payload.user;
    if (!newUser || !newUser.username) {
      this.logger.error(`invalid user data sent to save user`);
      return true;
    }

    let user = users[newUser.username] || {};
    if (!user.id) {
      userMeta.last_user_id += 1;
      user.id = userMeta.last_user_id;
      await this.vault.setGroup("core/users_metadata", userMeta);
    }

    if (newUser.password && newUser.password_confirm) {
      if (newUser.password !== newUser.password_confirm) {
        this.logger.error(`password and password confirmation do not match`);
        return true;
      }
      user.password = await bcrypt.hash(newUser.password, 10);
      user.password_confirm = "";
    }

    user.first_name = newUser.first_name || user.first_name;
    user.last_name = newUser.last_name || user.last_name;
    user.email = newUser.email || user.email;
    user.groups = newUser.groups || user.groups;
    user.is_admin = newUser.is_admin ?? user.is_admin;
    user.is_enabled = newUser.is_enabled ?? user.is_enabled;
    user.username = newUser.username;

    users[newUser.username] = user;
    await this.vault.setGroup("core/users", users);
    this.socketService.emit(message.socket_id, "finish_command", {
      command: "save_user",
    });
  }

  @PluginSystem
  async handleUserLogin(username, password) {
    let users = (await this.vault.getGroup("core/users")) || {};

    // Check if the user exists
    const user = users[username];
    if (!user) {
      this.logger.error(`User not found: ${username}`);
      return false;
    }

    // Compare the provided password with the hashed password in the database
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      this.logger.error(`Invalid password for user: ${username}`);
      return false;
    }

    // Password matches, proceed with login
    this.logger.info(`User logged in: ${username}`);
    return true;
  }

  async start(): Promise<boolean> {
    //await this.vault.setGroup("core/users", {});
    //await this.vault.setGroup("core/auth_tokens", {});
    const users = await this.vault.getGroup("core/users");
    if (!users || !Object.keys(users).length) {
      const tokenSecret = await bcrypt.hash(
        "spellbook",
        await bcrypt.genSalt(10)
      );
      await this.vault.setGroup("core/users_metadata", {
        last_user_id: 1,
        secret: tokenSecret.substring(0, 14),
      });

      // setup admin user
      await this.vault.setGroup("core/users", {
        admin: {
          username: "admin",
          id: 1,
          is_admin: true,
          is_enabled: true,
          password: await bcrypt.hash("admin", 10),
        },
      });
      this.logger.info(
        `creating default user account 'admin' with password 'admin'`,
        { icon: "🔒" }
      );
    }
    return true;
  }
}

export default AuthenticationService;
