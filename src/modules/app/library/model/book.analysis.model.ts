import { Model } from "sequelize";

interface BookAnalysisAttributes {
  id: number;
  user_id: number;
  content_id: number;
  book_id: number;
  process: string;
  result: string;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
}

class BookAnalysis
  extends Model<BookAnalysisAttributes>
  implements BookAnalysisAttributes
{
  public id: number;
  public user_id: number;
  public content_id: number;
  public book_id: number;
  public process: string;
  public result: string;
  public model_name: string;
  public prompt_tokens: number;
  public completion_tokens: number;
}

export { BookAnalysis, BookAnalysisAttributes };

export default BookAnalysis;
