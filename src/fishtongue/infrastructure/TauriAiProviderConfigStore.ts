import { AiProviderConfigStore } from "@/fishtongue/application/ports/AiPorts";
import { AiProviderConfig } from "@/fishtongue/domain/models";
import { load } from "@tauri-apps/plugin-store";

const STORE_PATH = "settings.json";
const KEY = "aiProviderConfigs";

export default class TauriAiProviderConfigStore implements AiProviderConfigStore {
  async list(): Promise<AiProviderConfig[]> {
    const store = await load(STORE_PATH);
    return (await store.get<AiProviderConfig[]>(KEY)) ?? [];
  }

  async save(config: AiProviderConfig): Promise<void> {
    const store = await load(STORE_PATH);
    const current = (await store.get<AiProviderConfig[]>(KEY)) ?? [];
    const next = [
      config,
      ...current.filter((item) => item.id !== config.id).map((item) =>
        config.isDefault ? { ...item, isDefault: false } : item
      ),
    ];
    await store.set(KEY, next);
    await store.save();
  }

  async delete(id: string): Promise<void> {
    const store = await load(STORE_PATH);
    const current = (await store.get<AiProviderConfig[]>(KEY)) ?? [];
    await store.set(KEY, current.filter((item) => item.id !== id));
    await store.save();
  }
}
