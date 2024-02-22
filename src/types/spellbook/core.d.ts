export interface SkillModel {
  name: string;
  provider: string;
}

export interface AmqpGolemMessageHeaders {
  success: boolean;
  errors: string[];
  socket_id?: string;
  model_used?: string;
  [key: string]: any;
}

export interface AmqpGolemMessage {
  properties: {
    headers: AmqpGolemMessageHeaders;
  };
  content: string;
}

export interface SkillRepo {
  url: string;
  folder: string;
}

export interface SkillConfig {
  name: string;
  label: string;
  routing_key: string;
  use: string[];
  available_precision: Record<string, unknown>;
  memory_usage: Record<string, unknown>;
  model: SkillModel[];
  raw: string;
  handler_key: string;
  configuration: Record<string, unknown>;
  configuration_template: Record<string, unknown>;
  repository: SkillRepo[];
  multi_gpu_support: boolean;
  shortcut: string;
  moe_domain: string[];
  moe_function: string[];
}

export interface ChatAbilityParameter {
  name: string;
  required: boolean;
  description: string[];
  type: string;
}

export interface ChatAbilityConfig {
  label: string;
  spell_label: string;
  function_definition: string[];
  allow_empty_parameters: boolean;
  wait_message: string;
  icon: string;
  unique_key: string;
  module_key: string;
  shortcut: string;
  class_file: string;
  execute_function: string;
  sort_order: number;
  extractor_function?: string;
  skill_dependencies?: string[];
  parameters?: ChatAbilityParameter[];
}

export interface OnlineSkillInstance {
  server_id: number;
  device: string;
  use_precision: string;
  thread_status: string;
}

export interface OnlineSkill {
  device: string;
  routing_key: string;
  ram: number;
  use_precision: string;
  thread_status: string;
  shortcut: string;
  use: string[];
  label: string;
  moe_function: string[];
  moe_domain: string[];
  instances: OnlineSkillInstance[];
}

export interface ServerData {
  server_id: number;
  running_skills: OnlineSkill[];
  installed_skills: SkillConfig[];
}

export interface SkillStatus {
  skill: string;
  class_name: string;
}

export interface ChatMessage {
  content: string;
  role: string;
}

export interface PromptProcessor {
  label: string;
  class_file: string;
  execute_function: string;
  type: string;
  target: string;
  unique_key: string;
  class_instance?: Object;
}

export interface PromptProcessors {
  preprocessor: PromptProcessor[];
  postprocessor: PromptProcessor[];
}

export interface MenuItem {
  label: string;
  spell_label: string;
  items: MenuItem[] | null;
  sort_order: number;
  item_module: string;
  icon: string;
  admin_only: boolean;
  routerLink: string;
  settings_link: string;
  style: string;
}

export interface SpellbookVaultConfig {
  vault_path: string;
  options: any[];
}

export interface SpellbookConfig {
  visible: boolean;
  label: string;
  spell_label: string;
  module: string;
  description: string;
  icon: string;
  card: string;
  configuration: SpellbookVaultConfig;
  unique_key: string;
  skill_dependencies: string[];
  type: string;
  is_installed: boolean;
  can_remove: boolean;
  chat_ability: ChatAbilityConfig[];
  skill_status: SkillStatus[];
}

export interface SocketMessage {
  event: string;
  socket_id: string;
  user_id: number;
  payload: any;
}

export interface SpellbookServiceInterface {
  setMenu(menu: MenuItem[]): boolean;
  setSpellDetails(spellDetails: SpellbookConfig[]): boolean;
  setChatAbilities(chatAbilities: ChatAbilityConfig[]): boolean;
  getSpellByKey(uniqueKey: string): SpellbookConfig;
  getChatAbilityByKey(uniqueKey: string): ChatAbilityConfig;
  getChatAbilities(): ChatAbilityConfig[];
  setPrompts(prompts: Map<string, Map<string, string>>): boolean;
  getPrompt(module: string, promptKey: string): string | null | any;
  getPrompts(module: string): Map<string, ChatMessage[] | string> | null;
  getReasoningAgent(modelType?: string): Promise<string>;
  publishCommand(
    exchange: string,
    routingKey: string,
    command: string,
    payload: any,
    customerHeaders?: any
  ): Promise<boolean>;
  sendToastMessage(
    socketId: string,
    summary: string,
    detail: string,
    severity: string
  ): Promise<boolean>;
  handleGetConfiguration(message: SocketMessage): Promise<boolean>;
  handleRunSkill(message: SocketMessage): Promise<boolean>;
  handleInstallSkill(message: SocketMessage): Promise<boolean>;
  handleStopSkill(message: SocketMessage): Promise<boolean>;
  handleUpdateModule(message: SocketMessage): Promise<boolean>;
  handleGetMenu(message: SocketMessage): Promise<boolean>;
  handleSpellList(message: SocketMessage): Promise<boolean>;
  handleWorkerReport(message: SocketMessage): Promise<boolean>;
  handleConfigureSkill(message: SocketMessage): Promise<boolean>;
  processMessageQueue(message): Promise<boolean>;
  getOnlineSkills(): OnlineSkill[];
  getShortcutSkill(shortcut: string): string;
  getShortcutFunction(shortcut: string): string;
  simulateFragment(socketMessage: any, text: string, tokensPerSecond: number);
  getSkillFromKey(skillKey: string): SkillConfig;
  getOnlineSkillFromKey(skillKey: string): OnlineSkill;
  getOnlineSkillFromType(skillType: string): string[];
  setPromptProcessors(promptProcessors: PromptProcessors): void;
  getPromptProcessors(): PromptProcessors;
  start(): Promise<boolean>;
  afterConfig();
}

export interface WorkspaceDetails {
  baseWorkspace: string;
  currentWorkspace: string;
}

export interface WorkspaceServiceInterface {
  copyFileDirect(source: string, destination: string): Promise<void>;
  moveFilesToCurrentWorkspace(
    socketId: string,
    files: string[]
  ): Promise<string[]>;
  setWorkspace(
    socketId: string,
    userId: number,
    baseWorkspace: string,
    currentWorkspace: string
  ): Promise<void>;
  setCurrentWorkspace(
    socketId: string,
    userId: number,
    currentWorkspace: string,
    createDirectory?: boolean
  ): Promise<void>;
  getNextFile(
    socketId: string,
    prefix: string,
    fileType: string
  ): Promise<string>;
  cleanupWorkspace(socketId: string, userId: number): void;
  getList(socketId: string, fileType?: string): Promise<string[] | null>;
  getNewestImage(socketId: string): Promise<string | null>;
  saveFile(
    socketId: string,
    fileName: string,
    content: string | Buffer,
    currentWorkspace?: boolean
  ): Promise<string>;
  saveFileByUserId(
    userId: number,
    fileName: string,
    content: string | Buffer,
    currentWorkspace?: boolean
  ): Promise<string>;
  createFolder(socketId: string, folderPath: string);
  createFolderByUserId(userId: number, folderPath: string);
  deleteFile(socketId: string, fileName: string): Promise<void>;
  deleteFileDirect(fileName: string): Promise<void>;
  getFileUrl(
    socketId: string,
    filePath: string,
    accessCount?: number
  ): Promise<string | null>;

  getUserFileUrl(
    userId: number,
    filePath: string,
    accessCount?: number
  ): Promise<string>;

  checkInWorkspaces(socketId: string, filePath: string): Promise<string | null>;
  getWorkspaceFolder(socketId: string): string;
  getWorkspaceDetails(socketId: string): WorkspaceDetails;
  deleteFolder(folderPath: string): Promise<void>;
  checkTempAccessKey(key: string): number;
}
