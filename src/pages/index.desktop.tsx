import {
  createDesktopApplications,
  createDesktopWindowPort,
  createDesktopSoundChangeService,
  createDesktopInflectionService,
  createDesktopWordGenerationService,
} from "@/fishtongue/bootstrap";
import FishTongueDesktopApp from "@/fishtongue/ui/FishTongueDesktopApp";
import { useMemo } from "react";

export default function FishTongueDesktop() {
  const applications = useMemo(() => createDesktopApplications(), []);
  const application = applications.project;
  const windowPort = useMemo(() => createDesktopWindowPort(), []);
  const soundChangeService = useMemo(() => createDesktopSoundChangeService(), []);
  const inflectionService = useMemo(() => createDesktopInflectionService(), []);
  const wordGenerationService = useMemo(() => createDesktopWordGenerationService(), []);
  return (
    <FishTongueDesktopApp
      application={application}
      windowPort={windowPort}
      soundChangeService={soundChangeService}
      inflectionService={inflectionService}
      wordGenerationService={wordGenerationService}
      aiApplication={applications.ai}
    />
  );
}
