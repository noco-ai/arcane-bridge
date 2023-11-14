import { Model } from "sequelize";

interface SpellbookModuleAttributes {
  id: number;
  unique_key: string;
  current_version: string;
  status: string;
  updated_at: Date;
}

class SpellbookModule
  extends Model<SpellbookModuleAttributes>
  implements SpellbookModuleAttributes
{
  public id!: number;
  public unique_key!: string;
  public current_version!: string;
  public status!: string;
  public readonly updated_at!: Date;
}

export { SpellbookModule, SpellbookModuleAttributes };

export default SpellbookModule;
