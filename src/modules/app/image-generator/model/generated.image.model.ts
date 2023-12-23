import { Model } from "sequelize";

interface GeneratedImageAttributes {
  id: number;
  prompt: string;
  guidance_scale: number;
  negative_prompt: string;
  model_name: string;
  skill_key: string;
  height: number;
  width: number;
  steps: number;
  user_id: number;
  seed: number;
  image_url: string;
}

class GeneratedImage
  extends Model<GeneratedImageAttributes>
  implements GeneratedImageAttributes
{
  public id: number;
  public prompt!: string;
  public guidance_scale!: number;
  public negative_prompt!: string;
  public model_name!: string;
  public skill_key!: string;
  public height!: number;
  public user_id!: number;
  public width!: number;
  public steps!: number;
  public seed!: number;
  public image_url!: string;
}

export { GeneratedImage, GeneratedImageAttributes };

export default GeneratedImage;
