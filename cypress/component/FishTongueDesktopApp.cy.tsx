import { DesktopWindowPort, WindowState } from "@/fishtongue/application/ports/DesktopWindowPort";
import { ProjectApplication, ProjectSnapshot } from "@/fishtongue/application/ports/ProjectApplication";
import { Evolution, InflectionSystem, Language, Lexeme, RecoveryCandidate } from "@/fishtongue/domain/models";
import FishTongueDesktopApp from "@/fishtongue/ui/FishTongueDesktopApp";

class TestWindowPort implements DesktopWindowPort {
  calls: string[] = [];
  state: WindowState = { isMaximized: false, isFocused: true };
  closeRequested?: () => void | Promise<void>;
  async startDragging() { this.calls.push("drag"); }
  async minimize() { this.calls.push("minimize"); }
  async toggleMaximize() { this.calls.push("maximize"); this.state.isMaximized = !this.state.isMaximized; }
  async close() { this.calls.push("close"); }
  async isMaximized() { return this.state.isMaximized; }
  async subscribeWindowState(listener: (state: WindowState) => void) { listener(this.state); return () => undefined; }
  async subscribeCloseRequested(listener: () => void | Promise<void>) {
    this.closeRequested = listener;
    return () => { this.closeRequested = undefined; };
  }
  async requestSystemClose() { await this.closeRequested?.(); }
}

class TestApplication implements ProjectApplication {
  writes = 0;
  snapshot: ProjectSnapshot | null = null;
  recovery: RecoveryCandidate | null = null;
  lexemes: Lexeme[] = [];
  closes = 0;
  abandons = 0;
  async createProject(name: string) {
    const now = new Date().toISOString();
    this.writes += 1;
    this.snapshot = {
      session: {
        manifest: { formatVersion: 1, databaseSchemaVersion: 1, projectId: "p1", name, createdAt: now, updatedAt: now, appVersion: "test" },
        sourcePath: "D:\\Languages\\test.fishtongue", requiresSaveAs: false, recovered: false,
      },
      project: { id: "p1", name, createdAt: now, updatedAt: now },
      languages: [], dirty: false,
    };
    return this.snapshot;
  }
  async openProject() { return this.snapshot; }
  async importProject() { return this.snapshot; }
  async saveProject() { this.writes += 1; return this.snapshot!; }
  async saveProjectAs() {
    this.writes += 1;
    if (this.snapshot) {
      this.snapshot = {
        ...this.snapshot,
        session: { ...this.snapshot.session, requiresSaveAs: false },
        dirty: false,
      };
    }
    return this.snapshot;
  }
  async closeProject() { this.closes += 1; this.snapshot = null; }
  async abandonProject() { this.abandons += 1; this.snapshot = null; }
  async recoverProject() { return this.snapshot!; }
  async discardRecovery() { this.recovery = null; }
  async inspectRecovery() { return this.recovery; }
  async listRecentProjects() { return []; }
  async listLanguages(): Promise<Language[]> { return []; }
  async createLanguage(name: string): Promise<Language> {
    if (!this.snapshot) throw new Error("当前没有打开的项目");
    const now = new Date().toISOString();
    const language: Language = {
      id: `language-${this.snapshot.languages.length + 1}`,
      projectId: this.snapshot.project.id,
      name,
      createdAt: now,
      updatedAt: now,
    };
    this.writes += 1;
    this.snapshot = {
      ...this.snapshot,
      languages: [...this.snapshot.languages, language],
    };
    return language;
  }
  async renameLanguage() { throw new Error("prototype must not persist"); }
  async deleteLanguage() { throw new Error("prototype must not persist"); }
  async listLexemes(languageId: string): Promise<Lexeme[]> {
    return this.lexemes.filter((lexeme) => lexeme.languageId === languageId);
  }
  async saveLexeme(lexeme: Lexeme) {
    this.writes += 1;
    this.lexemes = [
      ...this.lexemes.filter((value) => value.id !== lexeme.id),
      lexeme,
    ];
  }
  async deleteLexeme(id: string) {
    this.writes += 1;
    this.lexemes = this.lexemes.filter((lexeme) => lexeme.id !== id);
  }
  async listMorphemes() { return []; }
  async saveMorpheme() { this.writes += 1; }
  async deleteMorpheme() { this.writes += 1; }
  async listWordGenerationProfiles() { return []; }
  async saveWordGenerationProfile() { this.writes += 1; }
  async deleteWordGenerationProfile() { this.writes += 1; }
  async listConceptLists() { return []; }
  async saveConceptList() { this.writes += 1; }
  async deleteConceptList() { this.writes += 1; }
  async listGenerationBatches() { return []; }
  async createGenerationBatch() { this.writes += 1; }
  async saveGenerationCandidate() { this.writes += 1; }
  async commitGenerationBatch() { this.writes += 1; }
  async dismissGenerationBatch() { this.writes += 1; }
  async listLexiconBatchOperations() { return []; }
  async undoLexiconBatchOperation() { this.writes += 1; }
  async getEvolution(): Promise<Evolution> { throw new Error("prototype must not persist"); }
  async saveEvolution() { throw new Error("prototype must not persist"); }
  async getInflectionSystem(): Promise<InflectionSystem> { throw new Error("prototype must not persist"); }
  async saveInflectionSystem() { throw new Error("prototype must not persist"); }
  getSnapshot() { return this.snapshot; }
}

