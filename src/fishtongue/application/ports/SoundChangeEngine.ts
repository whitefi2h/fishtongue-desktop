export type SoundChangeEngineStatus =
  | Readonly<{
      state: "ready";
      message: string;
    }>
  | Readonly<{
      state: "unavailable";
      message: string;
    }>;

export interface SoundChangeEngine {
  getStatus(): SoundChangeEngineStatus;
}
