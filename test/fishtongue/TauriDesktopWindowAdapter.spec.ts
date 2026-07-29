import TauriDesktopWindowAdapter from "@/fishtongue/infrastructure/TauriDesktopWindowAdapter";
import { getCurrentWindow } from "@tauri-apps/api/window";

jest.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
}));

jest.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: jest.fn(),
}));

const getCurrentWindowMock = getCurrentWindow as jest.MockedFunction<typeof getCurrentWindow>;

describe("TauriDesktopWindowAdapter", () => {
  it("removes close-request listeners before issuing the final window close", async () => {
    const calls: string[] = [];
    const unlisten = jest.fn(() => calls.push("unlisten"));
    const close = jest.fn(async () => { calls.push("close"); });
    const onCloseRequested = jest.fn(async () => unlisten);
    getCurrentWindowMock.mockReturnValue({
      close,
      onCloseRequested,
    } as unknown as ReturnType<typeof getCurrentWindow>);
    const adapter = new TauriDesktopWindowAdapter();

    await adapter.subscribeCloseRequested(() => undefined);
    await adapter.close();

    expect(calls).toEqual(["unlisten", "close"]);
  });
});
