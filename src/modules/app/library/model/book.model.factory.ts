import { Book } from "./book.model";
import { Sequelize, DataTypes } from "sequelize";

const BookModelFactory = (sequelize: Sequelize): typeof Book => {
  Book.init(
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
      title: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      cover: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      num_pages: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      filename: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      author: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "app_library_book",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return Book;
};

export default BookModelFactory;
