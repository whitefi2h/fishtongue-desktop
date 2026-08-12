import { Phoneme, PhonemeClass, PhonologyProfile } from "@/fishtongue/domain/models";
import { ipaInputAliases } from "@/fishtongue/application/services/IpaNormalization";

export interface PhonotacticsValidationResult {
  valid: boolean;
  segments: string[];
  structure: string;
  warnings: string[];
}

type TemplateSymbol = "C" | "V" | "N";

interface SegmentDefinition {
  ipa: string;
  canonicalIpa: string;
  category: PhonemeClass;
}

interface ResolvedSegment extends SegmentDefinition {
  inputIpa: string;
}

interface ParsedTemplate {
  source: string;
  symbols: TemplateSymbol[];
}

interface TokenizationResult {
  segments: ResolvedSegment[];
  unknownSymbols: string[];
}

const NASAL_CONSONANTS = new Set(["m", "ɱ", "n", "ɳ", "ɲ", "ŋ", "ɴ"]);

/**
 * PanPhon answers whether IPA symbols exist. This service answers whether the
 * recognized symbols belong to this language and satisfy its saved phonotactics.
 */
export function validatePhonotactics(
  form: string,
  profile: PhonologyProfile
): PhonotacticsValidationResult {
  const definitions = buildSegmentDefinitions(profile.phonemes);
  const tokenization = tokenize(form, definitions);
  if (tokenization.unknownSymbols.length) {
    return {
      valid: false,
      segments: tokenization.segments.map((segment) => segment.inputIpa),
      structure: "",
      warnings: [
        `包含本语言正式音位表之外的符号：${tokenization.unknownSymbols.join("、")}`,
      ],
    };
  }

  const coreSegments = tokenization.segments.filter(
    (segment) => segment.category === "consonant" || segment.category === "vowel"
  );
  let structure = coreSegments
    .map((segment) => (segment.category === "vowel" ? "V" : "C"))
    .join("");
  const warnings: string[] = [];

  const parsedTemplates: ParsedTemplate[] = [];
  for (const template of profile.syllableTemplates) {
    const parsed = parseTemplate(template);
    if (parsed) parsedTemplates.push(parsed);
    else if (template.trim()) {
      warnings.push(`音节模板包含不支持的符号：${template}（仅支持 C、V、N）`);
    }
  }

  const syllables = matchSyllableTemplates(coreSegments, parsedTemplates);
  if (syllables) {
    structure = syllables.flatMap((template) => template.symbols).join("");
  }
  if (profile.syllableTemplates.length && !syllables) {
    warnings.push(`不符合音节模板：${structure || "空"}`);
  }

  const vowels = coreSegments.filter((segment) => segment.category === "vowel");
  if (!vowels.length) warnings.push("没有合法韵核");
  for (const vowel of vowels) {
    if (
      profile.legalNuclei.length &&
      !profile.legalNuclei.includes(vowel.canonicalIpa)
    ) {
      warnings.push(`非法韵核：${vowel.inputIpa}`);
    }
  }

  for (const cluster of consonantClusters(coreSegments)) {
    if (
      profile.legalClusters.length &&
      !profile.legalClusters.includes(cluster)
    ) {
      warnings.push(`非法音丛：${cluster}`);
    }
  }

  if (syllables) {
    let offset = 0;
    for (const template of syllables) {
      const syllableSegments = coreSegments.slice(
        offset,
        offset + template.symbols.length
      );
      offset += template.symbols.length;
      const firstVowel = template.symbols.indexOf("V");
      const lastVowel = template.symbols.lastIndexOf("V");
      if (firstVowel < 0) continue;
      const onset = syllableSegments
        .slice(0, firstVowel)
        .map((segment) => segment.canonicalIpa)
        .join("");
      const coda = syllableSegments
        .slice(lastVowel + 1)
        .map((segment) => segment.canonicalIpa)
        .join("");
      if (
        onset &&
        profile.legalOnsets.length &&
        !profile.legalOnsets.includes(onset) &&
        !profile.legalClusters.includes(onset)
      ) {
        warnings.push(`非法声母：${onset}`);
      }
      if (
        coda &&
        profile.legalCodas.length &&
        !profile.legalCodas.includes(coda) &&
        !profile.legalClusters.includes(coda)
      ) {
        warnings.push(`非法韵尾：${coda}`);
      }
    }
  }

  for (const pattern of profile.forbiddenPatterns) {
    try {
      if (
        ipaInputAliases(form).some((alias) =>
          new RegExp(pattern, "u").test(alias)
        )
      ) {
        warnings.push(`命中禁配：${pattern}`);
      }
    } catch {
      warnings.push(`禁配表达式无效：${pattern}`);
    }
  }

  const uniqueWarnings = [...new Set(warnings)];
  return {
    valid: uniqueWarnings.length === 0,
    segments: tokenization.segments.map((segment) => segment.inputIpa),
    structure,
    warnings: uniqueWarnings,
  };
}

