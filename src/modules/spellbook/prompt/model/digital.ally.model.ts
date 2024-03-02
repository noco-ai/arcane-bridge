import { Model } from "sequelize";

interface DigitalAllyAttributes {
  id: number;
  user_id: number;
  import_id: number;
  system_message?: string;
  use_model?: string;
  seed?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  min_p?: number;
  mirostat?: number;
  mirostat_tau?: number;
  mirostat_eta?: number;
  router_config?: string;
  created_at: Date;
  updated_at: Date;
  name?: string;
  wake_words?: string;
  chat_round_limits?: number;
  voice?: string;
  location_image?: string;
  character_image?: string;
  short_description?: string;
  tag_line?: string;
  conversation_tone?: string;
  sort_order?: number;
}

class DigitalAlly
  extends Model<DigitalAllyAttributes>
  implements DigitalAllyAttributes
{
  public id!: number;
  public user_id!: number;
  public import_id!: number;
  public system_message?: string;
  public use_model?: string;
  public seed?: number;
  public temperature?: number;
  public top_k?: number;
  public top_p?: number;
  public min_p?: number;
  public mirostat?: number;
  public mirostat_tau?: number;
  public mirostat_eta?: number;
  public router_config?: string;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
  public name?: string;
  public wake_words?: string;
  public chat_round_limits?: number;
  public voice?: string;
  public location_image?: string;
  public character_image?: string;
  public short_description?: string;
  public tag_line?: string;
  public conversation_tone?: string;
  public sort_order?: number;
}

export { DigitalAlly, DigitalAllyAttributes };

export default DigitalAlly;
