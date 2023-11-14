import {
    DynamicFunctionAttributes,
    DynamicFunction,
  } from "./dynamic.function.model";
  import { Model, Sequelize, DataTypes } from "sequelize";
  
  const DynamicFunctionModelFactory = (
    sequelize: Sequelize
  ): typeof DynamicFunction => {
    DynamicFunction.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        definition: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        code: {
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
        }
      },
      {
        sequelize,
        tableName: "dynamic_functions",
        createdAt: "created_at",
        updatedAt: "updated_at",
      }
    );
  
    return DynamicFunction;
  };
  
  export default DynamicFunctionModelFactory;
  