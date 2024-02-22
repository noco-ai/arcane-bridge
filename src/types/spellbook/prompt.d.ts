import { UserPermissions } from "types/core/vault";
import { ChatMessage, OnlineSkill } from "./core";

export interface ProgressBarUpdate {
  label: string;
  total: number;
  current: number;
}

export interface ActivateConversation {
  num_jobs: number;
  num_complete: number;
  router_config: string[];
  user_permissions: UserPermissions;
  icons: string[];
  user_shortcuts: string;
  shortcuts: string;
  reasoning_agent: OnlineSkill;
  conversation_id: number;
  parent_id: number;
  user_files: string[];
  use_model: string;
  is_visual_model: boolean;
  img_file: string;
  user_message_id: number;
  skill_config: any;
  model_manually_selected: boolean;
  function_manually_selected: boolean;
  function_custom_extractor: boolean;
  cursor_in_use: boolean;
  cursor_index: number;
  cursor_tail: string;
  guessed_function: null | any;
  user_id: number;
  start_response: string;
  generated_files: string[];
}

export interface EmbeddingInfo {
  num_skill_moe_domains: number;
  num_skill_moe_functions: number;
  num_chat_functions: number;
  embeddings: string[];
  skill_domain_shortcuts: any;
  skill_function_shortcuts: any;
  dynamic_functions: any;
  embeddings_loaded: boolean;
  pinned_functions: any;
}

export interface LoadedEmbeddings {
  skill_function_map: any;
  skill_domain_map: any;
  chat_function_map: any;
  chat_function_parameters_map: any;
}

export interface AsyncJob {
  resolve: any;
  reject: any;
}

export interface ChatAbilityInterface {
  isReady(): boolean;
}

export interface AbilityResponseHelperInterface {
  sendError(error: any, socketId: string): Promise<boolean>;
  clearEmbeddings(): void;
  simpleChatPayload(systemPrompt: string, userPrompt: string): ChatMessage[];
  updateProgressBar(
    progressData: ProgressBarUpdate,
    socketId: string
  ): Promise<boolean>;
  sendResponseWithCursor(
    response: string,
    cursor: string,
    socketId: string
  ): Promise<boolean>;
  mergeConfig(skillConfig: Object, payload: Object): any;
  resetCursor(socketId: string): Promise<boolean>;
  getActiveConversationParameter(
    socketId: string,
    parameter: string
  ): Promise<any>;
  sendResponse(
    response: string,
    textOnlyResponse: string | null,
    socketId: string,
    files?: string[]
  ): Promise<boolean>;
}
