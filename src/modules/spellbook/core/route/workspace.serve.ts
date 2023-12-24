import { PluginSystem } from "../../../../plugin";
import { Request, Response } from "express";
import path from "path";
import multer from "multer";
import fs from "fs";
import {
  LoggerServiceInterface,
  ServicesConstructorInterface,
  UserAuthentication,
  VaultServiceInterface,
  WorkspaceServiceInterface,
} from "types";

export class WorkspaceFileServe {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private workspaceService: WorkspaceServiceInterface;
  private vault: VaultServiceInterface;
  private tokenCache: Map<string, UserAuthentication>;
  private idMap: Map<number, string>;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.workspaceService = services["WorkspaceService"];
    this.vault = services["VaultService"];
    this.tokenCache = new Map();
    this.idMap = new Map();
  }

  async uploadFile(req: Request, res: Response) {
    const socketId = req.query.socket_id;
    const conversationId = req.query.conversation_id;
    if (!socketId)
      return res.status(500).json({ message: "no socket id provided" });

    // validate auth token
    let userId = 0;
    if (req.cookies.token) {
      userId = await this.vault.validateAuthToken(
        req.cookies.token,
        socketId,
        "workspace_upload_file"
      );
    }
    if (!userId)
      return res.status(401).json({ message: "invalid token provided" });

    if (conversationId && parseInt(conversationId) !== 0) {
      await this.workspaceService.setCurrentWorkspace(
        socketId,
        userId,
        `chats/chat-${conversationId}`,
        true
      );
    }
    const saveFolder = this.workspaceService.getWorkspaceFolder(socketId);

    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, `./${saveFolder}`);
      },
      filename: (req, file, cb) => {
        cb(null, file.originalname);
      },
    });

    const upload = multer({ storage: storage }).single("file");
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        this.logger.error("multer error: " + err.message);
        return res
          .status(500)
          .json({ error: true, message: "multer error: " + err.message });
      } else if (err) {
        this.logger.error("multer error: " + err);
        return res
          .status(500)
          .json({ error: true, message: "unknown error: " + err });
      }

      if (req.file) {
        this.logger.info(
          `file ${req.file.originalname} uploaded to ${saveFolder}`,
          { icon: "💾" }
        );
        res.json({
          error: false,
          message: "success",
          file: path.join(saveFolder, req.file.originalname),
        });
      } else {
        res.status(400).json({
          error: true,
          message: "no file uploaded",
        });
      }
    });
  }

  @PluginSystem
  async handleSocketDisconnect(socketData) {
    if (!this.idMap.has(socketData.user_id)) return;
    const username = this.idMap.get(socketData.user_id);
    this.idMap.delete(socketData.user_id);
    this.tokenCache.delete(username);
  }

  @PluginSystem
  async serveFile(req: Request, res: Response) {
    const filepath: string = req.params[0];
    const fullPath = path.join(
      __dirname,
      `../../../../../workspace/${filepath}`
    );

    let username = null;
    let userId: number = 0;
    if (req.cookies.token) {
      const tokenData = req.cookies.token.split("::");
      username = tokenData[0];

      // use cache if not first request
      if (this.tokenCache.has(username)) {
        const userData = this.tokenCache.get(username);
        userId = await this.vault.validateAuthToken(
          req.cookies.token,
          null,
          "workspace_serve_file",
          userData
        );
      } else {
        userId = await this.vault.validateAuthToken(
          req.cookies.token,
          null,
          "workspace_serve_file"
        );
      }
    }

    let bypassChecks = 0;
    if (!userId || filepath.indexOf(`${userId}/`) !== 0) {
      if (req.query?.key)
        bypassChecks = this.workspaceService.checkTempAccessKey(req.query.key);

      if (!bypassChecks) return res.status(401).send("invalid token provided");
    }

    if (!bypassChecks && !this.tokenCache.has(username)) {
      const userData = await this.vault.getAuthUser(req.cookies.token);
      if (userData) {
        this.tokenCache.set(username, userData);
        this.idMap.set(userData.id, username);
      }
    }

    fs.access(fullPath, fs.constants.F_OK, (err) => {
      if (err) {
        this.logger.warn(`file not found workspace/${filepath}`);
        res.status(404).send("file not found");
      } else {
        res.sendFile(fullPath);
      }
    });
  }
}

export default WorkspaceFileServe;
