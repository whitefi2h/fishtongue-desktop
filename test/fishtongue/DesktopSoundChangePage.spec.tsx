import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import UnavailableSoundChangeEngine from "@/fishtongue/infrastructure/UnavailableSoundChangeEngine";
import DesktopSoundChangePage from "@/fishtongue/ui/DesktopSoundChangePage";
import { render, screen } from "@testing-library/react";

describe("DesktopSoundChangePage", () => {
  it("renders the reused editor and an honest unavailable-engine status", () => {
    const service = new SoundChangeService(new UnavailableSoundChangeEngine());

    render(<DesktopSoundChangePage soundChangeService={service} />);

    expect(
      screen.getByRole("heading", { name: "音变规则编辑器" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Sound Changes")).toBeInTheDocument();
    expect(screen.getByText("尚未接入")).toBeInTheDocument();
    expect(
      screen.getByText("当前不会发送网络请求，也不会伪造规则校验或音变结果。")
    ).toBeInTheDocument();
  });
});
