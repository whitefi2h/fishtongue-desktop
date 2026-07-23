import { createDesktopSoundChangeService } from "@/fishtongue/bootstrap";
import DesktopSoundChangePage from "@/fishtongue/ui/DesktopSoundChangePage";

const soundChangeService = createDesktopSoundChangeService();

export default function SoundChangeRoute() {
  return <DesktopSoundChangePage soundChangeService={soundChangeService} />;
}
