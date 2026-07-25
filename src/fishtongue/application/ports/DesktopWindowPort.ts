export interface WindowState {
  isMaximized: boolean;
  isFocused: boolean;
}

export interface DesktopWindowPort {
  startDragging(): Promise<void>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  subscribeWindowState(listener: (state: WindowState) => void): Promise<() => void>;
}
