import { Model } from "sequelize";
import * as fs from "fs";
import * as util from "util";
const unlinkAsync = util.promisify(fs.unlink);

interface ChatConversationMessageAttributes {
  id: number; // primary key
  content: string;
  icon: string;
  shortcuts: string;
  role: "user" | "assistant"; // role can only be either "user" or "assistant"
  conversation_id: number;
  user_id: number;
  parent_id: number | null; // foreign key to refer back to parent message, can be null if no parent
  active_child_id: number | null; // foreign key for the active child message, can be null if no child message is active
  num_children: number; // number of child messages
  created_at: Date;
  updated_at: Date;
  files: string;
}

class ChatConversationMessage
  extends Model<ChatConversationMessageAttributes>
  implements ChatConversationMessageAttributes
{
  public id!: number; // primary key
  public content!: string;
  public icon!: string;
  public shortcuts!: string;
  public role!: "user" | "assistant"; // role can only be either "user" or "assistant"
  conversation_id: number;
  user_id: number;
  public parent_id!: number | null; // foreign key to refer back to parent message, can be null if no parent
  public active_child_id!: number | null; // foreign key for the active child message, can be null if no child message is active
  public num_children!: number; // number of child messages
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
  public files!: string;

  private extractPathFromUrl(url: string): string {
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
  }
}

export { ChatConversationMessage, ChatConversationMessageAttributes };

export default ChatConversationMessage;
