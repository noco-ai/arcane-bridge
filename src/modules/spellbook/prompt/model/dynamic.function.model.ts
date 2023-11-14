import { Model } from "sequelize";
//import * as fs from "fs";
//import * as util from "util";
//import { StringifyOptions } from "querystring";
//const unlinkAsync = util.promisify(fs.unlink);

interface DynamicFunctionAttributes {
  id: number;
  definition: string;
  code: string;
  created_at: Date;
  updated_at: Date;
}

class DynamicFunction
  extends Model<DynamicFunctionAttributes>
  implements DynamicFunctionAttributes
{
  public id!: number; // primary key
  public definition!: string;
  public code!: string;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
  
  /*private extractPathFromUrl(url: string): string {
    const match = url.match(/:\/\/(www\.)?(.[^/]+)(.+)/);
    const path = (match && match[3]) || "";
    return path.startsWith("/") ? path.slice(1) : path;
  }

  public async deleteFiles(): Promise<void> {
    if (this.dataValues.files) {
      const fileList = this.dataValues.files.split(",");
      for (const file of fileList) {
        try {
          await unlinkAsync(file);
        } catch (err) {
          console.error(`Failed to delete file: ${file}`, err);
        }
      }
    }

    // Extract URLs with 'workspace/' from the content column and delete the corresponding files.
    const urlRegex = /(https?:\/\/[^\s]+\/workspace\/[^\s]+)/g;
    const urls = this.dataValues.content.match(urlRegex) || [];
    for (const url of urls) {
      const filePath = this.extractPathFromUrl(url); // You need to implement this function
      try {
        await unlinkAsync(filePath.replace(/"+$/, ""));
      } catch (err) {
        console.error(`Failed to delete file from URL: ${url}`, err);
      }
    }
  }*/
}

export { DynamicFunction, DynamicFunctionAttributes };

export default DynamicFunction;
