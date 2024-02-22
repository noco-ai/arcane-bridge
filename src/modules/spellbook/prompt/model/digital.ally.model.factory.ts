import { DigitalAlly, DigitalAllyAttributes } from "./digital.ally.model";
import { Sequelize, DataTypes } from "sequelize";

const DigitalAllyModelFactory = (sequelize: Sequelize): typeof DigitalAlly => {
  DigitalAlly.init(
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
      import_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: 0,
      },
      system_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      use_model: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      seed: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: -1,
      },
      temperature: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 1,
      },
      top_k: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: 50,
      },
      top_p: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0.9,
      },
      min_p: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0.05,
      },
      mirostat: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: 0,
      },
      mirostat_tau: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 5,
      },
      mirostat_eta: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0.1,
      },
      router_config: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      wake_words: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      chat_round_limits: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      voice: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      location_image: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      character_image: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      short_description: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      tag_line: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      conversation_tone: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "digital_ally",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return DigitalAlly;
};

export default DigitalAllyModelFactory;
