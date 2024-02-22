import { SoundFile } from "./sound.file.model";
import { Sequelize, DataTypes } from "sequelize";

const SoundFileModelFactory = (sequelize: Sequelize): typeof SoundFile => {
  SoundFile.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      filename: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      filepath: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      label: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      model_used: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      text: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      generation_options: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      size: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "app_sound_studio_file",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return SoundFile;
};

export default SoundFileModelFactory;
