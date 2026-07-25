import {
  EvolutionRepository,
  LanguageRepository,
  LexemeRepository,
  ProjectRepository,
} from "@/fishtongue/application/ports/ProjectPorts";
import {
  Evolution,
  Language,
  Lexeme,
  Project,
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
