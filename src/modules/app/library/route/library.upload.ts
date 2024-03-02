import { PluginSystem } from "../../../../plugin";
import { Request, Response } from "express";
import path from "path";
import multer from "multer";
import { promises as fs } from "fs";
import {
  LoggerServiceInterface,
  SequelizeServiceInterface,
  ServicesConstructorInterface,
  UserAuthentication,
  VaultServiceInterface,
  WorkspaceServiceInterface,
} from "types";
//import { fileURLToPath } from "url";
import EPub from "epub";
import crypto from "crypto";

export class LibraryUpload {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private workspaceService: WorkspaceServiceInterface;
  private vault: VaultServiceInterface;
  private modelService: SequelizeServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.workspaceService = services["WorkspaceService"];
    this.vault = services["VaultService"];
    this.modelService = services["SequelizeService"];
  }

  async uploadFile(req: Request, res: Response) {
    const socketId = req.query.socket_id;
    if (!socketId)
      return res.status(500).json({ message: "no socket id provided" });

    // validate auth token
    let userId = 0;
    if (req.headers.authorization) {
      userId = await this.vault.validateAuthToken(
        req.headers.authorization,
        socketId,
        "workspace_upload_file"
      );
    }
    if (!userId)
      return res.status(401).json({ message: "invalid token provided" });

    const saveFolder =
      this.workspaceService.getWorkspaceDetails(socketId)?.baseWorkspace;

    if (!saveFolder) {
      return res
        .status(500)
        .json({ error: true, message: "invalid workspace folder" });
    }

    const tempUploadPath = `./${saveFolder}/apps/library/temp`;
    await fs.mkdir(tempUploadPath, { recursive: true });
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, tempUploadPath);
      },
      filename: (req, file, cb) => {
        cb(null, file.originalname);
      },
    });

    const upload = multer({ storage: storage }).single("file");
    upload(req, res, async (err) => {
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
        const tempFilePath = path.join(tempUploadPath, req.file.originalname);
        const fileBuffer = await fs.readFile(tempFilePath);
        const hash = crypto.createHash("sha1").update(fileBuffer).digest("hex");
        const finalFilePath = path.join(
          `./${saveFolder}/apps/library`,
          `${hash.substring(0, 10)}.epub`
        );

        // Check if file with the same hash already exists
        const fileExists = async (path) =>
          !!(await fs.stat(path).catch((e) => false));

        if (await fileExists(finalFilePath)) {
          await fs.unlink(tempFilePath);
          return res
            .status(409)
            .json({ error: true, message: "File already exists" });
        }
        await fs.rename(tempFilePath, finalFilePath);

        this.logger.info(
          `file ${req.file.originalname} uploaded to ${saveFolder}`,
          { icon: "📚" }
        );

        const newBook = await this.processEpub(`./${finalFilePath}`, userId);
        res.json({
          error: false,
          message: "success",
          file: path.join(saveFolder, req.file.originalname),
          book_id: newBook.id,
        });
      } else {
        res.status(400).json({
          error: true,
          message: "no file uploaded",
        });
      }
    });
  }

  private async getCoverImage(epub, savePath: string): Promise<string> {
    if (!epub) {
      throw new Error("EPub file not loaded");
    }

    const coverId = epub.metadata.cover;
    if (!coverId) {
      throw new Error("No cover image found");
    }

    const { imgBuffer, mimeType } = await new Promise<{
      imgBuffer: Buffer;
      mimeType: string;
    }>((resolve, reject) => {
      epub.getImage(coverId, (error, img, mimeType) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ imgBuffer: img, mimeType });
      });
    });

    // Determine the file extension based on MIME type
    let extension;
    switch (mimeType) {
      case "image/jpeg":
        extension = ".jpg";
        break;
      case "image/png":
        extension = ".png";
        break;
      // Add more cases as needed for different MIME types
      default:
        throw new Error(`Unsupported image format: ${mimeType}`);
    }

    const fullPath = `${savePath}${extension}`;
    await fs.writeFile(fullPath, imgBuffer);
    console.log(`Cover image saved to ${fullPath}`);
    return fullPath;
  }

  private async loadEpub(epub): Promise<void> {
    return new Promise((resolve, reject) => {
      epub.on("end", resolve);
      epub.on("error", reject);
      epub.parse();
    });
  }

  private async processEpub(path: string, userId: number) {
    const ePub = new EPub(path);
    await this.loadEpub(ePub);
    const metadata = ePub.metadata;
    const book = this.modelService.create("LibraryBook");
    const image = await this.getCoverImage(ePub, path.replace(".epub", ""));
    const newBook = await book.create({
      title: metadata.title,
      author: metadata.creator,
      filename: path.replace("./", ""),
      cover: image.replace("./", ""),
      user_id: userId,
    });
    return newBook;
  }
}

export default LibraryUpload;
