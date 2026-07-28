import {
  AiProviderPort,
  AiStreamEvent,
  AiTurnInput,
  AiTurnResult,
} from "@/fishtongue/application/ports/AiPorts";
import { AiModel, AiProviderConfig } from "@/fishtongue/domain/models";
import { Channel, invoke } from "@tauri-apps/api/core";

export default class TauriAiProviderAdapter implements AiProviderPort {
  secretStatus(configId: string): Promise<boolean> {
    return invoke("ai_secret_status", { configId });
  }

  setSecret(configId: string, secret: string): Promise<void> {
    return invoke("ai_secret_set", { configId, secret });
  }

  deleteSecret(configId: string): Promise<void> {
    return invoke("ai_secret_delete", { configId });
  }

  listModels(config: AiProviderConfig): Promise<AiModel[]> {
    return invoke("ai_list_models", { config: commandConfig(config) });
  }

  testConnection(config: AiProviderConfig, modelId: string): Promise<void> {
    return invoke("ai_test_connection", { config: commandConfig(config), modelId });
  }

  async streamTurn(
    input: AiTurnInput,
    onEvent: (event: AiStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<AiTurnResult> {
    const channel = new Channel<AiStreamEvent>();
    channel.onmessage = onEvent;
    const abort = () => void this.cancel();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      return await invoke("ai_stream_turn", {
        input: {
          ...input,
          provider: commandConfig(input.provider),
        },
        onEvent: channel,
      });
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  cancel(): Promise<void> {
    return invoke("ai_cancel");
  }
}

function commandConfig(config: AiProviderConfig) {
  return {
    id: config.id,
    name: config.name,
    kind: config.kind,
    baseUrl: config.baseUrl,
  };
}
