import { LlmExplorerChat, LlmExplorerChatAttributes } from "./chat.model";
import { Sequelize, DataTypes } from "sequelize";

const LlmExplorerChatModelFactory = (
  sequelize: Sequelize
): typeof LlmExplorerChat => {
  LlmExplorerChat.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      system_message: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      top_k: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      top_p: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      min_p: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      mirostat: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      mirostat_eta: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      mirostat_tau: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      unique_key: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      temperature: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      examples: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      seed: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "app_llm_explorer_chat",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return LlmExplorerChat;
};

export default LlmExplorerChatModelFactory;
