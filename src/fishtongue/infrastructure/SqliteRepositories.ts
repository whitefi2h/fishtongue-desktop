import {
  EvolutionRepository,
  LanguageRepository,
  LexemeRepository,
  ProjectRepository,
  DatabaseSessionPort,
} from "@/fishtongue/application/ports/ProjectPorts";
import {
  Evolution,
  Language,
  Lexeme,
  Project,
} from "@/fishtongue/domain/models";
import { v4 as uuid } from "uuid";

type ProjectRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};
type LanguageRow = ProjectRow & { project_id: string };
type LexemeRow = {
  id: string;
  language_id: string;
  romanized: string;
  part_of_speech: string;
  created_at: string;
  updated_at: string;
  sense_id: string;
  definition: string;
  position: number;
};
type EvolutionRow = {
  id: string;
  language_id: string;
  sound_changes: string;
  updated_at: string;
  word_id: string | null;
  word: string | null;
  position: number | null;
};

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async get(projectId: string): Promise<Project | null> {
    const [row] = await this.database.select<ProjectRow>(
      "SELECT id, name, created_at, updated_at FROM projects WHERE id = $1",
      [projectId]
    );
    return row ? mapProject(row) : null;
  }

  async upsert(project: Project): Promise<void> {
    await this.database.execute(
      `INSERT INTO projects (id, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
      [project.id, project.name, project.createdAt, project.updatedAt]
    );
  }

  async rename(projectId: string, name: string, updatedAt: string): Promise<void> {
    await this.database.execute(
      "UPDATE projects SET name = $1, updated_at = $2 WHERE id = $3",
      [name, updatedAt, projectId]
    );
  }
}

export class SqliteLanguageRepository implements LanguageRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(projectId: string): Promise<Language[]> {
    const rows = await this.database.select<LanguageRow>(
      `SELECT id, project_id, name, created_at, updated_at
       FROM languages WHERE project_id = $1 ORDER BY created_at, name`,
      [projectId]
    );
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async create(language: Language): Promise<void> {
    await this.database.execute(
      `INSERT INTO languages (id, project_id, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        language.id,
        language.projectId,
        language.name,
        language.createdAt,
        language.updatedAt,
      ]
    );
  }

  async rename(id: string, name: string, updatedAt: string): Promise<void> {
    await this.database.execute(
      "UPDATE languages SET name = $1, updated_at = $2 WHERE id = $3",
      [name, updatedAt, id]
    );
  }

  async delete(id: string): Promise<void> {
    await this.database.execute("DELETE FROM languages WHERE id = $1", [id]);
  }
}

export class SqliteLexemeRepository implements LexemeRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(languageId: string): Promise<Lexeme[]> {
    const rows = await this.database.select<LexemeRow>(
      `SELECT l.id, l.language_id, l.romanized, l.part_of_speech,
              l.created_at, l.updated_at, s.id AS sense_id,
              s.definition, s.position
       FROM lexemes l
       JOIN senses s ON s.lexeme_id = l.id
       WHERE l.language_id = $1
       ORDER BY l.romanized, l.created_at, s.position`,
      [languageId]
    );
    const lexemes = new Map<string, Lexeme>();
    for (const row of rows) {
      const lexeme =
        lexemes.get(row.id) ??
        ({
          id: row.id,
          languageId: row.language_id,
          romanized: row.romanized,
          partOfSpeech: row.part_of_speech,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          senses: [],
        } satisfies Lexeme);
      lexeme.senses.push({
        id: row.sense_id,
        definition: row.definition,
        position: row.position,
      });
      lexemes.set(row.id, lexeme);
    }
    return [...lexemes.values()];
  }

  async save(lexeme: Lexeme): Promise<void> {
    await this.database.execute(
      `INSERT INTO lexeme_write_commands
       (id, language_id, romanized, part_of_speech, created_at, updated_at, senses_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        lexeme.id,
        lexeme.languageId,
        lexeme.romanized,
        lexeme.partOfSpeech,
        lexeme.createdAt,
        lexeme.updatedAt,
        JSON.stringify(lexeme.senses),
      ]
    );
  }

  async delete(id: string): Promise<void> {
    await this.database.execute("DELETE FROM lexemes WHERE id = $1", [id]);
  }
}

export class SqliteEvolutionRepository implements EvolutionRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async getOrCreate(languageId: string): Promise<Evolution> {
    const rows = await this.database.select<EvolutionRow>(
      `SELECT e.id, e.language_id, e.sound_changes, e.updated_at,
              w.id AS word_id, w.word, w.position
       FROM evolutions e
       LEFT JOIN evolution_test_words w ON w.evolution_id = e.id
       WHERE e.language_id = $1 ORDER BY w.position`,
      [languageId]
    );
    if (!rows.length) {
      const evolution: Evolution = {
        id: uuid(),
        languageId,
        soundChanges: "",
        updatedAt: new Date().toISOString(),
        testWords: [],
      };
      await this.save(evolution);
      return evolution;
    }
    const first = rows[0];
    return {
      id: first.id,
      languageId: first.language_id,
      soundChanges: first.sound_changes,
      updatedAt: first.updated_at,
      testWords: rows.flatMap((row) =>
        row.word_id && row.word !== null && row.position !== null
          ? [{ id: row.word_id, word: row.word, position: row.position }]
          : []
      ),
    };
  }

  async save(evolution: Evolution): Promise<void> {
    await this.database.execute(
      `INSERT INTO evolution_write_commands
       (id, language_id, sound_changes, updated_at, test_words_json)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        evolution.id,
        evolution.languageId,
        evolution.soundChanges,
        evolution.updatedAt,
        JSON.stringify(evolution.testWords),
      ]
    );
  }
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

