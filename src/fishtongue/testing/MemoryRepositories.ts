import {
  EvolutionRepository,
  ConceptListRepository,
  GenerationBatchRepository,
  InflectionRepository,
  LanguageRepository,
  MorphemeRepository,
  LexemeRepository,
  ProjectRepository,
  WordGenerationProfileRepository,
} from "@/fishtongue/application/ports/ProjectPorts";
import {
  Evolution,
  ConceptList,
  GenerationBatch,
  GenerationCandidate,
  InflectionSystem,
  Language,
  LexiconBatchOperation,
  Lexeme,
  Morpheme,
  Project,
  WordGenerationProfile,
} from "@/fishtongue/domain/models";
import { v4 as uuid } from "uuid";

export class MemoryProjectRepository implements ProjectRepository {
  private readonly values = new Map<string, Project>();

  async get(projectId: string): Promise<Project | null> {
    return this.values.get(projectId) ?? null;
  }

  async upsert(project: Project): Promise<void> {
    this.values.set(project.id, clone(project));
  }

  async rename(projectId: string, name: string, updatedAt: string): Promise<void> {
    const project = this.values.get(projectId);
    if (project) this.values.set(projectId, { ...project, name, updatedAt });
  }
}

export class MemoryLanguageRepository implements LanguageRepository {
  private readonly values = new Map<string, Language>();

  async list(projectId: string): Promise<Language[]> {
    return [...this.values.values()]
      .filter((language) => language.projectId === projectId)
      .map((language) => clone(language));
  }

  async create(language: Language): Promise<void> {
    this.values.set(language.id, clone(language));
  }

  async rename(id: string, name: string, updatedAt: string): Promise<void> {
    const language = this.values.get(id);
    if (language) this.values.set(id, { ...language, name, updatedAt });
  }

  async delete(id: string): Promise<void> {
    this.values.delete(id);
  }
}

export class MemoryLexemeRepository implements LexemeRepository {
  private readonly values = new Map<string, Lexeme>();

  async list(languageId: string): Promise<Lexeme[]> {
    return [...this.values.values()]
      .filter((lexeme) => lexeme.languageId === languageId)
      .map((lexeme) => clone(lexeme));
  }

  async save(lexeme: Lexeme): Promise<void> {
    this.values.set(lexeme.id, clone(lexeme));
  }

  async delete(id: string): Promise<void> {
    this.values.delete(id);
  }
}

export class MemoryEvolutionRepository implements EvolutionRepository {
  private readonly values = new Map<string, Evolution>();

  async getOrCreate(languageId: string): Promise<Evolution> {
    const current = this.values.get(languageId);
    if (current) return clone(current);
    const created = {
      id: uuid(),
      languageId,
      soundChanges: "",
      updatedAt: new Date().toISOString(),
      testWords: [],
    };
    this.values.set(languageId, created);
    return clone(created);
  }

  async save(evolution: Evolution): Promise<void> {
    this.values.set(evolution.languageId, clone(evolution));
  }
}

export class MemoryInflectionRepository implements InflectionRepository {
  private readonly values = new Map<string, InflectionSystem>();

  async getOrCreate(languageId: string): Promise<InflectionSystem> {
    const current = this.values.get(languageId);
    if (current) return clone(current);
    const created: InflectionSystem = {
      id: uuid(),
      languageId,
      rules: "",
      rulesVersion: 1,
      updatedAt: new Date().toISOString(),
      testCases: [],
    };
    this.values.set(languageId, created);
    return clone(created);
  }

  async save(system: InflectionSystem): Promise<void> {
    this.values.set(system.languageId, clone(system));
  }
}

export class MemoryMorphemeRepository implements MorphemeRepository {
  private readonly values = new Map<string, Morpheme>();
  async list(languageId: string): Promise<Morpheme[]> {
    return [...this.values.values()]
      .filter((value) => value.languageId === languageId)
      .map(clone);
  }
  async save(value: Morpheme): Promise<void> {
    this.values.set(value.id, clone(value));
  }
  async delete(id: string): Promise<void> {
    this.values.delete(id);
  }
}

