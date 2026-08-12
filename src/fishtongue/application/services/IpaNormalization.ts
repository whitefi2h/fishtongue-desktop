const LATIN_SMALL_G = "g";
const IPA_SMALL_G = "ɡ";

/**
 * PanPhon expects the IPA single-storey g (U+0261). Users commonly type the
 * visually similar Latin g (U+0067), so analysis treats both as the same
 * sound while repositories and editors retain the user's original spelling.
 */
export function normalizeIpaForAnalysis(value: string): string {
  return value.normalize("NFC").replaceAll(LATIN_SMALL_G, IPA_SMALL_G);
}

export function ipaInputAliases(value: string): string[] {
  const normalized = value.normalize("NFC");
  return [
    normalized,
    normalized.replaceAll(LATIN_SMALL_G, IPA_SMALL_G),
    normalized.replaceAll(IPA_SMALL_G, LATIN_SMALL_G),
  ].filter((item, index, values) => item && values.indexOf(item) === index);
}
