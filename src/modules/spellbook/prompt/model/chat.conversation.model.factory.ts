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