describe("FishTongue Phase 1.5 desktop prototype", () => {
  beforeEach(() => cy.viewport(1440, 900));

  it("keeps a new real project empty until the user creates a real language", () => {
    const app = new TestApplication();
    cy.mount(<FishTongueDesktopApp application={app} windowPort={new TestWindowPort()} />);

    cy.contains("新建项目").click();
    cy.get("input[name='project-name']").clear().type("真实测试项目");
    cy.contains("button", "创建并选择位置").click();

    cy.contains("项目中还没有语言").should("be.visible");
    cy.contains("北海编年史").should("not.exist");
    cy.contains("阿兰语").should("not.exist");

    cy.contains("button", "创建第一门语言").click();
    cy.get("input[name='language-name']").clear().type("测试祖语");
    cy.contains("button", "进入语言工作区").click();

    cy.get("[aria-label='当前位置']").should("contain.text", "真实测试项目");
    cy.get("[aria-label='当前位置']").should("contain.text", "测试祖语");
    cy.contains("真实项目模式").should("be.visible");
    cy.wrap(null).then(() => {
      expect(app.snapshot?.languages.map((language) => language.name)).to.deep.equal(["测试祖语"]);
    });
  });

  it("creates a persistent lexeme for the current real language", () => {
    const app = new TestApplication();
    cy.mount(<FishTongueDesktopApp application={app} windowPort={new TestWindowPort()} />);

    cy.contains("新建项目").click();
    cy.get("input[name='project-name']").clear().type("真实词典项目");
    cy.contains("button", "创建并选择位置").click();
    cy.contains("button", "创建第一门语言").click();
    cy.get("input[name='language-name']").clear().type("测试语言");
    cy.contains("button", "进入语言工作区").click();
    cy.contains("h1", "概览").should("be.visible");
    cy.get("[aria-label='工作区导航']").contains("button", "词典").click();

    cy.contains("当前语言还没有词条").should("be.visible");
    cy.get("button[form='lexeme-editor-form']").should("be.visible");
    cy.get("input[name='lexeme-romanized']").should("be.enabled").type("ama");
    cy.get("input[name='lexeme-part-of-speech']").should("be.enabled").clear();
    cy.get("input[name='lexeme-part-of-speech']").should("be.enabled").type("名词");
    cy.get("textarea[name='lexeme-senses']").should("be.enabled").type("母亲{enter}女性长辈");
    cy.get("button[form='lexeme-editor-form']").click();

    cy.contains("td", "ama").should("exist");
    cy.contains("td", "母亲").should("exist");
    cy.wrap(null).then(() => {
      expect(app.lexemes).to.have.length(1);
      expect(app.lexemes[0].languageId).to.equal("language-1");
      expect(app.lexemes[0].senses.map((sense) => sense.definition)).to.deep.equal([
        "母亲",
        "女性长辈",
      ]);
    });

    cy.get("textarea[name='lexeme-notes']").type("人工修改");
    cy.get("button[form='lexeme-editor-form']").should("be.visible").click();
    cy.wrap(null).then(() => {
      expect(app.lexemes[0].notes).to.equal("人工修改");
    });
  });

  it("closes the active project before the custom title-bar closes the window", () => {
    const app = new TestApplication();
    const windowPort = new TestWindowPort();
    cy.then(() => app.createProject("正常关闭测试"));
    cy.mount(<FishTongueDesktopApp application={app} windowPort={windowPort} />);

    cy.get("button[title='关闭']").click();
    cy.wrap(null).then(() => {
      expect(app.closes).to.equal(1);
      expect(app.snapshot).to.equal(null);
      expect(windowPort.calls).to.include("close");
    });
  });

  it("closes immediately from the welcome page when no project is open", () => {
    const app = new TestApplication();
    const windowPort = new TestWindowPort();
    cy.mount(<FishTongueDesktopApp application={app} windowPort={windowPort} />);

    cy.get("button[title='关闭']").click();
    cy.wrap(null).then(() => {
      expect(app.closes).to.equal(0);
      expect(windowPort.calls).to.include("close");
    });
  });

  it("offers an explicit discard-and-exit path for a recovered project", () => {
    const app = new TestApplication();
    const windowPort = new TestWindowPort();
    cy.then(async () => {
      await app.createProject("恢复退出测试");
      app.snapshot = {
        ...app.snapshot!,
        session: { ...app.snapshot!.session, requiresSaveAs: true, recovered: true },
        dirty: true,
      };
    });
    cy.mount(<FishTongueDesktopApp application={app} windowPort={windowPort} />);

    cy.get("button[title='关闭']").click();
    cy.contains("保存项目后退出").should("be.visible");
    cy.contains("button", "放弃恢复并退出").click();
    cy.wrap(null).then(() => {
      expect(app.abandons).to.equal(1);
      expect(app.snapshot).to.equal(null);
      expect(windowPort.calls).to.include("close");
    });
  });

  it("closes the active project before an operating-system close request", () => {
    const app = new TestApplication();
    const windowPort = new TestWindowPort();
    cy.then(() => app.createProject("系统关闭测试"));
    cy.mount(<FishTongueDesktopApp application={app} windowPort={windowPort} />);

    cy.then(() => windowPort.requestSystemClose());
    cy.wrap(null).then(() => {
      expect(app.closes).to.equal(1);
      expect(app.snapshot).to.equal(null);
      expect(windowPort.calls).to.include("close");
    });
  });

  it("lets the user discard a stale recovery workspace before creating a project", () => {
    const app = new TestApplication();
    const now = new Date().toISOString();
    app.recovery = {
      manifest: {
        formatVersion: 1,
        databaseSchemaVersion: 2,
        projectId: "stale-project",
        name: "未完成项目",
        createdAt: now,
        updatedAt: now,
        appVersion: "test",
      },
      sourcePath: "D:\\Languages\\stale.fishtongue",
    };

    cy.mount(<FishTongueDesktopApp application={app} windowPort={new TestWindowPort()} />);
    cy.contains("发现未正常关闭的项目").should("be.visible");
    cy.contains("button", "丢弃工作区").click();
    cy.contains("发现未正常关闭的项目").should("not.exist");
    cy.wrap(null).then(() => expect(app.recovery).to.equal(null));
  });

  it("uses custom chrome and exposes the complete workspace", () => {
    const app = new TestApplication();
    const windowPort = new TestWindowPort();
    cy.mount(<FishTongueDesktopApp application={app} windowPort={windowPort} />);

    cy.contains("FishTongue").should("be.visible");
    cy.get("[aria-label='应用菜单']").within(() => {
      cy.contains("文件").should("be.visible");
      cy.contains("语言").should("be.visible");
      cy.contains("工具").should("be.visible");
    });
    cy.get("[aria-label='最小化']").click().then(() => expect(windowPort.calls).to.include("minimize"));
    cy.get("[data-tauri-drag-region]")
      .trigger("mousedown", { button: 0, detail: 1 })
      .then(() => expect(windowPort.calls).to.include("drag"));
    cy.get("[data-tauri-drag-region]")
      .trigger("mousedown", { button: 0, detail: 2 })
      .then(() => expect(windowPort.calls).to.include("maximize"));
    cy.contains("浏览设计原型").click();
    cy.contains("语言概览").should("be.visible");
    cy.contains("button", "阿兰语").first().click();
    cy.contains("词典").should("be.visible").click();
    cy.contains("筛选与分类").should("be.visible");
    cy.contains("ama").should("be.visible");
    expect(app.writes).to.equal(0);
  });

  it("covers key prototype pages without writing project data", () => {
    const app = new TestApplication();
    cy.mount(<FishTongueDesktopApp application={app} windowPort={new TestWindowPort()} />);
    cy.contains("浏览设计原型").click();
    for (const page of ["语言谱系", "历史事件"]) {
      cy.contains("button", page).first().click();
      cy.contains("h1", page).should("be.visible");
      cy.contains("设计预览").should("be.visible");
    }
    cy.contains("button", "项目主页").first().click();
    cy.contains("button", "阿兰语").first().click();
    for (const page of ["语音学", "形态学", "书写系统", "演化", "语言接触", "辅助翻译"]) {
      cy.contains("button", page).first().click();
      cy.contains("h1", page).should("be.visible");
      cy.contains("设计预览").should("be.visible");
    }
    expect(app.writes).to.equal(0);
  });

  it("renders light and dark layouts at the two acceptance sizes", () => {
    cy.mount(<FishTongueDesktopApp application={new TestApplication()} windowPort={new TestWindowPort()} />);
    cy.contains("浏览设计原型").click();
    cy.get("button[title='切换主题']").click();
    cy.get("[data-theme='light']").should("exist");
    cy.screenshot("phase-1-5/project-home-light-1440x900");
    cy.get("button[title='切换界面语言']").click();
    cy.contains("Project home").should("be.visible");
    cy.get("[aria-label='Application menu']").within(() => cy.contains("File").should("be.visible"));
    cy.get("button[title='切换主题']").click();
    cy.get("[data-theme='dark']").should("exist");
    cy.screenshot("phase-1-5/project-home-dark-1440x900");
    cy.viewport(1280, 800);
    cy.contains("button", "阿兰语").first().click();
    cy.contains("button", "Lexicon").first().click();
    cy.screenshot("phase-1-5/lexicon-dark-1280x800");
    cy.document().then((document) => expect(document.documentElement.scrollWidth).to.equal(1280));
  });

  it("keeps light tables readable and the compact navigation clean", () => {
    cy.mount(<FishTongueDesktopApp application={new TestApplication()} windowPort={new TestWindowPort()} />);
    cy.contains("浏览设计原型").click();
    cy.get("button[title='切换主题']").click();
    cy.get("[data-theme='light']").should("exist");
    cy.contains("button", "阿兰语").first().click();
    cy.contains("button", "形态学").first().click();
    cy.get("tbody td").first().should(($cell) => {
      const style = getComputedStyle($cell[0]);
      expect(style.backgroundColor).to.equal("rgb(255, 255, 255)");
      expect(style.color).to.equal("rgb(23, 25, 29)");
    });
    cy.screenshot("phase-1-5/morphology-light-table-fixed");
    cy.get("button[aria-label='折叠导航']").click();
    cy.get("[data-nav-collapsed='true']").should("exist");
    cy.get("[aria-label='工作区导航']").should(($navigation) => {
      const element = $navigation[0];
      expect(element.getBoundingClientRect().width).to.equal(48);
      expect(getComputedStyle(element).overflowX).to.equal("hidden");
    });
    cy.get("button[aria-label='展开导航']").should("be.visible");
    cy.screenshot("phase-1-5/compact-navigation-fixed");
  });

  it("separates project and language levels and makes the context path actionable", () => {
    cy.mount(<FishTongueDesktopApp application={new TestApplication()} windowPort={new TestWindowPort()} />);
    cy.contains("浏览设计原型").click();

    cy.get("[aria-label='当前位置']").within(() => {
      cy.contains("北海编年史").should("be.visible");
      cy.contains("项目主页").should("be.visible");
      cy.contains("阿兰语").should("not.exist");
    });
    cy.get("[aria-label='工作区导航']").within(() => {
      cy.contains("所有语言").should("be.visible");
      cy.contains("基本属性").should("not.exist");
    });

    cy.contains("button", "阿兰语").first().click();
    cy.get("[aria-label='当前位置']").within(() => {
      cy.contains("北海编年史").should("be.visible");
      cy.contains("阿兰语").should("be.visible");
      cy.contains("圣典时代").should("be.visible");
      cy.contains("概览").should("be.visible");
    });
    cy.get("[aria-label='工作区导航']").within(() => {
      cy.contains("项目主页").should("be.visible");
      cy.contains("所有语言").should("not.exist");
      cy.contains("基本属性").should("be.visible");
    });

    cy.get("[aria-label='当前位置']").contains("button", "圣典时代").click();
    cy.get("[role='menu']").contains("button", "诸王时期").click();
    cy.get("[aria-label='当前位置']").should("contain.text", "诸王时期");

    cy.get("[aria-label='当前位置']").contains("button", "阿兰语").click();
    cy.get("[role='menu']").contains("button", "诺尔语").click();
    cy.get("[aria-label='当前位置']").should("contain.text", "诺尔语").and("contain.text", "默认状态");
    cy.screenshot("phase-1-5/project-language-hierarchy");

    cy.get("[aria-label='当前位置']").contains("button", "北海编年史").click();
    cy.contains("h1", "项目主页").should("be.visible");
    cy.get("[aria-label='当前位置']").should("not.contain.text", "诺尔语");
  });

  it("keeps passive navigation collapse and constrained pages inside the workspace", () => {
    cy.viewport(1100, 800);
    cy.mount(<FishTongueDesktopApp application={new TestApplication()} windowPort={new TestWindowPort()} />);
    cy.contains("浏览设计原型").click();
    cy.contains("button", "阿兰语").first().click();
    cy.contains("button", "阶段管理").first().click();
    cy.get("button[title='AI 侧栏']").click();

    cy.get("[aria-label='工作区导航']").should(($navigation) => {
      const style = getComputedStyle($navigation[0]);
      expect($navigation[0].getBoundingClientRect().width).to.equal(48);
      expect(style.scrollbarWidth).to.equal("none");
    });
    let workspaceWidth = 0;
    let aiWidth = 0;
    cy.get("#main-workspace").then(($workspace) => {
      workspaceWidth = $workspace[0].getBoundingClientRect().width;
    });
    cy.get("aside").contains("AI 助手").parents("aside").then(($sidebar) => {
      aiWidth = $sidebar[0].getBoundingClientRect().width;
    });
    cy.get("button[aria-label='展开导航']").click();
    cy.get("[data-nav-overlay-open='true']").should("exist");
    cy.get("[aria-label='工作区导航']").should(($navigation) => {
      expect($navigation[0].getBoundingClientRect().width).to.equal(220);
      expect(getComputedStyle($navigation[0]).position).to.equal("absolute");
    });
    cy.get("#main-workspace").should(($workspace) => {
      expect($workspace[0].getBoundingClientRect().width).to.equal(workspaceWidth);
    });
    cy.get("aside").contains("AI 助手").parents("aside").should(($sidebar) => {
      expect($sidebar[0].getBoundingClientRect().width).to.equal(aiWidth);
    });
    cy.screenshot("phase-1-5/navigation-overlay-constrained");
    cy.get("#main-workspace").click("topRight");
    cy.get("[data-nav-overlay-open='false']").should("exist");
    cy.get("[aria-label='工作区导航']").should(($navigation) => {
      expect($navigation[0].getBoundingClientRect().width).to.equal(48);
    });
    cy.get("#main-workspace").should(($workspace) => {
      expect($workspace[0].scrollWidth).to.be.at.most($workspace[0].clientWidth);
    });
    cy.get("#main-workspace input").each(($input) => {
      const input = $input[0].getBoundingClientRect();
      const workspace = Cypress.$("#main-workspace")[0].getBoundingClientRect();
      expect(input.right).to.be.at.most(workspace.right);
    });
    cy.get("[aria-label='工作区导航']").should(($navigation) => {
      expect($navigation[0].scrollHeight).to.be.at.most($navigation[0].clientHeight);
    });
    cy.get("aside").contains("AI 助手").parents("aside").within(() => {
      cy.contains("检查当前音位表").should("be.visible");
      cy.get("textarea").should("be.visible");
    });
    cy.get("aside").contains("AI 助手").parents("aside").find("div").filter((_index, element) => {
      return getComputedStyle(element).overflowY === "auto";
    }).first().should(($conversation) => {
      expect($conversation[0].scrollHeight).to.be.at.most($conversation[0].clientHeight);
    });
    cy.screenshot("phase-1-5/language-level-ai-constrained");
  });

  it("returns to the previous workspace page from the context toolbar", () => {
    cy.viewport(1360, 860);
    cy.mount(<FishTongueDesktopApp application={new TestApplication()} windowPort={new TestWindowPort()} />);
    cy.contains("浏览设计原型").click();
    cy.get("button[aria-label='返回上一页']").should("be.disabled");
    cy.contains("button", "阿兰语").first().click();
    cy.contains("button", "基本属性").first().click();
    cy.contains("h1", "基本属性").should("be.visible");
    cy.get("button[aria-label='返回上一页']").should("be.enabled").click();
    cy.contains("h1", "概览").should("be.visible");
    cy.get("body").trigger("keydown", { altKey: true, key: "ArrowLeft" });
    cy.contains("h1", "项目主页").should("be.visible");
  });

  it("automatically narrows the AI sidebar without clipping its contents", () => {
    cy.viewport(1440, 900);
    cy.mount(<FishTongueDesktopApp application={new TestApplication()} windowPort={new TestWindowPort()} />);
    cy.contains("浏览设计原型").click();
    cy.get("button[title='AI 侧栏']").click();

    let standardWidth = 0;
    cy.get("aside").contains("AI 助手").parents("aside").then(($sidebar) => {
      standardWidth = $sidebar[0].getBoundingClientRect().width;
      expect(standardWidth).to.be.within(260, 360);
    });

    cy.viewport(1100, 800);
    cy.get("aside").contains("AI 助手").parents("aside").should(($sidebar) => {
      const sidebar = $sidebar[0];
      expect(sidebar.getBoundingClientRect().width).to.be.within(260, standardWidth);
      expect(sidebar.scrollWidth).to.be.at.most(sidebar.clientWidth);
    }).within(() => {
      cy.contains("从当前页面开始").should("be.visible");
      cy.contains("检查当前音位表").should("be.visible");
      cy.get("label").last().should(($label) => {
        const label = $label[0].getBoundingClientRect();
        const sidebar = $label[0].closest("aside")!.getBoundingClientRect();
        expect(label.right).to.be.at.most(sidebar.right);
      });
      cy.get("textarea").should(($textarea) => {
        const textarea = $textarea[0].getBoundingClientRect();
        const sidebar = $textarea[0].closest("aside")!.getBoundingClientRect();
        expect(textarea.right).to.be.at.most(sidebar.right);
      });
    });
    cy.screenshot("phase-1-5/ai-sidebar-responsive-minimum");
  });

  it("keeps the languages table readable and selection subtle at minimum width", () => {
    cy.viewport(1360, 860);
    cy.mount(<FishTongueDesktopApp application={new TestApplication()} windowPort={new TestWindowPort()} />);
    cy.contains("浏览设计原型").click();
    cy.contains("button", "所有语言").first().click();
    cy.get("button[title='AI 侧栏']").click();

    cy.get("table").should(($table) => {
      expect(getComputedStyle($table[0]).tableLayout).to.equal("fixed");
      expect($table[0].scrollWidth).to.be.at.least(780);
    });
    cy.get("table tbody td").each(($cell) => {
      expect(getComputedStyle($cell[0]).whiteSpace).to.equal("nowrap");
    });
    cy.get("table tbody button").first().focus().should(($button) => {
      const style = getComputedStyle($button[0]);
      expect(style.backgroundColor).to.equal("rgba(0, 0, 0, 0)");
      expect($button[0].getBoundingClientRect().width).to.be.greaterThan(80);
    });
    cy.screenshot("phase-1-5/languages-dark-minimum-window");

    cy.get("button[title='切换主题']").click();
    cy.get("[data-theme='light']").should("exist");
    cy.get("table tbody button").first().focus().should(($button) => {
      expect(getComputedStyle($button[0]).backgroundColor).to.equal("rgba(0, 0, 0, 0)");
    });
    cy.screenshot("phase-1-5/languages-light-minimum-window");
    cy.document().then((document) => expect(document.documentElement.scrollWidth).to.equal(1360));
  });

  it("keeps menu and dialog focus predictable", () => {
    cy.mount(<FishTongueDesktopApp application={new TestApplication()} windowPort={new TestWindowPort()} />);
    cy.get("body").trigger("keydown", { key: "Alt" });
    cy.focused().should("contain.text", "文件");
    cy.focused().trigger("keydown", { key: "ArrowDown" });
    cy.focused().should("contain.text", "新建项目");
    cy.focused().trigger("keydown", { key: "ArrowDown" });
    cy.focused().should("contain.text", "打开项目");
    cy.get("body").trigger("keydown", { key: "Escape" });
    cy.focused().should("contain.text", "文件");

    cy.contains("浏览设计原型").click();
    cy.get("button[title='全局搜索']").focus().click();
    cy.get("[role='dialog']").should("be.visible");
    cy.focused().should("have.attr", "data-dialog-initial-focus");
    cy.get("[role='dialog']").trigger("keydown", { key: "Escape" });
    cy.get("[role='dialog']").should("not.exist");
    cy.document().should((document) => {
      expect(document.activeElement?.getAttribute("title")).to.equal("全局搜索");
    });
  });

  it("exposes accessible names, status updates, and compound-control focus", () => {
    cy.mount(<FishTongueDesktopApp application={new TestApplication()} windowPort={new TestWindowPort()} />);
    cy.contains("浏览设计原型").click();

    cy.get("svg").each(($icon) => {
      expect($icon.attr("aria-hidden")).to.equal("true");
    });
    cy.get("[aria-live='polite']").should("exist").and("have.attr", "aria-atomic", "true");
    cy.get("button").each(($button) => {
      const accessibleName = $button.attr("aria-label")?.trim() || $button.text().trim();
      expect(accessibleName, "every button has an accessible name").not.to.equal("");
    });

    cy.get("button[title='全局搜索']").click();
    cy.get("input[name='global-search']")
      .should("have.attr", "aria-label", "搜索页面、语言、词条或命令")
      .and("have.attr", "autocomplete", "off")
      .focus();
    cy.get("input[name='global-search']").parent().should(($field) => {
      expect(getComputedStyle($field[0]).outlineStyle).to.equal("solid");
    });
  });
});
