import { RecentProjectStore } from "@/fishtongue/application/ports/ProjectPorts";
import { RecentProject } from "@/fishtongue/domain/models";
import { load } from "@tauri-apps/plugin-store";

const STORE_PATH = "settings.json";
const RECENT_KEY = "recentProjects";
const RECENT_LIMIT = 10;

export default class TauriRecentProjectStore implements RecentProjectStore {
  async list(): Promise<RecentProject[]> {
    const store = await load(STORE_PATH);
    return (await store.get<RecentProject[]>(RECENT_KEY)) ?? [];
  }

  async remember(project: RecentProject): Promise<void> {
    const store = await load(STORE_PATH);
    const current = (await store.get<RecentProject[]>(RECENT_KEY)) ?? [];
    const next = [
      project,
      ...current.filter((item) => item.path !== project.path),
    ].slice(0, RECENT_LIMIT);
    await store.set(RECENT_KEY, next);
    await store.save();
  }

  async remove(path: string): Promise<void> {
    const store = await load(STORE_PATH);
    const current = (await store.get<RecentProject[]>(RECENT_KEY)) ?? [];
    await store.set(
      RECENT_KEY,
      current.filter((item) => item.path !== path)
    );
    await store.save();
  }
}

