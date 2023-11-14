# Arcane Bridge

Arcane Bridge is a TypesScript application that acts as a middleware between the Spellbook UI and the Elemental Golem python servers. It is also where
chat abilities are implemented allowing for easy access and integration with both npm libs and pip libs w/ Elemental Golem.

## Stack Architecture

![Software stack diagram](https://github.com/noco-ai/spellbook-docker/blob/master/stack.png)

## Dependencies

- Hashicorp Vault >= 1.1
- RabbitMQ >= 3.6.10
- MariaDB >= 8.1
- Elemental Golem >= 0.1.0

### Required Vault Keys

In order to function Elemental Golem need to connect to a Vault server to retrieve secrets and configuration data.
The following information needs to be stored in Vault for Element Golem to start.

### **core/amqp**

```json
{
  "host": "127.0.0.1",
  "password": "securepass",
  "username": "spellbook-user",
  "vhost": "spellbook"
}
```

### **core/sequelize**

```json
{
  "database": "spellbook",
  "dialect": "mysql",
  "host": "localhost",
  "password": "my-password",
  "port": "3306",
  "username": "my-username"
}
```

### **core/settings**

```json
{
  "base_url": "http://localhost:3000"
}
```

## Install Guide

### Docker Install

See https://github.com/noco-ai/spellbook-docker for installing the entire Spell Book stack with Docker Compose.

### Ubuntu 22 Server Install

```bash
apt-get update && apt-get install -y curl git ca-certificates gnupg sass
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install nodejs -y
mkdir arcane-bridge
cd arcane-bridge
git clone https://github.com/noco-ai/arcane-bridge .
npm install
```

### CLI Parameters and Server Commands

Arcane Bridge provides several CLI commands for controlling the software. Below is a detailed explanation of them.

### **Command-line Interface (CLI) Parameters**:

- `--vault-host,-vh`: The address of the Vault server host. Required parameter.
- `--vault-token-file`: The path to the file containing the Vault token. Defaults to './vault-token' if not specified.
- `--vault-root,-vr`: The root path in the Vault server. Defaults to 'spellbook' if not specified.
- `--server-id,-id`: Unique server ID for routing if multiple instance of AB are needed.
- `--create-schema,-cs`: Creates any new MariaDB tables.

### Start the server

```bash
npm run start -- -vh https://vault-host:8200/
```

## Skills API

Arcane Bridge prodvides an API for accessing an running Elemental Golem skills from a single API endpoint. Below are some examples of calls to the API endpoint.

### List Online Skills

```bash
curl http://localhost:3000/api/v1/skill/online
```

### Call Golem Skill

The skill routing key is present in the GET request and the payload body will vary depending on the skill called. See the Elemental Golem schema/ folder for
all validators.

```bash
curl -X POST "http://localhost:3000/api/v1/skill/execute/llama_v2_chat_7b" \
-H "Content-Type: application/json" \
-d '{
    "messages": [ { "role": "user", "content": "Why is the sky blue?" } ],
    "max_new_tokens": 758
}'

curl -X POST "http://localhost:3000/api/v1/skill/execute/llama_v2_code_instruct_7b" \
-H "Content-Type: application/json" \
-d '{
    "messages": [ { "role": "user", "content": "How do I open a firewall port on Linux?" } ],
    "debug": true,
    "temperature": 1,
    "top_p": 0.9,
    "top_k": 0.9,
    "max_new_tokens": 758
}'

curl -X POST "http://localhost:3000/api/v1/skill/execute/dream_shaper_image_gen" \
-H "Content-Type: application/json" \
-d '{
  "guidance_scale": 7.5,
  "height": 512,
  "negative_prompt": "ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, extra limbs, disfigured, deformed, body out of frame, bad anatomy, watermark, signature, cut off, low contrast, underexposed, overexposed, bad art, beginner, amateur, distorted face",
  "steps": 40,
  "width": 512,
  "prompt": "A man walking down the beach"
}'
```

## Chat Abilities

Chat Abilities allow extending local LLMs to call external services like models running on the backed and third-party APIs. These are
defined using a spellbook.json file outlines below. The best example of how these can be implemented is in the code base see src/modules/chat-ability
in the repo.

### spellbook.json

JSON Configuration Template (spellbook.json)
The JSON configuration file defines the metadata and parameters required for the chat ability. Here's an example skeleton:

```json
{
  "label": "Your Ability Label",
  "version": "1.0.0",
  "spell_label": "Unique Spell Label",
  "module": "chat-ability/your-module-path",
  "dependencies": ["spellbook/core", "..."],
  "description": "Description of your chat ability.",
  "icon": "path/to/your/icon.jpeg",
  "unique_key": "unique_ability_key",
  "skill_dependencies": ["required_skills"],
  "shortcut": "🔧",
  "chat_ability": [
    {
      "label": "Function Label",
      "spell_label": "Function Spell Label",
      "class_file": "your-handler.skill",
      "execute_function": "executeSkill",
      "icon": "path/to/function/icon.jpeg",
      "function_definition": ["Description of the function."],
      "parameters": [
        {
          "name": "param1",
          "description": ["Description of param1."],
          "required": true,
          "type": "string"
        }
      ]
    }
  ],
  "menu_item": [
    {
      "label": "Your Ability Label",
      "spell_label": "Unique Spell Label",
      "parent": "parent_menu",
      "group": "group_name",
      "sort_order": 1000,
      "icon": "pi pi-fw pi-custom-icon",
      "route": "path/to/settings"
    }
  ],
  "configuration": {
    "vault_path": "path/to/vault",
    "options": [
      {
        "label": "Option Label",
        "name": "option_name",
        "editable": true,
        "type": "input_type",
        "default": "default_value"
      }
    ]
  }
}
```

### YourHandler.skill.ts

The TypeScript handler file contains the logic for executing the chat ability. Below is a generic skeleton:

```typescript
import ChatAbilityBase from "path/to/chat.ability.base";
import { ChatAbilityInterface, OtherDependencies } from "types";

class YourHandlerSkill extends ChatAbilityBase implements ChatAbilityInterface {
  // Service dependencies, if any
  // ...

  constructor(services: ServicesConstructorInterface) {
    super(services);
    // Initialize services here
    // ...
  }

  async executeSkill(/* parameters */): Promise<boolean> {
    // Implement your skill logic here
    // ...

    return true;
  }

  // Additional methods, if needed
  // ...
}

export default YourHandlerSkill;
```

### Instructions for Creating a New Chat Ability

- Define the JSON Configuration: Create a JSON file similar to spellbook.json. Customize the fields to fit your chat ability's requirements.
- Implement the Handler File: Develop a TypeScript class based on YourHandlerSkill. Implement the executeSkill method and any other necessary logic.
- Integrate and Test: Include the new chat ability in your project, ensuring the JSON configuration and handler file are correctly placed and referenced.
- Documentation: Document each chat ability clearly, explaining its purpose, parameters, and usage.

## AbilityResponseHelper

The AbilityResponseHelper class plays a crucial role in managing responses and interactions for chat abilities. Below is a detailed overview of its functionalities and methods:

- Purpose: This class serves as a helper for sending responses, managing progress, and handling user prompts and system responses in chat abilities.
- Dependencies: It relies on various services such as LoggerService, SpellbookService, and a promptClass for specific operations.

### Key Methods

- sendError: Sends an error message to the user, identified by socketId.
- clearEmbeddings: Clears embeddings, likely resetting the state of the conversation.
- simpleChatPayload: Creates a simple chat payload comprising system and user prompts.
- updateProgressBar: Updates a progress bar in the chat interface, useful for long-running tasks.
- sendResponseWithCursor: Sends a response to the user and manages the cursor position in the chat, maintaining conversation context.
- mergeConfig: Merges a given skill configuration with a payload, useful for dynamic configuration adjustments.
- resetCursor: Resets the cursor in the chat interface, possibly clearing the current interaction state.
- getActiveConversationParameter: Retrieves a specific parameter from the active conversation, identified by socketId.
- sendResponse: Sends a standard response to the user. This can be used for both text and rich media content.
