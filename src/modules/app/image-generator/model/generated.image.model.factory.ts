import { GeneratedImage } from "./generated.image.model";
import { Sequelize, DataTypes } from "sequelize";

const GeneratedImageModelFactory = (
  sequelize: Sequelize
): typeof GeneratedImage => {
  GeneratedImage.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      prompt: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      guidance_scale: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      negative_prompt: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      model_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      skill_key: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      height: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      width: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      steps: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      seed: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      image_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "app_generated_image",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return GeneratedImage;
};

export default GeneratedImageModelFactory;
