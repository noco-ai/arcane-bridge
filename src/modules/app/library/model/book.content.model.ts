import { Model } from "sequelize";

interface BookContentAttributes {
  id: number;
  user_id: number;
  book_id: number;
  file: string;
  processed_analysis: string;
  content: string;
  word_count: number;
  length: number;
  content_index: number;
}

class BookContent
  extends Model<BookContentAttributes>
  implements BookContentAttributes
{
  id: number;
  user_id: number;
  book_id: number;
  file!: string;
  processed_analysis!: string;
  content: string;
  word_count: number;
  length: number;
  content_index: number;
}

export { BookContent, BookContentAttributes };

export default BookContent;
