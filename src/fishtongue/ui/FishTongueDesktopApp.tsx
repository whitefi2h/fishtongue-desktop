import { DesktopWindowPort, WindowState } from "@/fishtongue/application/ports/DesktopWindowPort";
import { ProjectApplication, ProjectSnapshot } from "@/fishtongue/application/ports/ProjectApplication";
import InflectionService from "@/fishtongue/application/services/InflectionService";
import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import { Language } from "@/fishtongue/domain/models";
import { EvolutionWorkspace, InflectionWorkspace } from "@/fishtongue/ui/EngineWorkspaces";
import { prototypeProject } from "@/fishtongue/ui/prototype/data";
import { t } from "@/fishtongue/ui/prototype/i18n";
import { routeRegistry, routesById } from "@/fishtongue/ui/prototype/registry";
import {
  PrototypeLanguage,
  ThemeMode,
  UiFeatureState,
  UiLocale,
  WorkspaceRoute,
} from "@/fishtongue/ui/prototype/types";
import styles from "@/fishtongue/ui/FishTongueDesktopApp.module.css";
import ScCodeEditor from "@/sc/ScCodeEditor";
import {
  ActivityLogIcon,
  ArrowLeftIcon,
  BarChartIcon,
  CalendarIcon,
  CaretDownIcon,
  ChatBubbleIcon,
  CheckCircledIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeIcon,
  ColumnsIcon,
  Cross2Icon,
  DashboardIcon,
  DotsHorizontalIcon,
  EnterFullScreenIcon,
  ExitFullScreenIcon,
  ExclamationTriangleIcon,
  FileTextIcon,
  GearIcon,
  GlobeIcon,
  GridIcon,
  HomeIcon,
  InfoCircledIcon,
  LayersIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  MixIcon,
  MixerHorizontalIcon,
  MoonIcon,
  Pencil2Icon,
  PersonIcon,
  PlusIcon,
  ReaderIcon,
  RowsIcon,
  SunIcon,
  TableIcon,
} from "@radix-ui/react-icons";
import Head from "next/head";
import {
  ElementType,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type DialogKind =
  | "new-project"
  | "new-language"
  | "planned"
  | "search"
  | "lexurgy-help"
  | null;
type AppMode = "welcome" | "workspace";

function toPrototypeLanguage(language: Language): PrototypeLanguage {
  return {
    id: language.id,
    name: language.name,
    nativeName: language.name,
    family: "项目语言",
    era: "未设置",
    region: "未设置",
    status: "真实项目数据",
    words: 0,
    warnings: 0,
    stages: [],
  };
}

const icons: Partial<Record<WorkspaceRoute, ElementType>> = {
  "project-home": HomeIcon,
  languages: GlobeIcon,
  genealogy: MixIcon,
  events: CalendarIcon,
  "project-settings": GearIcon,
  "language-overview": DashboardIcon,
  "language-properties": ReaderIcon,
  stages: LayersIcon,
  dialects: GlobeIcon,
  phonology: ActivityLogIcon,
  morphology: GridIcon,
  lexicon: ListBulletIcon,
  writing: Pencil2Icon,
  evolution: MixIcon,
  contact: GlobeIcon,
  translation: ColumnsIcon,
  "developer-tools": CodeIcon,
};

const menus = [
  { label: "文件", items: [["新建项目", "Ctrl+N", "new"], ["打开项目…", "Ctrl+O", "open"], ["保存", "Ctrl+S", "save"], ["另存为…", "Ctrl+Shift+S", "save-as"], ["关闭项目", "", "close-project"], ["退出", "Alt+F4", "quit"]] },
  { label: "编辑", items: [["撤销", "Ctrl+Z", "planned"], ["重做", "Ctrl+Y", "planned"], ["查找", "Ctrl+F", "search"], ["全局搜索", "Ctrl+K", "search"], ["偏好设置", "", "project-settings"]] },
  { label: "视图", items: [["项目主页", "", "project-home"], ["语言谱系", "", "genealogy"], ["切换导航栏", "", "toggle-nav"], ["切换 AI", "", "toggle-ai"], ["切换主题", "", "toggle-theme"]] },
  { label: "项目", items: [["项目属性", "", "project-settings"], ["新建语言", "", "new-language"], ["导入语言", "", "planned"], ["历史事件", "", "events"], ["项目诊断", "", "planned"]] },
  { label: "语言", items: [["语言属性", "", "language-properties"], ["阶段管理", "", "stages"], ["方言管理", "", "dialects"], ["创建下一阶段", "", "planned"], ["验证语言", "", "planned"]] },
  { label: "工具", items: [["IPA 工具", "", "phonology"], ["音变规则测试器", "", "evolution"], ["批量导入", "", "planned"], ["开发者工具", "", "developer-tools"], ["AI 与模型设置", "", "planned"]] },
  { label: "帮助", items: [["Lexurgy 规则快速参考", "F1", "lexurgy-help"], ["快捷键", "", "planned"], ["语言学术术语", "", "planned"], ["关于 FishTongue", "", "planned"]] },
] as const;

const englishMenus = [
  { label: "File", items: [["New project", "Ctrl+N", "new"], ["Open project…", "Ctrl+O", "open"], ["Save", "Ctrl+S", "save"], ["Save as…", "Ctrl+Shift+S", "save-as"], ["Close project", "", "close-project"], ["Exit", "Alt+F4", "quit"]] },
  { label: "Edit", items: [["Undo", "Ctrl+Z", "planned"], ["Redo", "Ctrl+Y", "planned"], ["Find", "Ctrl+F", "search"], ["Global search", "Ctrl+K", "search"], ["Preferences", "", "project-settings"]] },
  { label: "View", items: [["Project home", "", "project-home"], ["Language family", "", "genealogy"], ["Toggle navigation", "", "toggle-nav"], ["Toggle AI", "", "toggle-ai"], ["Switch theme", "", "toggle-theme"]] },
  { label: "Project", items: [["Project properties", "", "project-settings"], ["New language", "", "new-language"], ["Import language", "", "planned"], ["Historical events", "", "events"], ["Project diagnostics", "", "planned"]] },
  { label: "Language", items: [["Language properties", "", "language-properties"], ["Manage stages", "", "stages"], ["Manage dialects", "", "dialects"], ["Create next stage", "", "planned"], ["Validate language", "", "planned"]] },
  { label: "Tools", items: [["IPA tools", "", "phonology"], ["Sound-change tester", "", "evolution"], ["Batch import", "", "planned"], ["Developer tools", "", "developer-tools"], ["AI and model settings", "", "planned"]] },
  { label: "Help", items: [["Lexurgy quick reference", "F1", "lexurgy-help"], ["Keyboard shortcuts", "", "planned"], ["Linguistics glossary", "", "planned"], ["About FishTongue", "", "planned"]] },
] as const;

export default function FishTongueDesktopApp({
  application,
  windowPort,
  soundChangeService,
  inflectionService,
}: {
  application: ProjectApplication;
  windowPort: DesktopWindowPort;
  soundChangeService?: SoundChangeService;
  inflectionService?: InflectionService;
}) {
  const [mode, setMode] = useState<AppMode>("welcome");
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [route, setRoute] = useState<WorkspaceRoute>("project-home");
  const [routeHistory, setRouteHistory] = useState<WorkspaceRoute[]>([]);
  const [locale, setLocale] = useState<UiLocale>("zh-CN");
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [plannedTitle, setPlannedTitle] = useState("后续功能");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [compactViewport, setCompactViewport] = useState(false);
  const [navOverlayOpen, setNavOverlayOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(prototypeProject.languages[0]);
  const [selectedStage, setSelectedStage] = useState<
    PrototypeLanguage["stages"][number] | undefined
  >(prototypeProject.languages[0].stages[1]);
  const [windowState, setWindowState] = useState<WindowState>({ isMaximized: false, isFocused: true });
  const [message, setMessage] = useState("本地设计原型 · 不会写入项目");
  const [recent, setRecent] = useState<{ name: string; path: string }[]>([]);
  const [recoveryName, setRecoveryName] = useState<string>();
  const currentRoute = routesById[route];
  const workspaceLanguages = useMemo(
    () => snapshot?.languages.length
      ? snapshot.languages.map(toPrototypeLanguage)
      : prototypeProject.languages,
    [snapshot]
  );
  const autoCollapseNavigation = compactViewport && aiOpen;
  const navigationCollapsed = navCollapsed || (autoCollapseNavigation && !navOverlayOpen);

  useEffect(() => {
    void Promise.all([application.listRecentProjects(), application.inspectRecovery()])
      .then(([items, recovery]) => {
        setRecent(items);
        setRecoveryName(recovery?.manifest.name);
      })
      .catch(() => setMessage("无法读取最近项目；仍可浏览设计原型。"));
  }, [application]);

  useEffect(() => {
    let cleanup: () => void = () => undefined;
    void windowPort.subscribeWindowState(setWindowState).then((value) => {
      cleanup = value;
    });
    return () => cleanup();
  }, [windowPort]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setResolvedTheme(theme === "system" ? (media.matches ? "dark" : "light") : theme);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1359px)");
    const update = () => {
      setCompactViewport(media.matches);
      if (!media.matches) setNavOverlayOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!aiOpen) setNavOverlayOpen(false);
  }, [aiOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
      }
      if (event.key === "F1") {
        event.preventDefault();
        setDialog("lexurgy-help");
      }
      if (event.key === "Escape" && navOverlayOpen) {
        event.preventDefault();
        setNavOverlayOpen(false);
      }
      if (event.ctrlKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDialog("search");
      }
      if (event.ctrlKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setDialog("new-project");
      }
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject(event.shiftKey);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const enterWorkspace = (next?: ProjectSnapshot | null) => {
    if (next) {
      setSnapshot(next);
      if (next.languages[0]) {
        setSelectedLanguage(toPrototypeLanguage(next.languages[0]));
        setSelectedStage(undefined);
      }
    }
    setMode("workspace");
    setRouteHistory([]);
    setRoute("project-home");
    setMessage(next ? "项目已打开 · 新模块仍处于设计预览" : "正在浏览完整设计原型 · 不会写入项目");
  };

  const openProject = async (path?: string) => {
    try {
      enterWorkspace(await application.openProject(path));
    } catch {
      setMessage("无法打开项目。请检查文件位置或选择其他项目。");
    }
  };

  const saveProject = async (saveAs = false) => {
    if (!snapshot) {
      setPlannedTitle("设计原型不能保存");
      setDialog("planned");
      return;
    }
    try {
      const next = saveAs ? await application.saveProjectAs() : await application.saveProject();
      if (next) setSnapshot(next);
      setMessage(saveAs ? "项目副本已保存。" : "项目已保存。");
    } catch {
      setMessage("保存失败；原项目未被覆盖。");
    }
  };

  const navigate = (next: WorkspaceRoute) => {
    setNavOverlayOpen(false);
    if (next === route) return;
    setRouteHistory((history) => [...history.slice(-19), route]);
    setRoute(next);
    if (routesById[next].state === "planned") {
      setPlannedTitle(routesById[next].label);
      setDialog("planned");
    }
  };

  const goBack = () => {
    const previous = routeHistory.at(-1);
    if (!previous) return;
    setNavOverlayOpen(false);
    setRouteHistory((history) => history.slice(0, -1));
    setRoute(previous);
  };

  const toggleNavigation = () => {
    if (autoCollapseNavigation) {
      setNavOverlayOpen((value) => !value);
      return;
    }
    setNavCollapsed((value) => !value);
  };

  const command = async (id: string) => {
    if (id in routesById) return navigate(id as WorkspaceRoute);
    if (id === "new") return setDialog("new-project");
    if (id === "open") return void openProject();
    if (id === "save") return void saveProject();
    if (id === "save-as") return void saveProject(true);
    if (id === "new-language") return setDialog("new-language");
    if (id === "search") return setDialog("search");
    if (id === "lexurgy-help") return setDialog("lexurgy-help");
    if (id === "toggle-nav") return toggleNavigation();
    if (id === "toggle-ai") return setAiOpen((value) => !value);
    if (id === "toggle-theme") return setTheme((value) => value === "light" ? "dark" : "light");
    if (id === "close-project") {
      if (snapshot) await application.closeProject();
      setSnapshot(null);
      setMode("welcome");
      return;
    }
    if (id === "quit") return void windowPort.close();
    setPlannedTitle("此操作将在后续阶段开放");
    setDialog("planned");
  };

  const projectName = snapshot?.project.name ?? prototypeProject.name;
  const workspaceLevel = currentRoute?.group === "language" ? "language" : "project";
  const pageTitle = currentRoute
    ? (locale === "zh-CN" ? currentRoute.label : currentRoute.englishLabel)
    : (locale === "zh-CN" ? "欢迎" : "Welcome");

  return (
    <div className={styles.root} data-theme={resolvedTheme} data-window-focus={windowState.isFocused}>
      <Head><title>{projectName} · FishTongue</title></Head>
      <a className={styles.skipLink} href="#main-workspace">跳到主工作区</a>
      <TitleBar
        projectName={mode === "workspace" ? projectName : ""}
        pageTitle={mode === "workspace" ? pageTitle : "欢迎"}
        dirty={Boolean(snapshot?.dirty)}
        state={windowState}
        windowPort={windowPort}
      />
      <MenuBar locale={locale} onCommand={(id) => void command(id)} />
      {mode === "welcome" ? (
        <WelcomePage
          recent={recent}
          recoveryName={recoveryName}
          onPreview={() => enterWorkspace()}
          onOpen={(path) => void openProject(path)}
          onCreate={() => setDialog("new-project")}
          onImport={() => void application.importProject().then(enterWorkspace).catch(() => setMessage("项目导入失败。"))}
          onRecover={() => void application.recoverProject().then(enterWorkspace).catch(() => setMessage("项目恢复失败。"))}
          message={message}
        />
      ) : (
        <div className={styles.workspaceShell}>
          <ContextToolbar
            project={projectName}
            level={workspaceLevel}
            languages={workspaceLanguages}
            language={selectedLanguage}
            stage={selectedStage}
            page={pageTitle}
            locale={locale}
            theme={theme}
            onProject={() => navigate("project-home")}
            canGoBack={routeHistory.length > 0}
            onBack={goBack}
            onLanguage={(language) => {
              setSelectedLanguage(language);
              setSelectedStage(language.stages[0]);
              navigate("language-overview");
            }}
            onStage={setSelectedStage}
            onLocale={() => setLocale((value) => value === "zh-CN" ? "en-US" : "zh-CN")}
            onTheme={() => setTheme((value) => value === "system" ? "light" : value === "light" ? "dark" : "system")}
            onSearch={() => setDialog("search")}
            onAi={() => setAiOpen((value) => !value)}
          />
          <div
            className={styles.workbench}
            data-nav-collapsed={navigationCollapsed}
            data-nav-overlay-open={navOverlayOpen}
            data-ai-open={aiOpen}
            onPointerDown={(event) => {
              const target = event.target as HTMLElement;
              if (navOverlayOpen && !target.closest?.("[data-workspace-navigation]")) {
                setNavOverlayOpen(false);
              }
            }}
          >
            <Navigation
              collapsed={navigationCollapsed}
              route={route}
              level={workspaceLevel}
              language={selectedLanguage}
              project={projectName}
              locale={locale}
              onNavigate={navigate}
              onCollapse={toggleNavigation}
            />
            <main id="main-workspace" className={styles.mainWorkspace} tabIndex={-1}>
              <PreviewBanner locale={locale} live={Boolean(snapshot)} />
              <PageHeader route={route} locale={locale} live={Boolean(snapshot)} onCreate={() => setDialog("new-language")} />
              <PageContent
                route={route}
                language={selectedLanguage}
                onLanguage={(language) => {
                  setSelectedLanguage(language);
                  setSelectedStage(language.stages[0]);
                  navigate("language-overview");
                }}
                selectedStage={selectedStage}
                onStage={setSelectedStage}
                onPlanned={(title) => {
                  setPlannedTitle(title);
                  setDialog("planned");
                }}
                application={application}
                snapshot={snapshot}
                soundChangeService={soundChangeService}
                inflectionService={inflectionService}
              />
            </main>
            {aiOpen && <AiSidebar onClose={() => setAiOpen(false)} />}
          </div>
          <StatusBar snapshot={snapshot} level={workspaceLevel} language={selectedLanguage} stage={selectedStage?.name} message={message} />
        </div>
      )}
      <AppDialog
        kind={dialog}
        plannedTitle={plannedTitle}
        onClose={() => setDialog(null)}
        onCreateProject={async (name) => {
          const next = await application.createProject(name);
          setDialog(null);
          enterWorkspace(next);
        }}
        onCreateLanguage={async (name) => {
          if (snapshot) {
            const created = await application.createLanguage(name);
            const current = application.getSnapshot();
            if (current) setSnapshot({ ...current });
            setSelectedLanguage(toPrototypeLanguage(created));
            setSelectedStage(undefined);
            setDialog(null);
            navigate("language-overview");
            setMessage("语言已创建并保存到当前项目。");
            return;
          }
          const language: PrototypeLanguage = {
            id: `preview-${Date.now()}`, name, nativeName: name, family: "未分类",
            era: "尚未设置", region: "尚未设置", status: "设计草稿", words: 0, warnings: 0, stages: [],
          };
          setSelectedLanguage(language);
          setDialog(null);
          navigate("language-overview");
          setMessage("语言向导已完成设计预览；未写入项目。");
        }}
      />
    </div>
  );
}

function TitleBar({ projectName, pageTitle, dirty, state, windowPort }: {
  projectName: string; pageTitle: string; dirty: boolean; state: WindowState; windowPort: DesktopWindowPort;
}) {
  return <header className={styles.titleBar}>
    <div className={styles.brand} translate="no"><span className={styles.brandMark}>F</span><strong>FishTongue</strong></div>
    <div
      className={styles.dragRegion}
      data-tauri-drag-region
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        if (event.detail === 2) {
          void windowPort.toggleMaximize();
          return;
        }
        void windowPort.startDragging();
      }}
    >
      <span>{projectName || "本地语言工作室"}</span>
      <span className={styles.titleDivider}>/</span>
      <span>{pageTitle}</span>
      {dirty && <span className={styles.dirtyDot} aria-label="有未保存修改" />}
    </div>
    <div className={styles.windowControls}>
      <button title="最小化" aria-label="最小化" onClick={() => void windowPort.minimize()}><MinusIcon aria-hidden="true" /></button>
      <button title={state.isMaximized ? "还原" : "最大化"} aria-label={state.isMaximized ? "还原" : "最大化"} onClick={() => void windowPort.toggleMaximize()}>
        {state.isMaximized ? <ExitFullScreenIcon aria-hidden="true" /> : <EnterFullScreenIcon aria-hidden="true" />}
      </button>
      <button className={styles.closeButton} title="关闭" aria-label="关闭" onClick={() => void windowPort.close()}><Cross2Icon aria-hidden="true" /></button>
    </div>
  </header>;
}

