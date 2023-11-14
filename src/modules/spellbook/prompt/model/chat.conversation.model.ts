import { Model } from "sequelize";

interface ChatConversationAttributes {
  id: number;
  is_private: boolean;
  is_shared: boolean;
  use_model?: string;
  topic?: string;
  system_message?: string;
  seed?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  locked?: number;
  router_config?: string;
  created_at: Date;
  updated_at: Date;
}

class ChatConversation
  extends Model<ChatConversationAttributes>
  implements ChatConversationAttributes
{
  public id!: number;
  public is_private!: boolean;
  public is_shared!: boolean;
  public use_model!: string;
  public topic!: string;
  public system_message!: string;
  public seed!: number;
  public temperature!: number;
  public top_k!: number;
  public top_p!: number;
  public locked!: number;
  public router_config!: string;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

export { ChatConversation, ChatConversationAttributes };

export default ChatConversation;