export class MemoryWordGenerationProfileRepository
  implements WordGenerationProfileRepository {
  private readonly values = new Map<string, WordGenerationProfile>();
  async list(languageId: string): Promise<WordGenerationProfile[]> {
    return [...this.values.values()]
      .filter((value) => value.languageId === languageId)
      .map(clone);
  }
  async save(value: WordGenerationProfile): Promise<void> {
    if (value.isDefault) {
      for (const [id, profile] of this.values) {
        if (profile.languageId === value.languageId) {
          this.values.set(id, { ...profile, isDefault: false });
        }
      }
    }
    this.values.set(value.id, clone(value));
  }
  async delete(id: string): Promise<void> {
    this.values.delete(id);
  }
}

export class MemoryConceptListRepository implements ConceptListRepository {
  private readonly values = new Map<string, ConceptList>();
  async list(projectId: string): Promise<ConceptList[]> {
    return [...this.values.values()]
      .filter((value) => value.projectId === projectId)
      .map(clone);
  }
  async save(value: ConceptList): Promise<void> {
    this.values.set(value.id, clone(value));
  }
  async delete(id: string): Promise<void> {
    if (!this.values.get(id)?.readonly) this.values.delete(id);
  }
}

export class MemoryGenerationBatchRepository implements GenerationBatchRepository {
  private readonly values = new Map<string, GenerationBatch>();
  private readonly operations = new Map<string, LexiconBatchOperation>();
  private readonly dismissed = new Set<string>();
  async list(languageId: string): Promise<GenerationBatch[]> {
    return [...this.values.values()]
      .filter((value) => value.languageId === languageId && !this.dismissed.has(value.id))
      .map(clone);
  }
  async get(id: string): Promise<GenerationBatch | null> {
    const value = this.values.get(id);
    return value ? clone(value) : null;
  }
  async create(value: GenerationBatch): Promise<void> {
    this.values.set(value.id, clone(value));
  }
  async saveCandidate(batchId: string, candidate: GenerationCandidate): Promise<void> {
    const batch = this.values.get(batchId);
    if (!batch) throw new Error("审核批次不存在。");
    batch.candidates = batch.candidates.map((value) =>
      value.id === candidate.id ? clone(candidate) : value
    );
  }
  async commit(batchId: string, operationId: string, committedAt: string): Promise<void> {
    const batch = this.values.get(batchId);
    if (!batch) throw new Error("审核批次不存在。");
    batch.status = "committed";
    batch.committedAt = committedAt;
    batch.candidates = batch.candidates.map((candidate) =>
      candidate.status === "accepted" ? { ...candidate, status: "committed" } : candidate
    );
    this.operations.set(operationId, {
      id: operationId,
      languageId: batch.languageId,
      batchId,
      kind: batch.type === "derivation" ? "derivation_commit" : "generation_commit",
      createdAt: committedAt,
    });
  }
  async dismiss(batchId: string): Promise<void> {
    this.dismissed.add(batchId);
  }
  async listOperations(languageId: string): Promise<LexiconBatchOperation[]> {
    return [...this.operations.values()]
      .filter((value) => value.languageId === languageId)
      .map(clone);
  }
  async undo(operationId: string, undoneAt: string): Promise<void> {
    const operation = this.operations.get(operationId);
    if (!operation || operation.undoneAt) throw new Error("该操作不能撤销。");
    operation.undoneAt = undoneAt;
    const batch = this.values.get(operation.batchId);
    if (batch) {
      this.dismissed.delete(batch.id);
      batch.status = "undone";
      batch.candidates = batch.candidates.map((candidate) =>
        candidate.status === "committed" ? { ...candidate, status: "pending" } : candidate
      );
    }
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
