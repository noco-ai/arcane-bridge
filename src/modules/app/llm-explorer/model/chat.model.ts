import { Model } from "sequelize";

interface LlmExplorerChatAttributes {
  id: number;
  user_id: number;
  system_message: string;
  temperature: number;
  top_k: number;
  top_p: number;
  min_p: number;
  mirostat: number;
  mirostat_eta: number;
  mirostat_tau: number;
  seed: number;
  unique_key: string;
  examples: string;
  created_at: Date;
  updated_at: Date;
}

class LlmExplorerChat
  extends Model<LlmExplorerChatAttributes>
  implements LlmExplorerChatAttributes
{
  public id: number;
  public user_id: number;
  public system_message: string;
  public temperature: number;
  public top_k: number;
  public top_p: number;
  public min_p: number;
  public mirostat: number;
  public mirostat_eta: number;
  public mirostat_tau: number;
  public seed: number;
  public unique_key: string;
  public examples: string;
  public readonly created_at: Date;
  public readonly updated_at: Date;
}

export { LlmExplorerChat, LlmExplorerChatAttributes };

export default LlmExplorerChat;
