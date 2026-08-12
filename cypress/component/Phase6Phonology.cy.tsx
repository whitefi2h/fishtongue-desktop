import { Phase6Application } from "@/fishtongue/application/ports/Phase6Application";
import { PhonologyProfile } from "@/fishtongue/domain/models";
import PhonologyWorkspace from "@/fishtongue/ui/PhonologyWorkspace";

const now = "2026-08-09T00:00:00.000Z";

function fixture() {
  let saved: PhonologyProfile | undefined;
  const profile: PhonologyProfile = {
    id: "phonology",
    languageId: "language",
    structureVersion: "phonology-profile-v1",
    syllableTemplates: [],
    legalOnsets: [],
    legalNuclei: [],
    legalCodas: [],
    legalClusters: [],
    forbiddenPatterns: [],
    stressRules: {},
    toneRules: {},
    phonemes: [],
    createdAt: now,
    updatedAt: now,
  };
  const application = {
    getPhonology: async () => structuredClone(profile),
    savePhonology: async (value: PhonologyProfile) => {
      saved = structuredClone(value);
    },
    validateIpa: async () => ({ valid: true, segments: ["tʰ", "a", "ŋ"], unknown: [] }),
    validatePhonotactics: () => ({
      valid: true,
      segments: ["tʰ", "a", "ŋ"],
      structure: "CVC",
      warnings: [],
    }),
  } as unknown as Phase6Application;
  return { application, getSaved: () => saved };
}

describe("Phase 6 formal phonology workspace", () => {
  it("auto-saves the formal inventory and preserves multi-line phonotactics", () => {
    const value = fixture();
    cy.mount(
      <PhonologyWorkspace
        application={value.application}
        languageId="language"
        onStatus={() => undefined}
      />
    );
    cy.contains("button", "添加音位").click();
    cy.get('input[aria-label="IPA"]').type("p");
    cy.get('input[aria-label="显示符号"]').type("p");
    cy.contains("button", "音节与音位配列").click();
    cy.contains("label", "音节模板").find("textarea").type("CV{enter}CVC");
    cy.contains("label", "合法韵核").find("textarea").type("a");
    cy.contains("button", "保存音系").should("not.exist");
    cy.contains("已自动保存", { timeout: 3000 }).should("be.visible").then(() => {
      expect(value.getSaved()?.phonemes[0].ipa).to.equal("p");
      expect(value.getSaved()?.syllableTemplates).to.deep.equal(["CV", "CVC"]);
    });
  });

  it("checks an IPA list through the analysis port", () => {
    const value = fixture();
    cy.mount(
      <PhonologyWorkspace
        application={value.application}
        languageId="language"
        onStatus={() => undefined}
      />
    );
    cy.contains("button", "检查").click();
    cy.contains("label", "IPA 列表").find("textarea").type("tʰaŋ{enter}sal");
    cy.contains("button", "检查列表").click();
    cy.contains("tʰaŋ").should("be.visible");
    cy.contains("sal").should("be.visible");
    cy.contains("已识别").should("be.visible");
    cy.contains("符合").should("be.visible");
  });
});
