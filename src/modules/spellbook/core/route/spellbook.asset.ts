import { PluginSystem } from "../../../../plugin";
import path from "path";
import fs from "fs";
import { LoggerServiceInterface, ServicesConstructorInterface } from "types";
import { Request, Response } from "express";

export class SpellbookAssetRoute {
  private services: ServicesConstructorInterface;
  private logger: LoggerServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    this.services = services;
    this.logger = services["LoggerService"];
  }

  @PluginSystem
  serveFile(req: Request, res: Response) {
    const { companyname, modulename, assetname } = req.params;

    const filePath = path.join(
      __dirname,
      `../../../../../src/modules/${companyname}/${modulename}/asset/${assetname}`
    );

    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        this.logger.warn(
          `file not found src/modules/${companyname}/${modulename}/asset/${assetname}`
        );
        res.status(404).send("file not found");
      } else {
        res.sendFile(filePath);
      }
    });
  }
}

export default SpellbookAssetRoute;
