export interface LogOptions {
  color?: Function;
  icon?: string;
  style?: Array<(text: string) => string>;
  config?: number;
}

export interface LogConfiguration {
  format: string;
  level: string;
}

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LoggerServiceInterface {
  loadConfigPaths: (configKeys?: string[]) => Promise<void>;
  error: (message: string, options?: LogOptions, ...args: any[]) => void;
  warn: (message: string, options?: LogOptions, ...args: any[]) => void;
  info: (message: string, options?: LogOptions, ...args: any[]) => void;
  debug: (message: string, options?: LogOptions, ...args: any[]) => void;
  start: () => void;
}
