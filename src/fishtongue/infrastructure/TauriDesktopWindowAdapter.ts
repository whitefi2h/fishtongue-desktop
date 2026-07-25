import {
  DesktopWindowPort,
  WindowState,
} from "@/fishtongue/application/ports/DesktopWindowPort";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default class TauriDesktopWindowAdapter implements DesktopWindowPort {
  async startDragging(): Promise<void> {
    if (isTauri()) await getCurrentWindow().startDragging();
  }

  async minimize(): Promise<void> {
    if (isTauri()) await getCurrentWindow().minimize();
  }

  async toggleMaximize(): Promise<void> {
    if (isTauri()) await getCurrentWindow().toggleMaximize();
  }

  async close(): Promise<void> {
    if (isTauri()) await getCurrentWindow().close();
  }

  async isMaximized(): Promise<boolean> {
    return isTauri() ? getCurrentWindow().isMaximized() : false;
  }

  async subscribeWindowState(
    listener: (state: WindowState) => void
  ): Promise<() => void> {
    if (!isTauri()) {
      listener({ isMaximized: false, isFocused: true });
      return () => undefined;
    }

    const appWindow = getCurrentWindow();
    const publish = async (isFocused = true) => {
      listener({ isMaximized: await appWindow.isMaximized(), isFocused });
    };
    await publish();
    const unlistenResize = await appWindow.onResized(() => void publish());
    const unlistenFocus = await appWindow.onFocusChanged(({ payload }) =>
      void publish(payload)
    );
    return () => {
      unlistenResize();
      unlistenFocus();
    };
  }
}
