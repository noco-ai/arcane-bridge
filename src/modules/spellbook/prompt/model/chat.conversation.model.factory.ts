import {
  ChatConversation,
  ChatConversationAttributes,
} from "./chat.conversation.model";
import { Sequelize, DataTypes } from "sequelize";

const ChatConversationModelFactory = (
  sequelize: Sequelize
): typeof ChatConversation => {
  ChatConversation.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
      },
      is_private: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      is_shared: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      use_model: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      system_message: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      first_message_id: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      seed: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      top_k: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      top_p: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      min_p: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      mirostat: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      mirostat_tau: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      mirostat_eta: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      topic: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      temperature: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      locked: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      router_config: {
        type: DataTypes.STRING,
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
      ally_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      tableName: "chat_conversation",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return ChatConversation;
};

export default ChatConversationModelFactory;
