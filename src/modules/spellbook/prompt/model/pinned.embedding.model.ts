import { Model } from "sequelize";

interface PinnedEmbeddingAttributes {
  id: number;
  pinned_to: string;
  pinned_string: string;
  pinned_type: string;
  created_at: Date;
  updated_at: Date;
}

class PinnedEmbedding
  extends Model<PinnedEmbeddingAttributes>
  implements PinnedEmbeddingAttributes
{
  public id!: number;
  public pinned_to!: string;
  public pinned_string!: string;
  public pinned_type!: string;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

export { PinnedEmbedding, PinnedEmbeddingAttributes };

export default PinnedEmbedding;
