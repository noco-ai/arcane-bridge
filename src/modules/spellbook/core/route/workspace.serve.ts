import { PluginSystem } from "../../../../plugin";
import { Request, Response } from "express";
import path from "path";
import multer from "multer";
import fs from "fs";
import {
  LoggerServiceInterface,
  ServicesConstructorInterface,
  WorkspaceServiceInterface,
} from "types";

export class WorkspaceFileServe {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private workspaceService: WorkspaceServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.workspaceService = services["WorkspaceService"];
  }

  async uploadFile(req: Request, res: Response) {
    const socketId = req.query.socket_id;
    const conversationId = req.query.conversation_id;
    if (!socketId) {
      return res.status(500).json({ message: "no socket id provided" });
    }

    if (conversationId && parseInt(conversationId) !== 0) {
      await this.workspaceService.setCurrentWorkspace(
        socketId,
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
  async serveFile(req: Request, res: Response) {
    const filepath = req.params[0];
    const fullPath = path.join(
      __dirname,
      `../../../../../workspace/${filepath}`
    );

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
