import { Model } from "sequelize";

interface SoundFileAttributes {
  id: number;
  user_id: number;
  filename: string;
  filepath: string;
  text: string;
  type: string;
  generation_options: string;
  model_used: string;
  size: number;
  label?: string;
}

class SoundFile
  extends Model<SoundFileAttributes>
  implements SoundFileAttributes
{
  public id: number;
  public user_id: number;
  public filename: string;
  public filepath: string;
  public text: string;
  public type: string;
  public generation_options: string;
  public model_used: string;
  public size: number;
  public label?: string;
}

export { SoundFile, SoundFileAttributes };

export default SoundFile;
