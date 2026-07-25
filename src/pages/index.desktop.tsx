import {
  createDesktopProjectApplication,
  createDesktopWindowPort,
  createDesktopSoundChangeService,
  createDesktopInflectionService,
} from "@/fishtongue/bootstrap";
import FishTongueDesktopApp from "@/fishtongue/ui/FishTongueDesktopApp";
import { useMemo } from "react";

export default function FishTongueDesktop() {
  const application = useMemo(() => createDesktopProjectApplication(), []);
  const windowPort = useMemo(() => createDesktopWindowPort(), []);
  const soundChangeService = useMemo(() => createDesktopSoundChangeService(), []);
  const inflectionService = useMemo(() => createDesktopInflectionService(), []);
  return (
    <FishTongueDesktopApp
      application={application}
      windowPort={windowPort}
      soundChangeService={soundChangeService}
      inflectionService={inflectionService}
    />
  );
}
