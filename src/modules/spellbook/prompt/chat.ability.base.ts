import {
  ChatAbilityInterface,
  LoggerServiceInterface,
  ServicesConstructorInterface,
} from "types";

class ChatAbilityBase implements ChatAbilityInterface {
  protected logger: LoggerServiceInterface;

  constructor(services: ServicesConstructorInterface) {
    this.logger = services["LoggerService"];
  }

  isReady(): boolean {
    return true;
  }
}

export default ChatAbilityBase;
