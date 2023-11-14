export interface SequelizeModelInterface {
  class_file: string;
  factory_file: string;
  name: string;
  module: string;
}

export interface SequelizeServiceInterface {
  start(): Promise<boolean>;
  isOnline(): boolean;
  addModel(model: SequelizeModelInterface): Promise<boolean>;
  create(modelName: string): any;
}
