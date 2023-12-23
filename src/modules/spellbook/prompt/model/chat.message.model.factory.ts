import {
  ChatConversationMessageAttributes,
  ChatConversationMessage,
} from "./chat.message.model";
import { Model, Sequelize, DataTypes } from "sequelize";

const ChatConversationMessageModelFactory = (
  sequelize: Sequelize
): typeof ChatConversationMessage => {
  ChatConversationMessage.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      icon: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      shortcuts: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      conversation_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      parent_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      active_child_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      num_children: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      files: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "chat_conversation_message",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return ChatConversationMessage;
};

export default ChatConversationMessageModelFactory;