function MenuBar({ locale, onCommand }: { locale: UiLocale; onCommand: (id: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuBarRef = useRef<HTMLElement | null>(null);
  const activeMenus = locale === "zh-CN" ? menus : englishMenus;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        event.preventDefault();
        setOpen((value) => value === null ? 0 : null);
        window.setTimeout(() => refs.current[0]?.focus(), 0);
      }
      if (event.key === "Escape" && open !== null) {
        event.preventDefault();
        const root = refs.current[open];
        setOpen(null);
        window.setTimeout(() => root?.focus(), 0);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (open !== null && !menuBarRef.current?.contains(event.target as Node)) {
        setOpen(null);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);
  const onMenuKey = (event: ReactKeyboardEvent, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = (index + (event.key === "ArrowRight" ? 1 : -1) + activeMenus.length) % activeMenus.length;
      setOpen(next);
      refs.current[next]?.focus();
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(index);
      document.querySelector<HTMLButtonElement>(`[data-menu-panel="${index}"] button`)?.focus();
    }
  };
  const onPanelKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      items[(current + offset + items.length) % items.length]?.focus();
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  };
  return <nav ref={menuBarRef} className={styles.menuBar} aria-label={locale === "zh-CN" ? "应用菜单" : "Application menu"}>
    {activeMenus.map((menu, index) => <div className={styles.menuRoot} key={menu.label}>
      <button
        ref={(node) => { refs.current[index] = node; }}
        aria-haspopup="menu"
        aria-expanded={open === index}
        data-open={open === index}
        onClick={() => setOpen((value) => value === index ? null : index)}
        onPointerEnter={() => { if (open !== null) setOpen(index); }}
        onKeyDown={(event) => onMenuKey(event, index)}
      >{menu.label}</button>
      {open === index && <div className={styles.menuPanel} role="menu" data-menu-panel={index} onKeyDown={onPanelKey}>
        {menu.items.map(([label, shortcut, id]) => <button key={label} role="menuitem" onClick={() => { setOpen(null); onCommand(id); }}>
          <span>{label}</span><kbd>{shortcut}</kbd>
        </button>)}
      </div>}
    </div>)}
  </nav>;
}

