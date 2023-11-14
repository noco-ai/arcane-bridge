import {
  PinnedEmbeddingAttributes,
  PinnedEmbedding,
} from "./pinned.embedding.model";
import { Model, Sequelize, DataTypes } from "sequelize";

const PinnedEmbeddingModelFactory = (
  sequelize: Sequelize
): typeof PinnedEmbedding => {
  PinnedEmbedding.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      pinned_to: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      pinned_string: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      pinned_type: {
        type: DataTypes.TEXT,
        allowNull: false,
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
    },
    {
      sequelize,
      tableName: "pinned_embeddings",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return PinnedEmbedding;
};

export default PinnedEmbeddingModelFactory;
