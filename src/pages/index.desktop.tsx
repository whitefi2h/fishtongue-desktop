import {
  createDesktopProjectApplication,
  createDesktopWindowPort,
} from "@/fishtongue/bootstrap";
import FishTongueDesktopApp from "@/fishtongue/ui/FishTongueDesktopApp";
import { useMemo } from "react";

export default function FishTongueDesktop() {
  const application = useMemo(() => createDesktopProjectApplication(), []);
  const windowPort = useMemo(() => createDesktopWindowPort(), []);
  return (
    <FishTongueDesktopApp
      application={application}
      windowPort={windowPort}
    />
  );
}