function buildSegmentDefinitions(phonemes: Phoneme[]): SegmentDefinition[] {
  const formalById = new Map(
    phonemes
      .filter((phoneme) => phoneme.role === "phoneme")
      .map((phoneme) => [phoneme.id, phoneme] as const)
  );
  const byIpa = new Map<string, SegmentDefinition>();

  for (const phoneme of [...phonemes].sort((left, right) => {
    if (left.role === right.role) return left.position - right.position;
    return left.role === "phoneme" ? -1 : 1;
  })) {
    const ipa = phoneme.ipa.trim().normalize("NFC");
    if (!ipa) continue;
    const parent = phoneme.parentPhonemeId
      ? formalById.get(phoneme.parentPhonemeId)
      : undefined;
    for (const alias of ipaInputAliases(ipa)) {
      if (byIpa.has(alias)) continue;
      byIpa.set(alias, {
        ipa: alias,
        canonicalIpa: (parent?.ipa || ipa).trim().normalize("NFC"),
        category: parent?.category ?? phoneme.category,
      });
    }
  }

  return [...byIpa.values()].sort(
    (left, right) => right.ipa.length - left.ipa.length
  );
}

function tokenize(
  form: string,
  definitions: SegmentDefinition[]
): TokenizationResult {
  const trimmed = form.trim();
  const unwrapped =
    (trimmed.startsWith("/") && trimmed.endsWith("/")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ? trimmed.slice(1, -1)
      : trimmed;
  const normalized = unwrapped.normalize("NFC");
  const segments: ResolvedSegment[] = [];
  const unknownSymbols: string[] = [];
  let offset = 0;
  while (offset < normalized.length) {
    const match = definitions.find((definition) =>
      normalized.startsWith(definition.ipa, offset)
    );
    if (match) {
      segments.push({ ...match, inputIpa: match.ipa });
      offset += match.ipa.length;
      continue;
    }
    const unknown = Array.from(normalized.slice(offset))[0];
    if (!unknown) break;
    if (!unknownSymbols.includes(unknown)) unknownSymbols.push(unknown);
    offset += unknown.length;
  }
  return { segments, unknownSymbols };
}

function isNasal(ipa: string): boolean {
  const withoutCombiningMarks = ipa.normalize("NFD").replace(/\p{M}/gu, "");
  return NASAL_CONSONANTS.has(withoutCombiningMarks);
}

function consonantClusters(segments: ResolvedSegment[]): string[] {
  const clusters: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 1) clusters.push(current.join(""));
    current = [];
  };
  for (const segment of segments) {
    if (segment.category === "consonant") current.push(segment.canonicalIpa);
    else flush();
  }
  flush();
  return clusters;
}

function matchSyllableTemplates(
  segments: ResolvedSegment[],
  templates: ParsedTemplate[]
): ParsedTemplate[] | undefined {
  const uniqueTemplates = [
    ...new Map(templates.map((template) => [template.symbols.join(""), template])).values(),
  ];
  if (!uniqueTemplates.length) return [];
  const memo = new Map<number, ParsedTemplate[] | undefined>();
  const visit = (offset: number): ParsedTemplate[] | undefined => {
    if (offset === segments.length) return [];
    if (memo.has(offset)) return memo.get(offset);
    for (const template of uniqueTemplates) {
      if (!templateMatches(segments, offset, template.symbols)) continue;
      const rest = visit(offset + template.symbols.length);
      if (rest) {
        const result = [template, ...rest];
        memo.set(offset, result);
        return result;
      }
    }
    memo.set(offset, undefined);
    return undefined;
  };
  return visit(0);
}

function templateMatches(
  segments: ResolvedSegment[],
  offset: number,
  symbols: TemplateSymbol[]
): boolean {
  if (offset + symbols.length > segments.length) return false;
  return symbols.every((symbol, index) => {
    const segment = segments[offset + index];
    if (symbol === "V") return segment.category === "vowel";
    if (symbol === "N") {
      return segment.category === "consonant" && isNasal(segment.canonicalIpa);
    }
    return segment.category === "consonant";
  });
}

function parseTemplate(template: string): ParsedTemplate | undefined {
  const normalized = template
    .trim()
    .toUpperCase()
    .replace(/[\s{}()[\]·._-]/g, "");
  if (!normalized || /[^CVN]/.test(normalized)) return undefined;
  return {
    source: template,
    symbols: Array.from(normalized) as TemplateSymbol[],
  };
}
