import { BookContent } from "./book.content.model";
import { Sequelize, DataTypes } from "sequelize";

const BookContentModelFactory = (sequelize: Sequelize): typeof BookContent => {
  BookContent.init(
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
      book_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      file: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      processed_analysis: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "[]",
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      length: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      word_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      content_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "app_library_book_content",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return BookContent;
};

export default BookContentModelFactory;
