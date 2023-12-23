import {
  LoggerServiceInterface,
  ServicesConstructorInterface,
  VaultServiceInterface,
} from "types";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

export class AuthRoute {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private vault: VaultServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.vault = services["VaultService"];
  }

  async getToken(req: Request, res: Response) {
    try {
      const { username, password } = req.body;
      let users = (await this.vault.getGroup("core/users")) || {};
      let usersMeta = (await this.vault.getGroup("core/users_metadata")) || {};

      // Check if the user exists
      const user = users[username];
      if (!user) {
        this.logger.warn(`user not found: ${username}`);
        res.status(401).send("Invalid credentials");
        return;
      }

      // Compare the provided password with the hashed password in the database
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        this.logger.warn(`invalid password for user: ${username}`);
        res.status(401).send("Invalid credentials");
        return;
      }
      const token = jwt.sign({ username }, usersMeta.secret + user.password, {
        expiresIn: "12h",
      });

      // add token to active list
      let activeTokens = (await this.vault.getGroup("core/auth_tokens")) || {};
      activeTokens[user.username] = {
        id: user.id,
        password_hash: user.password,
      };
      await this.vault.setGroup("core/auth_tokens", activeTokens);

      this.logger.info(`created auth token for user ${user.username}`, {
        icon: "🔌",
      });
      res.cookie("token", `${user.username}::${token}`, { maxAge: 43200000 });
      res.json({ token: `${user.username}::${token}` });
    } catch (error) {
      this.logger.error("error while generating token:", {}, error);
      res.status(500).send("Internal server error");
    }
  }
}

export default AuthRoute;
