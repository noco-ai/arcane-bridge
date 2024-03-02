import { Model } from "sequelize";

interface BookAttributes {
  id: number;
  user_id: number;
  title: string;
  cover: string;
  filename: string;
  author: string;
  num_pages: number;
  description: string;
}

class Book extends Model<BookAttributes> implements BookAttributes {
  public id: number;
  public user_id: number;
  public filename: string;
  public cover: string;
  public author!: string;
  public title!: string;
  public num_pages!: number;
  public description!: string;
}

export { Book, BookAttributes };

export default Book;
