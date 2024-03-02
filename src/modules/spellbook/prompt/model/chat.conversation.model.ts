import { Model } from "sequelize";

interface ChatConversationAttributes {
  id: number;
  user_id: number;
  is_private: boolean;
  is_shared: boolean;
  use_model?: string;
  topic?: string;
  system_message?: string;
  first_message_id?: number;
  seed?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  min_p?: number;
  mirostat?: number;
  mirostat_tau?: number;
  mirostat_eta?: number;
  locked?: number;
  router_config?: string;
  created_at: Date;
  updated_at: Date;
  ally_id: number;
}

class ChatConversation
  extends Model<ChatConversationAttributes>
  implements ChatConversationAttributes
{
  public id: number;
  public user_id: number;
  public is_private: boolean;
  public is_shared: boolean;
  public use_model!: string;
  public topic!: string;
  public system_message!: string;
  public first_message_id!: number;
  public seed!: number;
  public temperature!: number;
  public top_k!: number;
  public top_p!: number;
  public min_p!: number;
  public mirostat!: number;
  public mirostat_eta!: number;
  public mirostat_tau!: number;
  public locked!: number;
  public router_config!: string;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
  public ally_id: number;
}

export { ChatConversation, ChatConversationAttributes };

export default ChatConversation;
