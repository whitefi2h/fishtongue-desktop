import { Language, LanguageRelation, LanguageStage } from "@/fishtongue/domain/models";
import { layoutGenealogy } from "@/fishtongue/ui/GenealogyCanvas";

const now = "2026-08-07T00:00:00Z";
const languages: Language[] = [
  language("root", "祖语"),
  language("left", "东支"),
  language("right", "西支"),
  language("leaf", "海岸语"),
];
const relations: LanguageRelation[] = [
  relation("r1", "root", "left"),
  relation("r2", "root", "right"),
  relation("r3", "left", "leaf"),
];

describe("genealogy layout", () => {
  it("places descendants below their ancestors without overlapping nodes", () => {
    const layout = layoutGenealogy(languages, relations, new Map(), new Set());
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    expect(byId.get("left")!.y).toBeGreaterThan(byId.get("root")!.y);
    expect(byId.get("leaf")!.y).toBeGreaterThan(byId.get("left")!.y);
    expect(rectanglesOverlap(byId.get("left")!, byId.get("right")!)).toBe(false);
  });

  it("reserves vertical space when stages are expanded", () => {
    const stages = new Map<string, LanguageStage[]>([["root", [stage("s1", 1), stage("s2", 2)]]]);
    const collapsed = layoutGenealogy(languages, relations, stages, new Set());
    const expanded = layoutGenealogy(languages, relations, stages, new Set(["root"]));
    const collapsedChild = collapsed.nodes.find((node) => node.id === "left")!;
    const expandedChild = expanded.nodes.find((node) => node.id === "left")!;
    expect(expandedChild.y).toBeGreaterThan(collapsedChild.y);
  });
});

function language(id: string, name: string): Language {
  return { id, name, projectId: "p1", createdAt: now, updatedAt: now };
}
function relation(id: string, sourceLanguageId: string, targetLanguageId: string): LanguageRelation {
  return { id, projectId: "p1", sourceLanguageId, targetLanguageId, kind: "genetic", isPrimary: true, confidence: "confirmed", notes: "", createdAt: now, updatedAt: now };
}
function stage(id: string, position: number): LanguageStage {
  return { id, languageId: "root", name: id, kind: "historical_stage", documentationStatus: "recorded", storageMode: "inherited_delta", startLabel: "", endLabel: "", position, visible: true, createdAt: now, updatedAt: now };
}
function rectanglesOverlap(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}
