import { promises as fs } from "fs";
import path from "path";
import {
  EmptyCliOptions,
  LoggerServiceInterface,
  ServicesConstructorInterface,
  VaultServiceInterface,
  WorkspaceServiceInterface,
} from "types";
import { v4 as uuidv4 } from "uuid";

interface WorkspaceDetails {
  baseWorkspace: string;
  currentWorkspace: string;
}

export class WorkspaceService implements WorkspaceServiceInterface {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;
  private vaultService: VaultServiceInterface;
  private workspaces: Map<string, WorkspaceDetails> = new Map();
  private tempAccessKeys: Map<string, number> = new Map();
  private readonly workingDir: string = "./workspace/";

  constructor(
    cliOptions: EmptyCliOptions,
    services: ServicesConstructorInterface
  ) {
    this.services = services;
    this.logger = services["LoggerService"];
    this.vaultService = services["VaultService"];
  }

  async moveFilesToCurrentWorkspace(
    socketId: string,
    files: string[]
  ): Promise<string[]> {
    try {
      this.logger.info(`moving files to current workspace`, { icon: "💾" });
      const workspaceDetails = this.workspaces.get(socketId) || null;
      const moveTo = workspaceDetails.currentWorkspace;
      if (!(await fs.access(moveTo).catch(() => undefined))) {
        await fs.mkdir(moveTo, { recursive: true });
      }
      const newPaths: string[] = [];

      for (const filePath of files) {
        let fileName = path.basename(filePath);
        let newPath = path.join(moveTo, fileName);
        await fs.rename(filePath, newPath);
        newPaths.push(newPath);
      }
      return newPaths;
    } catch (error) {
      throw new Error(`Error moving files: ${error.message}`);
    }
  }

  async setWorkspace(
    socketId: string,
    userId: number,
    baseWorkspace: string,
    currentWorkspace: string
  ): Promise<void> {
    baseWorkspace = path.join(
      this.workingDir,
      path.join("" + userId, baseWorkspace)
    );
    currentWorkspace = baseWorkspace;
    await fs.mkdir(baseWorkspace, { recursive: true });
    //await fs.mkdir(currentWorkspace, { recursive: true });
    this.workspaces.set(socketId, { baseWorkspace, currentWorkspace });
    this.logger.info(
      `setting workspaces for socket ${socketId} to ${baseWorkspace}`,
      { icon: "📂" }
    );
  }

  async setCurrentWorkspace(
    socketId: string,
    userId: number,
    currentWorkspace: string,
    createDirectory: boolean = false
  ): Promise<void> {
    currentWorkspace =
      path.join(this.workingDir, path.join("" + userId, currentWorkspace)) +
      "/";

    const workspaceDetails = this.workspaces.get(socketId);
    workspaceDetails.currentWorkspace = currentWorkspace;
    this.workspaces.set(socketId, workspaceDetails);
    if (createDirectory) {
      await fs.mkdir(currentWorkspace, { recursive: true });
    }

    // log the workspace update
    this.logger.info(
      `setting workspace for socket ${socketId} to ${currentWorkspace}`,
      { icon: "📂" }
    );
  }

  async getNextFile(
    socketId: string,
    prefix: string,
    fileType: string
  ): Promise<string> {
    const files = await this.getList(socketId, fileType);
    if (!files) return `${prefix}01.${fileType}`;

    // Filter files by the provided prefix
    const matchingFiles = files.filter(
      (file) => file.startsWith(prefix) && file.endsWith(fileType)
    );

    // Extract the numeric portions of the matching filenames
    const numbers = matchingFiles.map((file) => {
      const numStr = file.slice(prefix.length, file.length - fileType.length);
      return parseInt(numStr, 10);
    });

    // Find the next available number
    let nextNumber = 1;
    while (numbers.includes(nextNumber)) {
      nextNumber++;
    }

    return `${prefix}${String(nextNumber).padStart(2, "0")}.${fileType}`;
  }

  cleanupWorkspace(socketId: string): void {
    this.workspaces.delete(socketId);
    this.logger.info(`cleaning up workspace for socket ${socketId}`, {
      icon: "🗑",
    });
  }

  // Get a list of all files in the working directory (or optionally by file type)
  async getList(socketId: string, fileType?: string): Promise<string[]> {
    const workspaceDetails = this.workspaces.get(socketId) || null;
    if (!workspaceDetails) return null;
    await fs.mkdir(workspaceDetails.currentWorkspace, { recursive: true });
    const files = await fs.readdir(workspaceDetails.currentWorkspace);
    if (fileType) {
      return files.filter((file) => path.extname(file) === `.${fileType}`);
    }
    return files;
  }

