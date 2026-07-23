import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import UnavailableSoundChangeEngine from "@/fishtongue/infrastructure/UnavailableSoundChangeEngine";
import DesktopSoundChangePage from "@/fishtongue/ui/DesktopSoundChangePage";

describe("DesktopSoundChangePage", () => {
  function mountDesktopPage() {
    const service = new SoundChangeService(new UnavailableSoundChangeEngine());
    cy.mount(<DesktopSoundChangePage soundChangeService={service} />);
  }

  it("supports editing, undo and syntax highlighting", () => {
    mountDesktopPage();

    cy.get('[aria-label="Sound Changes"]')
      .click()
      .type("{ctrl}a")
      .type("test-rule:{enter}  a => e")
      .type(" temporary")
      .type("{ctrl}z");

    cy.get(".cm-content").should("contain.text", "test-rule:");
    cy.get(".cm-content").should("not.contain.text", "temporary");
    cy.get(".tok-className").should("exist");
    cy.get(".cm-gutterElement").should("exist");
  });

  it("supports bracket completion and redo", () => {
    mountDesktopPage();

    cy.get(".cm-content")
      .invoke("text")
      .then((initialCode) => {
        cy.get('[aria-label="Sound Changes"]')
          .click()
          .type("{ctrl}a")
          .type("(");

        cy.get(".cm-content").should("have.text", `(${initialCode})`);

        cy.get('[aria-label="Sound Changes"]').type("{ctrl}z");
        cy.get(".cm-content").should("have.text", initialCode);

        cy.get('[aria-label="Sound Changes"]').type("{ctrl}y");
        cy.get(".cm-content").should("have.text", `(${initialCode})`);
      });
  });

  it("shows the honest Phase 0 engine state", () => {
    mountDesktopPage();

    cy.contains("尚未接入").should("be.visible");
    cy.contains("不会发送网络请求").should("be.visible");
    cy.contains("Apply").should("not.exist");
  });
});
