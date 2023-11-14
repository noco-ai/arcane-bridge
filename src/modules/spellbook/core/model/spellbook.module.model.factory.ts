import { SpellbookModule } from "./spellbook.module.model";
import { Sequelize, DataTypes } from "sequelize";

const SpellbookModuleModelFactory = (
  sequelize: Sequelize
): typeof SpellbookModule => {
  SpellbookModule.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      unique_key: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      current_version: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    },
    {
      sequelize,
      tableName: "spellbook_module",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return SpellbookModule;
};

export default SpellbookModuleModelFactory;
