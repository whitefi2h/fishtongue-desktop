import {
  EvolutionRepository,
  InflectionRepository,
  LanguageStageRepository,
  LexemeRepository,
  MorphemeRepository,
  WordGenerationProfileRepository,
} from "@/fishtongue/application/ports/ProjectPorts";
import {
  ResolvedStageState,
  StageComponentOverride,
} from "@/fishtongue/domain/models";

const MAX_INHERITANCE_DEPTH = 64;

export default class StageStateResolver {
  constructor(
    private readonly stages: LanguageStageRepository,
    private readonly lexemes: LexemeRepository,
    private readonly morphemes: MorphemeRepository,
    private readonly evolutions: EvolutionRepository,
    private readonly inflections: InflectionRepository,
    private readonly profiles: WordGenerationProfileRepository
  ) {}

  resolve(stageId: string): Promise<ResolvedStageState> {
    return this.resolveInternal(stageId, []);
  }

  private async resolveInternal(
    stageId: string,
    ancestors: string[]
  ): Promise<ResolvedStageState> {
    if (ancestors.includes(stageId)) {
      throw new Error("阶段的数据继承形成了循环，请先修正基础阶段。");
    }
    if (ancestors.length >= MAX_INHERITANCE_DEPTH) {
      throw new Error("阶段继承层级超过安全上限。");
    }
    const stage = await this.stages.get(stageId);
    if (!stage) throw new Error("阶段不存在或已被删除。");

    if (stage.storageMode === "no_data") {
      return {
        stage,
        lineage: [...ancestors, stage.id],
        components: emptyComponents(),
        warnings: ["该阶段标记为无记录，仅保存背景与关系，不提供虚构数据。"],
      };
    }

    const base = stage.kind === "internal_default"
      ? await this.loadLanguageState(stage.languageId)
      : stage.dataBaseStageId
        ? await this.resolveInternal(stage.dataBaseStageId, [...ancestors, stage.id])
        : {
          stage,
          lineage: [...ancestors, stage.id],
          components: emptyComponents(),
          warnings: ["该阶段没有数据基础，当前只显示自身记录。"],
        };

    const resolved: ResolvedStageState = {
      stage,
      lineage: stage.kind === "internal_default"
        ? [stage.id]
        : [...base.lineage, stage.id],
      components: cloneComponents(base.components),
      warnings: [...base.warnings],
    };
    const overrides = await this.stages.listOverrides(stage.id);
    for (const override of overrides) applyOverride(resolved, override);
    return resolved;
  }

  private async loadLanguageState(languageId: string): Promise<ResolvedStageState> {
    const stages = await this.stages.list(languageId);
    const stage = stages.find((value) => value.kind === "internal_default");
    if (!stage) throw new Error("语言缺少内部默认状态，项目迁移可能未完成。");
    const [lexemes, morphemes, evolution, inflection, profiles] = await Promise.all([
      this.lexemes.list(languageId),
      this.morphemes.list(languageId),
      this.evolutions.getOrCreate(languageId),
      this.inflections.getOrCreate(languageId),
      this.profiles.list(languageId),
    ]);
    return {
      stage,
      lineage: [stage.id],
      warnings: [],
      components: {
        lexicon: Object.fromEntries(lexemes.map((value) => [value.id, asRecord(value)])),
        morphemes: Object.fromEntries(morphemes.map((value) => [value.id, asRecord(value)])),
        evolution: evolution as unknown as Record<string, unknown>,
        inflection: inflection as unknown as Record<string, unknown>,
        wordgen: Object.fromEntries(profiles.map((value) => [value.id, asRecord(value)])),
      },
    };
  }
}

function asRecord(value: object): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function emptyComponents(): ResolvedStageState["components"] {
  return {
    lexicon: {},
    morphemes: {},
    wordgen: {},
  };
}

function cloneComponents(
  value: ResolvedStageState["components"]
): ResolvedStageState["components"] {
  return JSON.parse(JSON.stringify(value)) as ResolvedStageState["components"];
}

function applyOverride(
  state: ResolvedStageState,
  override: StageComponentOverride
): void {
  if (override.componentType === "evolution" ||
      override.componentType === "inflection") {
    if (override.operation === "remove") {
      delete state.components[override.componentType];
    } else if (override.operation === "merge") {
      state.components[override.componentType] = {
        ...(state.components[override.componentType] ?? {}),
        ...override.payload,
      };
    } else {
      state.components[override.componentType] = { ...override.payload };
    }
    return;
  }

  const collection = state.components[override.componentType];
  if (override.operation === "remove") {
    delete collection[override.targetId];
  } else if (override.operation === "merge") {
    collection[override.targetId] = {
      ...(collection[override.targetId] ?? {}),
      ...override.payload,
    };
  } else {
    collection[override.targetId] = { ...override.payload };
  }
}