function ContextToolbar(props: {
  project: string;
  level: "project" | "language";
  languages: PrototypeLanguage[];
  language: PrototypeLanguage;
  stage?: PrototypeLanguage["stages"][number];
  page: string;
  locale: UiLocale;
  theme: ThemeMode;
  onProject: () => void;
  canGoBack: boolean;
  onBack: () => void;
  onLanguage: (language: PrototypeLanguage) => void;
  onStage: (stage?: PrototypeLanguage["stages"][number]) => void;
  onLocale: () => void;
  onTheme: () => void;
  onSearch: () => void;
  onAi: () => void;
}) {
  const [switcher, setSwitcher] = useState<"language" | "stage" | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const isChinese = props.locale === "zh-CN";

  useEffect(() => {
    if (!switcher) return;
    const close = (event: PointerEvent) => {
      if (!railRef.current?.contains(event.target as Node)) setSwitcher(null);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSwitcher(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [switcher]);

  return <div className={styles.contextToolbar}>
    <div className={styles.contextRail} aria-label={isChinese ? "当前位置" : "Current location"} ref={railRef}>
      <span className={styles.contextSegment}>
        <i />
        <button onClick={props.onProject}>{props.project}</button>
        <ChevronRightIcon aria-hidden="true" />
      </span>
      {props.level === "language" && <>
        <span className={styles.contextSegment}>
          <i />
          <button
            aria-haspopup="menu"
            aria-expanded={switcher === "language"}
            onClick={() => setSwitcher((value) => value === "language" ? null : "language")}
          >
            {props.language.name}<CaretDownIcon aria-hidden="true" />
          </button>
          <ChevronRightIcon aria-hidden="true" />
          {switcher === "language" && <div className={styles.contextMenu} role="menu">
            {props.languages.map((language) => <button
              key={language.id}
              role="menuitemradio"
              aria-checked={language.id === props.language.id}
              onClick={() => {
                props.onLanguage(language);
                setSwitcher(null);
              }}
            >
              <span><strong>{language.name}</strong><small>{language.nativeName}</small></span>
              {language.id === props.language.id && <CheckCircledIcon aria-hidden="true" />}
            </button>)}
          </div>}
        </span>
        <span className={styles.contextSegment}>
          <i />
          <button
            aria-haspopup="menu"
            aria-expanded={switcher === "stage"}
            onClick={() => setSwitcher((value) => value === "stage" ? null : "stage")}
          >
            {props.stage?.name || (isChinese ? "默认状态" : "Default state")}<CaretDownIcon aria-hidden="true" />
          </button>
          <ChevronRightIcon aria-hidden="true" />
          {switcher === "stage" && <div className={styles.contextMenu} role="menu">
            {props.language.stages.length ? props.language.stages.map((stage) => <button
              key={stage.id}
              role="menuitemradio"
              aria-checked={stage.id === props.stage?.id}
              onClick={() => {
                props.onStage(stage);
                setSwitcher(null);
              }}
            >
              <span><strong>{stage.name}</strong><small>{stage.years}</small></span>
              {stage.id === props.stage?.id && <CheckCircledIcon aria-hidden="true" />}
            </button>) : <button role="menuitemradio" aria-checked onClick={() => setSwitcher(null)}>
              <span><strong>{isChinese ? "默认状态" : "Default state"}</strong><small>{isChinese ? "尚未启用阶段" : "Stages are not enabled"}</small></span>
              <CheckCircledIcon aria-hidden="true" />
            </button>}
          </div>}
        </span>
      </>}
      <span className={styles.contextSegment}>
        <i data-current />
        <span>{props.page}</span>
      </span>
    </div>
    <div className={styles.toolbarActions}>
      <button
        className={styles.backButton}
        title={isChinese ? "返回上一页（Alt+左方向键）" : "Back (Alt+Left)"}
        aria-label={isChinese ? "返回上一页" : "Back"}
        disabled={!props.canGoBack}
        onClick={props.onBack}
      ><ArrowLeftIcon aria-hidden="true" /></button>
      <button title={props.locale === "zh-CN" ? "全局搜索" : "Global search"} onClick={props.onSearch}><MagnifyingGlassIcon aria-hidden="true" /><span>{t(props.locale, "search")}</span><kbd>Ctrl K</kbd></button>
      <button title="切换界面语言" onClick={props.onLocale}><GlobeIcon aria-hidden="true" /><span>{props.locale === "zh-CN" ? "中" : "EN"}</span></button>
      <button title="切换主题" aria-label="切换主题" onClick={props.onTheme}>{props.theme === "dark" ? <MoonIcon aria-hidden="true" /> : <SunIcon aria-hidden="true" />}</button>
      <button title="AI 侧栏" onClick={props.onAi}><ChatBubbleIcon aria-hidden="true" /><span>AI</span></button>
    </div>
  </div>;
}

function Navigation({ collapsed, route, level, language, locale, project, onNavigate, onCollapse }: {
  collapsed: boolean; route: WorkspaceRoute; level: "project" | "language"; language: PrototypeLanguage; locale: UiLocale; project: string;
  onNavigate: (route: WorkspaceRoute) => void; onCollapse: () => void;
}) {
  const renderGroup = (group: "project" | "language") => routeRegistry.filter((item) => {
    if (item.group !== group || ["map", "reconstruction", "glyph-designer"].includes(item.id)) return false;
    return level !== "language" || group !== "project" || item.id === "project-home";
  }).map((item) => {
    const Icon = icons[item.id] ?? FileTextIcon;
    const label = locale === "zh-CN" ? item.label : item.englishLabel;
    return <button key={item.id} title={collapsed ? label : undefined} aria-current={route === item.id ? "page" : undefined} data-active={route === item.id} onClick={() => onNavigate(item.id)}>
      <Icon aria-hidden="true" /><span>{label}</span>{item.state === "planned" && <small>{locale === "zh-CN" ? "后续" : "Later"}</small>}
    </button>;
  });
  const collapseLabel = collapsed
    ? (locale === "zh-CN" ? "展开导航" : "Expand navigation")
    : (locale === "zh-CN" ? "折叠导航" : "Collapse navigation");
  return <aside data-workspace-navigation className={styles.navigation} aria-label={locale === "zh-CN" ? "工作区导航" : "Workspace navigation"}>
    <div className={styles.navHeading}><span>{collapsed ? "P" : project}</span><button title={collapseLabel} aria-label={collapseLabel} onClick={onCollapse}><RowsIcon aria-hidden="true" /></button></div>
    <div className={styles.navGroup}><p>{locale === "zh-CN" ? "项目" : "Project"}</p>{renderGroup("project")}</div>
    {level === "language" && <>
      <div className={styles.navSeparator} />
      <div className={styles.navLanguage}><div><span className={styles.languageAvatar}>{language.name.slice(0, 1)}</span><span><strong>{language.name}</strong><small>{language.nativeName}</small></span></div></div>
      <div className={styles.navGroup}><p>{locale === "zh-CN" ? "语言" : "Language"}</p>{renderGroup("language")}</div>
    </>}
  </aside>;
}

function PreviewBanner({ locale, live }: { locale: UiLocale; live: boolean }) {
  return <div className={styles.previewBanner}><InfoCircledIcon aria-hidden="true" /><span>{live
    ? (locale === "zh-CN" ? "真实项目模式 · 规则和测试输入会保存，生成结果仅供预览" : "Project mode · Rules and test inputs are saved; generated results are previews")
    : t(locale, "preview")}</span></div>;
}

function PageHeader({ route, locale, live, onCreate }: { route: WorkspaceRoute; locale: UiLocale; live: boolean; onCreate: () => void }) {
  const item = routesById[route];
  const featureState = live && ["evolution", "morphology"].includes(route) ? "live" : item.state;
  return <header className={styles.pageHeader}>
    <div><div className={styles.pageTitleLine}><h1>{locale === "zh-CN" ? item.label : item.englishLabel}</h1><FeatureBadge state={featureState} locale={locale} /></div><p>{locale === "zh-CN" ? pageDescriptions[route] : pageDescriptionsEn[route]}</p></div>
    <div className={styles.pageActions}><button><MagnifyingGlassIcon aria-hidden="true" />{t(locale, "search")}</button><button><MixerHorizontalIcon aria-hidden="true" />{t(locale, "filter")}</button><button className={styles.primaryButton} onClick={onCreate}><PlusIcon aria-hidden="true" />{t(locale, "create")}</button></div>
  </header>;
}

function FeatureBadge({ state, locale = "zh-CN" }: { state: UiFeatureState; locale?: UiLocale }) {
  const labels = locale === "zh-CN"
    ? { live: "已接入", prototype: "交互原型", planned: "后续功能" }
    : { live: "Live", prototype: "Prototype", planned: "Planned" };
  return <span className={styles.featureBadge} data-state={state}>{labels[state]}</span>;
}

const pageDescriptions: Record<WorkspaceRoute, string> = {
  "project-home": "从一个稳定入口了解项目、语言和待处理问题。",
  languages: "浏览项目中的全部语言、阶段状态和资料完整度。",
  genealogy: "查看语言继承、分支和方言关系；拖动不会直接修改关系。",
  events: "按时间整理迁徙、接触、标准化和语言变化事件。",
  "project-settings": "管理项目基本信息、启动行为和界面偏好。",
  "language-overview": "当前语言与阶段的工作摘要和快捷入口。",
  "language-properties": "语言身份、使用情况、关系和书写信息。",
  stages: "管理自由命名的历史阶段、资料状态和有效状态。",
  dialects: "管理轻量方言和可提升为独立语言的分支。",
  phonology: "音位、音节结构、重音、规则和发音拼写。",
  morphology: "语素、派生、屈折、范式和形态音系。",
  lexicon: "在筛选、词条列表和详情之间保持连续上下文。",
  writing: "管理字符、音位映射、正字法和转写方案。",
  evolution: "设计正向演化方案并预览冲突；源阶段保持不变。",
  contact: "以历史事件组织借词、仿译和结构影响提案。",
  translation: "使用项目词典和规则辅助翻译，缺失词汇进入审核。",
  "developer-tools": "受限脚本工作台；只读试运行后才能预览补丁。",
  map: "地图视图将在后续版本提供。",
  reconstruction: "自动逆向历史重构将在后续版本提供。",
  "unsafe-scripting": "高级本机代码模式将在后续版本提供。",
  "global-undo": "完整跨页面撤销依赖后续版本历史系统。",
  "glyph-designer": "原创字符绘制工具将在后续版本提供。",
};

const pageDescriptionsEn: Record<WorkspaceRoute, string> = {
  "project-home": "Review the project, its languages, and outstanding issues from one stable entry point.",
  languages: "Browse every language, its stage state, and documentation completeness.",
  genealogy: "Inspect inheritance, branching, and dialect relationships without silently changing them.",
  events: "Organize migration, contact, standardization, and language change on a timeline.",
  "project-settings": "Manage project identity, startup behavior, and interface preferences.",
  "language-overview": "A working summary and quick entry points for the current language and stage.",
  "language-properties": "Language identity, use, relationships, and writing information.",
  stages: "Manage named historical stages, evidence states, and resolved language states.",
  dialects: "Manage lightweight dialects and branches that may become independent languages.",
  phonology: "Phonemes, syllable structure, stress, phonotactics, and pronunciation spelling.",
  morphology: "Morphemes, derivation, inflection, paradigms, and morphophonology.",
  lexicon: "Keep filters, entries, and details in one continuous three-pane context.",
  writing: "Manage characters, phoneme mappings, orthographies, and transliteration schemes.",
  evolution: "Design forward evolution and preview conflicts while preserving the source stage.",
  contact: "Organize borrowing, calques, and structural influence as reviewable proposals.",
  translation: "Use project vocabulary for assisted translation and send missing words to review.",
  "developer-tools": "A constrained scripting workspace with read-only trials and patch previews.",
  map: "The map view will be delivered in a later phase.",
  reconstruction: "Automatic reverse historical reconstruction is planned for a later phase.",
  "unsafe-scripting": "Advanced local-code mode is planned for a later phase.",
  "global-undo": "Cross-page undo depends on a later project-history system.",
  "glyph-designer": "The original-glyph drawing tool is planned for a later phase.",
};

function PageContent(props: {
  route: WorkspaceRoute; language: PrototypeLanguage; selectedStage?: PrototypeLanguage["stages"][number];
  onLanguage: (language: PrototypeLanguage) => void; onStage: (stage?: PrototypeLanguage["stages"][number]) => void;
  onPlanned: (title: string) => void;
  application: ProjectApplication;
  snapshot: ProjectSnapshot | null;
  soundChangeService?: SoundChangeService;
  inflectionService?: InflectionService;
}) {
  const liveLanguage = Boolean(
    props.snapshot?.languages.some((language) => language.id === props.language.id)
  );
  switch (props.route) {
    case "project-home": return <ProjectHome onLanguage={props.onLanguage} />;
    case "languages": return <LanguagesPage onLanguage={props.onLanguage} />;
    case "genealogy": return <GenealogyPage onLanguage={props.onLanguage} />;
    case "events": return <EventsPage />;
    case "project-settings": return <SettingsPage />;
    case "language-overview": return <LanguageOverview language={props.language} />;
    case "language-properties": return <PropertiesPage language={props.language} />;
    case "stages": return <StagesPage language={props.language} selected={props.selectedStage} onStage={props.onStage} />;
    case "dialects": return <DialectsPage />;
    case "phonology": return <PhonologyPage />;
    case "morphology": return props.snapshot
      ? <InflectionWorkspace application={props.application} service={props.inflectionService} languageId={props.language.id} live={liveLanguage} />
      : <MorphologyPage />;
    case "lexicon": return <LexiconPage />;
    case "writing": return <WritingPage />;
    case "evolution": return <EvolutionWorkspace application={props.application} service={props.soundChangeService} languageId={props.language.id} live={liveLanguage} />;
    case "contact": return <ContactPage />;
    case "translation": return <TranslationPage />;
    case "developer-tools": return <DeveloperToolsPage />;
    default: return <PlannedPage route={props.route} onExplain={() => props.onPlanned(routesById[props.route].label)} />;
  }
}

function ProjectHome({ onLanguage }: { onLanguage: (language: PrototypeLanguage) => void }) {
  return <div className={styles.pageGrid}>
    <section className={styles.summaryStrip}>
      {[["4", "种语言"], ["2,640", "个词条"], ["3", "条继承关系"], ["22", "项待处理"]].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
    </section>
    <section className={styles.surfacePanel}>
      <PanelHeading title="语言概览" action="查看全部" />
      <div className={styles.languageTable}>{prototypeProject.languages.map((language) => <button key={language.id} onClick={() => onLanguage(language)}>
        <span className={styles.languageAvatar}>{language.name[0]}</span><span><strong>{language.name}</strong><small>{language.nativeName} · {language.family}</small></span>
        <span>{language.era}</span><span>{language.words.toLocaleString()} 词</span><StatusDot warnings={language.warnings} /><ChevronRightIcon aria-hidden="true" />
      </button>)}</div>
    </section>
    <section className={styles.splitColumns}>
      <div className={styles.surfacePanel}><PanelHeading title="最近活动" /><Timeline /></div>
      <div className={styles.surfacePanel}><PanelHeading title="需要处理" /><IssueList /></div>
    </section>
  </div>;
}

function LanguagesPage({ onLanguage }: { onLanguage: (language: PrototypeLanguage) => void }) {
  return <section className={styles.surfacePanel}>
    <div className={styles.filterRow}><span>状态：全部</span><span>语系：全部</span><span>地区：全部</span><span>4 种语言</span></div>
    <table className={`${styles.dataTable} ${styles.languagesDataTable}`}><thead><tr><th>语言</th><th>状态</th><th>语系</th><th>年代</th><th>地区</th><th>词条</th><th>问题</th></tr></thead>
      <tbody>{prototypeProject.languages.map((language) => <tr key={language.id}>
        <td><button className={styles.textButton} aria-label={`打开${language.name}`} onClick={() => onLanguage(language)}><strong>{language.name}</strong><small>{language.nativeName}</small></button></td>
        <td><span className={styles.statusTag}>{language.status}</span></td><td>{language.family}</td><td>{language.era}</td><td>{language.region}</td>
        <td>{language.words.toLocaleString()}</td><td><StatusDot warnings={language.warnings} /></td>
      </tr>)}</tbody>
    </table>
  </section>;
}

function GenealogyPage({ onLanguage }: { onLanguage: (language: PrototypeLanguage) => void }) {
  return <div className={styles.genealogyCanvas}>
    <div className={styles.canvasToolbar}><button aria-label="缩小谱系图"><MinusIcon aria-hidden="true" /></button><span>100%</span><button aria-label="放大谱系图"><PlusIcon aria-hidden="true" /></button><button>适合窗口</button></div>
    <div className={styles.familyTree}>
      <button className={styles.treeNode} data-root onClick={() => onLanguage(prototypeProject.languages[0])}><small>共同祖语</small><strong>古北海语</strong><span>前 900—前 420</span></button>
      <div className={styles.treeLine} />
      <div className={styles.treeBranches}>
        <button className={styles.treeNode} onClick={() => onLanguage(prototypeProject.languages[0])}><small>后代语言 · 3 阶段</small><strong>阿兰语</strong><span>3 项警告</span></button>
        <button className={styles.treeNode} onClick={() => onLanguage(prototypeProject.languages[1])}><small>后代语言 · 单一状态</small><strong>诺尔语</strong><span>资料完整</span></button>
        <div className={styles.treeNode} data-muted><small>轻量方言</small><strong>北岬方言</strong><span>设计预览</span></div>
      </div>
    </div>
    <div className={styles.canvasHint}><InfoCircledIcon aria-hidden="true" />拖动只调整画布；修改关系需要确认。</div>
  </div>;
}

function EventsPage() {
  return <div className={styles.splitColumnsWide}><section className={styles.surfacePanel}><PanelHeading title="事件时间线" /><Timeline /></section>
    <section className={styles.propertyPanel}><h2>北方贸易接触</h2><p className={styles.muted}>公元 112—184 · 贸易</p>
      <Field label="涉及语言" value="阿兰语 → 诺尔语" /><Field label="影响领域" value="航海、盐业、度量衡" />
      <Field label="强度" value="中等" /><Field label="传播渠道" value="港口双语社群" />
      <div className={styles.noteBox}>预计产生 18 个借词候选。候选需要人工审核后才能进入词典。</div>
    </section></div>;
}

function SettingsPage() {
  return <section className={styles.formSections}>
    <FormSection title="项目信息"><Field label="项目名称" value={prototypeProject.name} editable /><Field label="项目说明" value="北海诸国及其语言历史设定" editable /></FormSection>
    <FormSection title="启动与保存"><Toggle label="启动时打开上次项目" checked /><Toggle label="自动保存" checked /><Field label="默认项目目录" value="D:\\Languages" /></FormSection>
    <FormSection title="界面"><Field label="界面语言" value="简体中文" /><Field label="主题" value="跟随系统" /><Toggle label="紧凑表格" checked /></FormSection>
  </section>;
}

function LanguageOverview({ language }: { language: PrototypeLanguage }) {
  return <div className={styles.pageGrid}>
    <section className={styles.languageHero}><div className={styles.languageAvatarLarge}>{language.name[0]}</div><div><h2>{language.name}</h2><p>{language.nativeName} · {language.family} · {language.status}</p></div>
      <div className={styles.completion}><strong>72%</strong><span>资料完整度</span></div></section>
    <section className={styles.summaryStrip}>{[["32", "个音位"], ["18", "条规则"], ["64", "个语素"], [language.words.toLocaleString(), "个词条"]].map(([v,l]) => <div key={l}><strong>{v}</strong><span>{l}</span></div>)}</section>
    <section className={styles.splitColumns}><div className={styles.surfacePanel}><PanelHeading title="当前工作状态" /><IssueList /></div>
      <div className={styles.surfacePanel}><PanelHeading title="快捷入口" /><div className={styles.quickGrid}>{["添加音位","创建词根","导入词典","生成基础词汇","创建下一阶段","创建后代语言"].map((item)=><button key={item}>{item}<ChevronRightIcon aria-hidden="true" /></button>)}</div></div></section>
  </div>;
}

function PropertiesPage({ language }: { language: PrototypeLanguage }) {
  return <section className={styles.formSections}>
    <FormSection title="身份"><Field label="语言名称" value={language.name} editable /><Field label="本族名称" value={language.nativeName} editable /><Field label="语言代码" value="aln" editable /><Field label="标签" value="礼仪语言、北海、历史语言" /></FormSection>
    <FormSection title="使用情况"><Field label="当前状态" value={language.status} /><Field label="使用年代" value={language.era} /><Field label="地区" value={language.region} /><Field label="使用人口" value="约 48,000（诸王时期）" /></FormSection>
    <FormSection title="语言关系"><Field label="父语言" value="古北海语" /><Field label="后代语言" value="诺尔语、北岬方言" /><Field label="接触语言" value="萨伦语" /></FormSection>
  </section>;
}

function StagesPage({ language, selected, onStage }: {
  language: PrototypeLanguage; selected?: PrototypeLanguage["stages"][number];
  onStage: (stage?: PrototypeLanguage["stages"][number]) => void;
}) {
  if (!language.stages.length) return <EmptyState title="尚未启用阶段系统" body="这门语言使用一个内部默认状态。启用后可自由命名历史阶段。" action="启用阶段系统" />;
  return <div className={styles.threePane}>
    <aside className={styles.listPane}>{language.stages.map((stage) => <button key={stage.id} data-active={stage.id === selected?.id} onClick={() => onStage(stage)}>
      <span className={styles.timelineDot} data-status={stage.documentation} /><span><strong>{stage.name}</strong><small>{stage.years}</small></span></button>)}
      <button className={styles.addRow}><PlusIcon aria-hidden="true" />添加阶段</button></aside>
    <section className={styles.detailPane}><h2>{selected?.name}</h2><div className={styles.statusTag}>{documentationLabel(selected?.documentation)}</div>
      <FormSection title="阶段信息"><Field label="自定义名称" value={selected?.name ?? ""} editable /><Field label="起止年代" value={selected?.years ?? ""} editable /><Field label="资料状态" value={documentationLabel(selected?.documentation)} /></FormSection>
      {selected?.documentation === "unrecorded" && <div className={styles.warningPanel}><ExclamationTriangleIcon aria-hidden="true" /><div><strong>该阶段被标记为“无记录”</strong><p>仅保存背景与关系，不生成词典、音系或可翻译数据。</p></div></div>}
    </section>
  </div>;
}

function DialectsPage() {
  return <div className={styles.optionGrid}><OptionPanel title="轻量方言" body="继承指定阶段的有效状态，只保存发音、词汇和拼写差异。" action="创建轻量方言" />
    <OptionPanel title="独立方言语言" body="适合拥有大量独立规则、阶段或后代的方言，保留原有关系。" action="提升为独立语言" /></div>;
}

function PhonologyPage() {
  const consonants = [["p","b","t","d","k","g"],["m","","n","","ŋ",""],["f","v","s","z","x","ɣ"],["","", "r","l","",""]];
  return <div className={styles.pageGrid}><div className={styles.tabStrip}>{["音位表","音节与音位配列","重音与韵律","音系规则","发音与拼写","例外"].map((item,i)=><button key={item} data-active={i===0}>{item}</button>)}</div>
    <section className={styles.splitColumnsWide}><div className={styles.surfacePanel}><PanelHeading title="辅音音位" action="添加音位" /><div className={styles.ipaGrid}>{consonants.flatMap((row,r)=>row.map((cell,c)=>cell ? <button key={`${r}-${c}`} aria-label={`编辑音位 ${cell}`}>{cell}</button> : <span key={`${r}-${c}`} data-empty aria-hidden="true" />))}</div></div>
      <div className={styles.propertyPanel}><h2>/n/</h2><p className={styles.ipaLarge}>n</p><Field label="类型" value="齿龈鼻音" /><Field label="分布" value="词首、词中、词尾" /><Field label="来源" value="已确认" /></div></section></div>;
}

function MorphologyPage() {
  return <div className={styles.pageGrid}><div className={styles.tabStrip}>{["语素库","派生构词","屈折系统","词形范式","形态音系","特殊规则"].map((item,i)=><button key={item} data-active={i===0}>{item}</button>)}</div>
    <section className={styles.surfacePanel}><PanelHeading title="语素库" action="新建语素" /><table className={styles.dataTable}><thead><tr><th>形式</th><th>类型</th><th>含义</th><th>适用词类</th><th>状态</th></tr></thead>
      <tbody>{[["-an","后缀","施事者","动词 → 名词"],["ka-","前缀","反复、再次","动词"],["-ir","屈折词尾","属格","名词"],["tal","词根","说、言语","动词"]].map((row)=><tr key={row[0]}>{row.map((v)=><td key={v}>{v}</td>)}<td><span className={styles.statusTag}>已确认</span></td></tr>)}</tbody></table></section></div>;
}

function LexiconPage() {
  const [selected, setSelected] = useState(prototypeProject.lexemes[0]);
  return <div className={styles.lexiconLayout}>
    <aside className={styles.filterPane}><h2>筛选与分类</h2><label className={styles.searchField}><MagnifyingGlassIcon aria-hidden="true" /><input aria-label="搜索词形或释义" name="lexicon-search" autoComplete="off" placeholder="搜索词形或释义…" /></label>
      {["词性","资料来源","阶段","标签"].map((group)=><div className={styles.filterGroup} key={group}><strong>{group}</strong>{["全部","已确认","待审核"].map((v,i)=><label key={v}><input type="checkbox" name={`filter-${group}`} value={v} defaultChecked={i===0}/>{v}</label>)}</div>)}</aside>
    <section className={styles.lexemeList}><div className={styles.paneHeader}><strong>{prototypeProject.lexemes.length} 个词条</strong><button><PlusIcon aria-hidden="true" />新建词条</button></div>
      <table className={styles.dataTable}><thead><tr><th>词形</th><th>IPA</th><th>核心释义</th><th>词性</th></tr></thead><tbody>{prototypeProject.lexemes.map((lexeme)=><tr key={lexeme.id} data-active={lexeme.id===selected.id}><td><button className={styles.textButton} aria-label={`选择词条 ${lexeme.form}`} onClick={()=>setSelected(lexeme)}><strong>{lexeme.form}</strong></button></td><td>{lexeme.ipa}</td><td>{lexeme.meaning}</td><td>{lexeme.partOfSpeech}</td></tr>)}</tbody></table></section>
    <aside className={styles.lexemeDetail}><div className={styles.paneHeader}><span><strong>{selected.form}</strong><small>{selected.ipa}</small></span><button aria-label="更多词条操作"><DotsHorizontalIcon aria-hidden="true" /></button></div>
      <div className={styles.detailTabs}><button data-active>基本信息</button><button>词义</button><button>词源</button></div>
      <Field label="核心释义" value={selected.meaning} /><Field label="词性" value={selected.partOfSpeech} /><Field label="阶段" value={selected.stage} />
      <Field label="资料状态" value={selected.confidence} /><Field label="来源" value={selected.source} />
      <div className={styles.noteBox}>发音来源：规则生成。正式提交前可转为人工编辑。</div>
    </aside>
  </div>;
}

function WritingPage() {
  return <div className={styles.splitColumnsWide}><section className={styles.surfacePanel}><PanelHeading title="北海通用正字法" action="新建书写系统" />
    <div className={styles.glyphGrid}>{"AaĀāBbDdEeĒēFfGgIiĪīKkLlMmNnOoŌōRrSsTtVv".split("").map((glyph,i)=><button key={`${glyph}-${i}`}>{glyph}</button>)}</div></section>
    <section className={styles.propertyPanel}><h2>字符映射</h2><Field label="字符" value="ā" /><Field label="音位" value="/aː/" /><Field label="转写" value="aa" /><Toggle label="允许词首" checked /><Toggle label="允许词尾" checked /></section></div>;
}

function EvolutionPage() {
  return <div className={styles.pageGrid}><div className={styles.tabStrip}>{["演化方案","预览与冲突","阶段与分支","历史记录"].map((item,i)=><button key={item} data-active={i===0}>{item}</button>)}</div>
    <section className={styles.evolutionLayout}><div className={styles.editorPanel}><div className={styles.paneHeader}><span><strong>诸王时期 → 北迁后期</strong><small>规则草稿 · 未执行</small></span><button>验证规则</button></div>
      <div className={styles.codeEditor}><ScCodeEditor initialCode={"# 北迁后期音变草稿\\nV -> / _ [+stress]\\ns -> h / _#\\n{p, t, k} -> [+voice] / V_V"} onUpdateCode={()=>undefined} height="100%" /></div></div>
      <aside className={styles.conflictPane}><h2>输出与检查</h2><Field label="输出类型" value="创建下一阶段" /><Field label="阶段名称" value="北迁后期" />
        <div className={styles.metricList}><span><strong>1,284</strong> 待预览词形</span><span><strong>—</strong> 引擎尚未接入</span><span><strong>3</strong> 预设冲突行</span></div>
        <div className={styles.warningPanel}><InfoCircledIcon aria-hidden="true" /><div><strong>规则不会在本轮执行</strong><p>Phase 2 接入 Lexurgy 后才会生成真实结果。</p></div></div></aside></section>
    <section className={styles.surfacePanel}><PanelHeading title="冲突处理原型" /><table className={styles.dataTable}><thead><tr><th>源词形</th><th>目标词形</th><th>冲突</th><th>处理</th></tr></thead>
      <tbody>{[["sava","hava","同形词"],["taka","taga","已有词条"],["sōr","hōr","非法词首"]].map(row=><tr key={row[0]}><td>{row[0]}</td><td>{row[1]}</td><td><span className={styles.warningText}>{row[2]}</span></td><td><select aria-label={`处理 ${row[0]} 的冲突`} name={`conflict-${row[0]}`} defaultValue="review"><option value="review">手工检查</option><option>保留现有词</option><option>跳过</option></select></td></tr>)}</tbody></table></section></div>;
}

function ContactPage() {
  return <div className={styles.splitColumnsWide}><section className={styles.surfacePanel}><PanelHeading title="接触事件" action="新建事件" /><Timeline /></section>
    <section className={styles.propertyPanel}><h2>北方贸易接触</h2><Field label="时间" value="112—184" /><Field label="方向" value="诺尔语 → 阿兰语" /><Field label="语义领域" value="航海、贸易" />
      <div className={styles.proposalCard}><span>候选提案</span><strong>18 个借词候选</strong><p>仅展示审核流程，不会改写词典。</p><button>查看候选预览</button></div></section></div>;
}

function TranslationPage() {
  return <div className={styles.pageGrid}><div className={styles.translationToolbar}><span>现代汉语</span><ChevronRightIcon aria-hidden="true" /><span>阿兰语 · 诸王时期</span><span className={styles.statusTag}>严格模式</span></div>
    <section className={styles.translationGrid}><label>源语言文本<textarea name="translation-source" autoComplete="off" defaultValue="商船在黎明时离开北港。" /></label><label>目标语言结果<textarea name="translation-result" autoComplete="off" placeholder="尚未运行翻译…" readOnly /></label></section>
    <section className={styles.surfacePanel}><PanelHeading title="覆盖分析" /><div className={styles.analysisRows}><span><CheckCircledIcon aria-hidden="true" />已识别词汇 4</span><span><ExclamationTriangleIcon aria-hidden="true" />未覆盖概念 2</span><span><InfoCircledIcon aria-hidden="true" />语法规则尚未接入</span></div></section></div>;
}

function DeveloperToolsPage() {
  return <div className={styles.devLayout}><section className={styles.editorPanel}><div className={styles.paneHeader}><span><strong>安全脚本工作台</strong><small>范围：当前阶段 · 只读试运行</small></span><button>只读试运行</button></div>
    <pre className={styles.scriptEditor}><code>{`const words = await fish.lexicon.query({\n  partOfSpeech: "noun",\n  stage: "current"\n});\n\nreturn fish.patch.preview();`}</code></pre></section>
    <aside className={styles.conflictPane}><h2>执行范围</h2><Field label="模式" value="只读" /><Field label="范围" value="当前阶段" /><Field label="对象上限" value="500" />
      <div className={styles.warningPanel}><ExclamationTriangleIcon aria-hidden="true" /><div><strong>脚本不会执行</strong><p>本页面只展示未来的安全边界和补丁流程。</p></div></div></aside>
    <section className={styles.surfacePanel}><PanelHeading title="差异预览" /><div className={styles.diffSummary}>{[["新增","32"],["修改","145"],["删除","0"],["冲突","4"],["警告","7"]].map(([l,v])=><span key={l}><strong>{v}</strong>{l}</span>)}</div></section></div>;
}

function PlannedPage({ route, onExplain }: { route: WorkspaceRoute; onExplain: () => void }) {
  return <EmptyState title={routesById[route].label} body={pageDescriptions[route]} action="查看后续规划" onAction={onExplain} />;
}

function AiSidebar({ onClose }: { onClose: () => void }) {
  return <aside className={styles.aiSidebar}><div className={styles.aiHeader}><span><ChatBubbleIcon aria-hidden="true" /><strong>AI 助手</strong></span><button title="关闭 AI 侧栏" aria-label="关闭 AI 侧栏" onClick={onClose}><Cross2Icon aria-hidden="true" /></button></div>
    <div className={styles.contextScope}><strong>上下文范围</strong><label><input type="radio" name="scope" defaultChecked />当前页面</label><label><input type="radio" name="scope" />当前语言</label><label><input type="radio" name="scope" />整个项目</label></div>
    <div className={styles.aiConversation}><div className={styles.emptyAi}><ChatBubbleIcon aria-hidden="true" /><strong>从当前页面开始</strong><p>AI 尚未连接。未来只能读取允许的上下文并生成提案。</p></div>
      <div className={styles.proposalCard}><span>提案卡片示例</span><strong>检查当前音位表</strong><p>应用到草稿前需要验证和用户确认。</p><button disabled>等待模型连接</button></div></div>
    <label className={styles.aiComposer}><textarea aria-label="询问当前页面" name="ai-prompt" autoComplete="off" placeholder="询问当前页面…" disabled /><button disabled>发送</button></label></aside>;
}

function StatusBar({ snapshot, level, language, stage, message }: {
  snapshot: ProjectSnapshot | null; level: "project" | "language"; language: PrototypeLanguage; stage?: string; message: string;
}) {
  return <footer className={styles.statusBar}><span><CheckCircledIcon aria-hidden="true" />{snapshot?.dirty ? "有未保存修改" : "已保存"}</span><span className={styles.statusPath}>{snapshot?.session.sourcePath ?? prototypeProject.path}</span>
    <span>{level === "language" ? `${language.name} / ${stage || "默认状态"}` : "项目级视图"}</span>
    <span><ExclamationTriangleIcon aria-hidden="true" />{level === "language" ? language.warnings : prototypeProject.languages.reduce((total, item) => total + item.warnings, 0)} 项问题</span>
    <span>AI 未连接</span><span className={styles.statusMessage} aria-live="polite" aria-atomic="true">{message}</span></footer>;
}

function WelcomePage(props: {
  recent: { name: string; path: string }[]; recoveryName?: string; message: string;
  onPreview: () => void; onOpen: (path?: string) => void; onCreate: () => void; onImport: () => void; onRecover: () => void;
}) {
  return <main className={styles.welcome} id="main-workspace">
    <section className={styles.welcomeIntro}><div className={styles.welcomeMark}>F</div><div><h1>FishTongue</h1><p>创建、整理和演化属于一个世界的语言。</p></div></section>
    {props.recoveryName && <section className={styles.recoveryBar}><ExclamationTriangleIcon aria-hidden="true" /><div><strong>发现未正常关闭的项目</strong><p>{props.recoveryName} 有可恢复的本地工作区。</p></div><button onClick={props.onRecover}>恢复项目</button></section>}
    <section className={styles.welcomeGrid}>
      <div className={styles.welcomeActions}><h2>开始工作</h2><button className={styles.welcomePrimary} onClick={props.onCreate}><PlusIcon aria-hidden="true" /><span><strong>新建项目</strong><small>从快速开始或空白语言开始</small></span><ChevronRightIcon aria-hidden="true" /></button>
        <button onClick={() => props.onOpen()}><FileTextIcon aria-hidden="true" /><span><strong>打开项目</strong><small>打开 .fishtongue 文件</small></span><ChevronRightIcon aria-hidden="true" /></button>
        <button onClick={props.onImport}><ArrowLeftIcon aria-hidden="true" /><span><strong>导入项目</strong><small>导入受支持的项目版本</small></span><ChevronRightIcon aria-hidden="true" /></button>
        <button onClick={props.onPreview}><GridIcon aria-hidden="true" /><span><strong>浏览设计原型</strong><small>查看完整桌面框架与全部页面</small></span><ChevronRightIcon aria-hidden="true" /></button>
      </div>
      <div className={styles.recentProjects}><div className={styles.sectionHeading}><h2>最近项目</h2><button>查看全部</button></div>
        {(props.recent.length ? props.recent : [{ name: "北海编年史", path: "D:\\Languages\\NorthSea.fishtongue" }, { name: "帝国边境语言", path: "D:\\Languages\\Frontier.fishtongue" }]).map((item)=><button key={item.path} onClick={()=>props.onOpen(item.path)}><span className={styles.fileGlyph}>FT</span><span><strong>{item.name}</strong><small>{item.path}</small></span><DotsHorizontalIcon aria-hidden="true" /></button>)}
      </div>
    </section>
    <footer className={styles.welcomeFooter}><span>本地模式 · 无需登录</span><span>{props.message}</span><span>Phase 1.5 设计原型</span></footer>
  </main>;
}

function AppDialog(props: {
  kind: DialogKind; plannedTitle: string; onClose: () => void;
  onCreateProject: (name: string) => Promise<void>; onCreateLanguage: (name: string) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const previousKindRef = useRef<DialogKind>(null);
  useEffect(() => { if (props.kind === "new-project") setName("我的语言项目"); if (props.kind === "new-language") setName("新语言"); }, [props.kind]);
  useEffect(() => {
    if (props.kind) {
      if (!previousKindRef.current) {
        returnFocusRef.current = document.activeElement as HTMLElement | null;
      }
      window.requestAnimationFrame(() => {
        const preferred = dialogRef.current?.querySelector<HTMLElement>("[data-dialog-initial-focus]");
        const first = preferred ?? dialogRef.current?.querySelector<HTMLElement>(
          "input:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex='-1'])"
        );
        first?.focus();
      });
    } else if (previousKindRef.current) {
      const returnTarget = returnFocusRef.current;
      window.requestAnimationFrame(() => returnTarget?.focus());
      returnFocusRef.current = null;
    }
    previousKindRef.current = props.kind;
  }, [props.kind]);
  if (!props.kind) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (props.kind === "new-project") void props.onCreateProject(name);
    if (props.kind === "new-language") void props.onCreateLanguage(name);
  };
  return <div className={styles.dialogOverlay} role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget) props.onClose();}}>
    <div
      ref={dialogRef}
      className={styles.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          const returnTarget = returnFocusRef.current;
          props.onClose();
          window.setTimeout(() => returnTarget?.focus(), 0);
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "input:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex='-1'])"
          )
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <div className={styles.dialogHeader}><div><h2 id="dialog-title">{props.kind === "new-project" ? "新建项目" : props.kind === "new-language" ? "创建第一门语言" : props.kind === "search" ? "全局搜索" : props.kind === "lexurgy-help" ? "Lexurgy 规则快速参考" : props.plannedTitle}</h2>
        <p>{props.kind === "planned"
          ? "此能力只保留入口，不会在本轮执行。"
          : props.kind === "lexurgy-help"
            ? "离线查看常用语法；完整规则仍以引擎验证结果为准。"
            : "设计预览与真实项目能力保持清楚边界。"}</p></div><button aria-label="关闭" onClick={props.onClose}><Cross2Icon aria-hidden="true" /></button></div>
      {props.kind === "planned" ? <div className={styles.dialogBody}><div className={styles.plannedIllustration}><LayersIcon aria-hidden="true" /></div><p>页面结构和入口已经完成，正式数据、算法或运行环境将在对应功能阶段接入。</p></div>
      : props.kind === "lexurgy-help" ? <div className={styles.dialogBody}>
          <p>这份参考随 FishTongue 安装，可在断网时使用。规则按从上到下的顺序执行。</p>
          <div className={styles.commandResults}>
            <div><strong>注释</strong><kbd># 说明文字</kbd></div>
            <div><strong>基本替换</strong><kbd>规则名: a =&gt; e</kbd></div>
            <div><strong>环境</strong><kbd>a =&gt; e / p _ t</kbd></div>
            <div><strong>词首 / 词尾</strong><kbd>#_ / _#</kbd></div>
            <div><strong>备选项</strong><kbd>{"{p, t, k} => {b, d, g}"}</kbd></div>
            <div><strong>验证错误</strong><span>验证完成后会自动定位到对应行列。</span></div>
          </div>
          <p>运行结果只作预览，不会写回词典，也不会创建语言阶段。</p>
        </div>
      : props.kind === "search" ? <div className={styles.dialogBody}><label className={styles.commandInput}><MagnifyingGlassIcon aria-hidden="true" /><input data-dialog-initial-focus aria-label="搜索页面、语言、词条或命令" name="global-search" autoComplete="off" placeholder="搜索页面、语言、词条或命令…" /></label><div className={styles.commandResults}>{["打开阿兰语","前往词典","查看语言谱系","切换深色主题"].map((v)=><button key={v}>{v}<kbd>↵</kbd></button>)}</div></div>
      : <form onSubmit={submit}><div className={styles.dialogBody}><label className={styles.dialogField}><span>{props.kind === "new-project" ? "项目名称" : "语言名称"}</span><input data-dialog-initial-focus name={props.kind === "new-project" ? "project-name" : "language-name"} autoComplete="off" value={name} onChange={(event)=>setName(event.target.value)} /></label>
        {props.kind === "new-project" && <><label className={styles.dialogField}><span>项目说明</span><textarea name="project-description" autoComplete="off" placeholder="可选；本轮不写入项目…" /></label><div className={styles.wizardChoice}><button type="button" data-active><strong>快速开始</strong><span>参考现实语言规则</span></button><button type="button"><strong>从零构建</strong><span>创建空白语言</span></button></div></>}</div>
        <div className={styles.dialogFooter}><button type="button" onClick={props.onClose}>取消</button><button className={styles.primaryButton} disabled={!name.trim()}>{props.kind === "new-project" ? "创建并选择位置" : "进入语言工作区"}</button></div></form>}
    </div>
  </div>;
}

function PanelHeading({ title, action }: { title: string; action?: string }) { return <div className={styles.panelHeading}><h2>{title}</h2>{action && <button>{action}<ChevronRightIcon aria-hidden="true" /></button>}</div>; }
function Field({ label, value, editable=false }: { label: string; value: string; editable?: boolean }) { return <label className={styles.field}><span>{label}</span><input name={label} autoComplete="off" value={value} readOnly={!editable} onChange={()=>undefined} /></label>; }
function Toggle({ label, checked=false }: { label: string; checked?: boolean }) { return <label className={styles.toggle}><span>{label}</span><input name={label} type="checkbox" defaultChecked={checked}/><i aria-hidden="true" /></label>; }
function FormSection({ title, children }: { title: string; children: ReactNode }) { return <section className={styles.formSection}><h2>{title}</h2><div>{children}</div></section>; }
function OptionPanel({ title, body, action }: { title: string; body: string; action: string }) { return <section className={styles.optionPanel}><div className={styles.optionIcon}><LayersIcon aria-hidden="true" /></div><h2>{title}</h2><p>{body}</p><button>{action}<ChevronRightIcon aria-hidden="true" /></button></section>; }
function EmptyState({ title, body, action, onAction }: { title: string; body: string; action: string; onAction?: () => void }) { return <section className={styles.emptyState}><div><LayersIcon aria-hidden="true" /></div><h2>{title}</h2><p>{body}</p><button onClick={onAction}>{action}</button></section>; }
function StatusDot({ warnings }: { warnings: number }) { return <span className={styles.statusDot} data-warning={warnings > 0}>{warnings > 0 ? `${warnings} 项` : "正常"}</span>; }
function Timeline() { return <div className={styles.timeline}>{[["前 80","诸王时期开始"],["112","北方贸易接触"],["260","第一次正字法整理"],["340","北迁与方言分化"]].map(([year,event],i)=><div key={year}><span>{year}</span><i data-last={i===3}/><div><strong>{event}</strong><small>{i===1 ? "涉及阿兰语与诺尔语 · 18 个借词候选" : "历史事件 · 设计预览"}</small></div></div>)}</div>; }
function IssueList() { return <div className={styles.issueList}>{[["音变规则","3 条规则尚未验证"],["词典","7 个词条缺少来源"],["阶段","失落世纪被标记为无记录"]].map(([group,text])=><button key={text}><ExclamationTriangleIcon aria-hidden="true" /><span><strong>{text}</strong><small>{group}</small></span><ChevronRightIcon aria-hidden="true" /></button>)}</div>; }
function documentationLabel(value?: PrototypeLanguage["stages"][number]["documentation"]) { return value === "recorded" ? "有记录" : value === "partial" ? "部分记录" : value === "unrecorded" ? "无记录" : value === "reconstructed" ? "重构" : "未设置"; }
