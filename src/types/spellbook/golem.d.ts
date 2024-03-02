export interface LlmResponse {
  content: string;
  finish_reason: string;
  tokens_per_second: number;
  prompt_tokens: number;
  completion_tokens: number;
  model: string;
}

export interface LlmMessage {
  role: string;
  content: string;
}

export interface LlmGenerationSettings {
  min_p: number;
  top_k: number;
  top_p: number;
  mirostat: number;
  mirostat_tau?: number;
  mirostat_eta: number;
  temperature: number;
  seed: number;
}

export interface LLmJob extends GolemJob {}

export interface EmbeddingResponse {
  embeddings: string[];
}

export interface GenerateImageResponse {
  image: string;
  seed: number;
}

export interface SoundGenerationResponse {
  wav: string;
}

export interface AsrResponse {
  text: string;
}

export interface GolemJob {
  resolve: any;
  reject: any;
  unique_id: any;
  custom_data?: any;
}

export interface GolemEmbeddingServiceInterface {
  generateEmbedding(
    text: string[],
    routingKey: string,
    userId: number,
    customData?: any
  ): Promise<EmbeddingResponse>;
  cosineSimilarity(A, B): number;
}

export interface GolemSoundServiceInterface {
  textToSpeech(
    prompt: string,
    userId: number,
    voice?: string,
    routingKey?: string,
    reportProgress?: boolean,
    progressTarget?: string
  ): Promise<SoundGenerationResponse>;
  generateSound(
    prompt: string,
    userId: number,
    guidanceScale?: number,
    generationLength?: number,
    routingKey?: string,
    reportProgress?: boolean,
    progressTarget?: string
  ): Promise<SoundGenerationResponse>;
  saveSoundFile(
    savePath: string,
    data: any,
    userId: number,
    isBase64?: boolean
  ): Promise<string>;
  automaticSpeechRecognition(
    url: string,
    userId: number,
    routingKey?: string
  ): Promise<AsrResponse>;
}

export interface GolemImageServiceInterface {
  generateImage(
    userId: number,
    prompt: string,
    routingKey?: string,
    negativePrompt?: string,
    guidanceScale?: number,
    steps?: number,
    seed?: number,
    height?: number,
    width?: number
  ): Promise<GenerateImageResponse>;
}

export interface GolemLlmServiceInterface {
  generateFromPayload(
    payload: any,
    routingKey: string,
    userId: number,
    customData?: any
  ): Promise<LlmResponse>;
  generate(
    messages: LlmMessage[],
    routingKey: string,
    userId: number,
    generationSettings: LlmGenerationSettings,
    customData?: any
  ): Promise<LlmResponse>;
}