  async getNewestImage(socketId: string): Promise<string | null> {
    const workspaceDetails = this.workspaces.get(socketId) || null;
    if (!workspaceDetails) {
      return null;
    }

    await fs.mkdir(workspaceDetails.currentWorkspace, { recursive: true });
    const files = await fs.readdir(workspaceDetails.currentWorkspace);

    // Filtering for common image extensions. You can expand this list if needed.
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];
    const imageFiles = files.filter((file) =>
      imageExtensions.includes(path.extname(file).toLowerCase())
    );

    if (imageFiles.length === 0) {
      return null;
    }

    // Fetching file stats for each image to determine the newest by modification time.
    let newestImageFile: string | null = null;
    let newestTime: number = 0;

    for (const file of imageFiles) {
      const stats = await fs.stat(
        path.join(workspaceDetails.currentWorkspace, file)
      );
      if (stats.mtimeMs > newestTime) {
        newestTime = stats.mtimeMs;
        newestImageFile = file;
      }
    }

    return newestImageFile;
  }

  // Save a file with the given content to the working directory
  async saveFile(
    socketId: string,
    fileName: string,
    content: string | Buffer,
    currentWorkspace: boolean = true
  ): Promise<string> {
    const workspaceDetails = this.workspaces.get(socketId) || null;
    if (!workspaceDetails) return null;
    let savePath = "";
    if (currentWorkspace) {
      await fs.mkdir(workspaceDetails.currentWorkspace, { recursive: true });
      savePath = path.join(workspaceDetails.currentWorkspace, fileName);
    } else {
      savePath = path.join(workspaceDetails.baseWorkspace, fileName);
    }
    this.logger.info(`saving workspace file ${savePath}`);
    await fs.writeFile(savePath, content);
    return savePath;
  }

  // Delete a file from the working directory
  async deleteFile(socketId: string, fileName: string): Promise<void> {
    const workspaceDetails = this.workspaces.get(socketId) || null;
    await fs.unlink(path.join(workspaceDetails.currentWorkspace, fileName));
  }

  private async checkIfExists(filePath: string): Promise<boolean> {
    try {
      await fs.stat(filePath);
      return true;
    } catch (err) {
      return false;
    }
  }

  async getFileUrl(
    socketId: string,
    filePath: string,
    accessCount: number = 0
  ): Promise<string | null> {
    const fullPath = await this.checkInWorkspaces(socketId, filePath);
    if (!fullPath) return null;

    const baseUrl = this.vaultService.getWorkspaceUrl();
    if (accessCount) {
      const accessKey = uuidv4();
      this.tempAccessKeys.set(accessKey, accessCount);
      return baseUrl + fullPath + `?key=` + encodeURIComponent(accessKey);
    }
    return baseUrl + fullPath;
  }

  checkTempAccessKey(key: string): number {
    if (!this.tempAccessKeys.has(key)) return 0;
    const last = this.tempAccessKeys.get(key);
    if (last > 1) this.tempAccessKeys.set(key, last - 1);
    else this.tempAccessKeys.delete(key);
    return last;
  }

  async createFolder(socketId: string, folderPath: string) {
    const workspaceDetails = this.workspaces.get(socketId) || null;
    if (!workspaceDetails) return null;
    const newFolder = path.join(workspaceDetails.baseWorkspace, folderPath);
    await fs.mkdir(newFolder, { recursive: true });
  }

  async checkInWorkspaces(
    socketId: string,
    filePath: string
  ): Promise<string | null> {
    if (!this.workspaces.has(socketId)) return null;

    const checkWorkspace = this.workspaces.get(socketId);
    if (!checkWorkspace.currentWorkspace) return null;
    const filePathCurrent = path.join(
      checkWorkspace.currentWorkspace,
      filePath
    );
    if (await this.checkIfExists(filePathCurrent)) {
      return filePathCurrent;
    }

    const filePathBase = path.join(checkWorkspace.baseWorkspace, filePath);
    if (await this.checkIfExists(filePathBase)) {
      return filePathBase;
    }
    return null;
  }

  getWorkspaceFolder(socketId: string) {
    const workspaceDetails = this.workspaces.get(socketId) || null;
    if (!workspaceDetails) return this.workingDir;
    return workspaceDetails.currentWorkspace;
  }

  deleteFolder(folderPath: string) {
    return fs
      .stat(folderPath)
      .then((stats) => {
        if (stats.isDirectory()) {
          return fs
            .readdir(folderPath)
            .then((files) => {
              const promises = files.map((file) => {
                const curPath = path.join(folderPath, file);
                return this.deleteFolder(curPath);
              });

              return Promise.all(promises);
            })
            .then(() => fs.rmdir(folderPath));
        } else {
          return fs.unlink(folderPath);
        }
      })
      .catch((err) => {
        if (err.code === "ENOENT") {
          return;
        }
        throw err;
      });
  }

  async start(): Promise<boolean> {
    return true;
  }
}

export default WorkspaceService;
