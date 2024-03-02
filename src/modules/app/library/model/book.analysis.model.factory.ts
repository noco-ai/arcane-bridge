import { BookAnalysis } from "./book.analysis.model";
import { Sequelize, DataTypes } from "sequelize";

const BookAnalysisModelFactory = (
  sequelize: Sequelize
): typeof BookAnalysis => {
  BookAnalysis.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      content_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      book_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      prompt_tokens: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      completion_tokens: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      model_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      process: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      result: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "app_library_book_analysis",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return BookAnalysis;
};

export default BookAnalysisModelFactory;
