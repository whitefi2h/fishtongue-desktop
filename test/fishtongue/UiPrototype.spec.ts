import { localeMessageKeys } from "@/fishtongue/ui/prototype/i18n";
import { routeRegistry } from "@/fishtongue/ui/prototype/registry";

describe("Phase 1.5 UI prototype contracts", () => {
  it("keeps every workspace route unique and explicitly classified", () => {
    expect(new Set(routeRegistry.map((route) => route.id)).size).toBe(routeRegistry.length);
    expect(routeRegistry.every((route) => ["live", "prototype", "planned"].includes(route.state))).toBe(true);
  });

  it("keeps Chinese and English resource keys aligned", () => {
    expect(localeMessageKeys["en-US"].sort()).toEqual(localeMessageKeys["zh-CN"].sort());
  });
});
