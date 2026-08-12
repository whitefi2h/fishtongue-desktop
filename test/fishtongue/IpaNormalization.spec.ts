import {
  ipaInputAliases,
  normalizeIpaForAnalysis,
} from "@/fishtongue/application/services/IpaNormalization";

test("normalizes Latin g only at the PanPhon analysis boundary", () => {
  expect(normalizeIpaForAnalysis("bagu")).toBe("baɡu");
  expect(normalizeIpaForAnalysis("baɡu")).toBe("baɡu");
});

test("exposes Latin g and IPA ɡ as equivalent input aliases", () => {
  expect(ipaInputAliases("g")).toEqual(["g", "ɡ"]);
  expect(ipaInputAliases("ɡ")).toEqual(["ɡ", "g"]);
});
