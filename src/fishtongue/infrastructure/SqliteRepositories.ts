import {
  EvolutionRepository,
  InflectionRepository,
  LanguageRepository,
  LexemeRepository,
  ProjectRepository,
  DatabaseSessionPort,
} from "@/fishtongue/application/ports/ProjectPorts";
import {
  Evolution,
  InflectionSystem,
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
type LanguageRow = ProjectRow & { project_id: string; profile_json: string };
type LexemeRow = {
  id: string;
  language_id: string;
  romanized: string;
  ipa: string;
  part_of_speech: string;
  status: Lexeme["status"];
  source_type: Lexeme["sourceType"];
  notes: string;
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
type LexemeMorphemeRow = {
  lexeme_id: string;
  morpheme_id: string;
  position: number;
  role: string;
};
type InflectionRow = {
  id: string;
  language_id: string;
  rules_json: string;
  rules_version: number;
  updated_at: string;
  test_case_id: string | null;
  stem: string | null;
  categories_json: string | null;
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
      `SELECT id, project_id, name, profile_json, created_at, updated_at
       FROM languages WHERE project_id = $1 ORDER BY created_at, name`,
      [projectId]
    );
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      profile: parseLanguageProfile(row.profile_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async create(language: Language): Promise<void> {
    await this.database.execute(
      `INSERT INTO languages (id, project_id, name, profile_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        language.id,
        language.projectId,
        language.name,
        JSON.stringify(language.profile ?? emptyLanguageProfile()),
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

  async updateProfile(id: string, profile: NonNullable<Language["profile"]>, updatedAt: string): Promise<void> {
    await this.database.execute(
      "UPDATE languages SET profile_json = $1, updated_at = $2 WHERE id = $3",
      [JSON.stringify(profile), updatedAt, id]
    );
  }

  async delete(id: string): Promise<void> {
    await this.database.execute("DELETE FROM languages WHERE id = $1", [id]);
  }
}

function emptyLanguageProfile(): NonNullable<Language["profile"]> {
  return {
    nativeName: "", code: "", aliases: "", description: "", tags: "", status: "",
    speakers: "", population: "", region: "", startLabel: "", endLabel: "",
    socialStatus: "", officialStatus: "", currentWritingSystem: "",
    historicalWritingSystems: "", orthographies: "", notes: "",
  };
}

function parseLanguageProfile(value: string): NonNullable<Language["profile"]> {
  try {
    return { ...emptyLanguageProfile(), ...(JSON.parse(value) as Partial<NonNullable<Language["profile"]>>) };
  } catch {
    return emptyLanguageProfile();
  }
}

export class SqliteLexemeRepository implements LexemeRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(languageId: string): Promise<Lexeme[]> {
    const rows = await this.database.select<LexemeRow>(
      `SELECT l.id, l.language_id, l.romanized, l.ipa, l.part_of_speech,
              l.status, l.source_type, l.notes, l.created_at, l.updated_at, s.id AS sense_id,
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
          ipa: row.ipa,
          partOfSpeech: row.part_of_speech,
          status: row.status,
          sourceType: row.source_type,
          notes: row.notes,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          senses: [],
          morphemes: [],
        } satisfies Lexeme);
      lexeme.senses.push({
        id: row.sense_id,
        definition: row.definition,
        position: row.position,
      });
      lexemes.set(row.id, lexeme);
    }
    const morphemeRows = await this.database.select<LexemeMorphemeRow>(
      `SELECT lm.lexeme_id, lm.morpheme_id, lm.position, lm.role
       FROM lexeme_morphemes lm
       JOIN lexemes l ON l.id = lm.lexeme_id
       WHERE l.language_id = $1
       ORDER BY lm.lexeme_id, lm.position`,
      [languageId]
    );
    for (const row of morphemeRows) {
      lexemes.get(row.lexeme_id)?.morphemes.push({
        morphemeId: row.morpheme_id,
        position: row.position,
        role: row.role,
      });
    }
    return [...lexemes.values()];
  }

  async save(lexeme: Lexeme): Promise<void> {
    await this.database.execute(
      `INSERT INTO lexeme_write_commands
       (id, language_id, romanized, part_of_speech, created_at, updated_at,
        senses_json, ipa, status, source_type, notes, morphemes_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        lexeme.id,
        lexeme.languageId,
        lexeme.romanized,
        lexeme.partOfSpeech,
        lexeme.createdAt,
        lexeme.updatedAt,
        JSON.stringify(lexeme.senses),
        lexeme.ipa,
        lexeme.status,
        lexeme.sourceType,
        lexeme.notes,
        JSON.stringify(lexeme.morphemes),
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

export class SqliteInflectionRepository implements InflectionRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async getOrCreate(languageId: string): Promise<InflectionSystem> {
    const rows = await this.database.select<InflectionRow>(
      `SELECT i.id, i.language_id, i.rules_json, i.rules_version, i.updated_at,
              t.id AS test_case_id, t.stem, t.categories_json, t.position
       FROM inflection_systems i
       LEFT JOIN inflection_test_cases t ON t.inflection_system_id = i.id
       WHERE i.language_id = $1
       ORDER BY t.position`,
      [languageId]
    );
    if (!rows.length) {
      const created: InflectionSystem = {
        id: uuid(),
        languageId,
        rules: "",
        rulesVersion: 1,
        updatedAt: new Date().toISOString(),
        testCases: [],
      };
      await this.save(created);
      return created;
    }
    const first = rows[0];
    return {
      id: first.id,
      languageId: first.language_id,
      rules: JSON.parse(first.rules_json) as unknown,
      rulesVersion: first.rules_version,
      updatedAt: first.updated_at,
      testCases: rows.flatMap((row) =>
        row.test_case_id &&
        row.stem !== null &&
        row.categories_json !== null &&
        row.position !== null
          ? [{
              id: row.test_case_id,
              stem: row.stem,
              categories: JSON.parse(row.categories_json) as Record<string, string>,
              position: row.position,
            }]
          : []
      ),
    };
  }

  async save(system: InflectionSystem): Promise<void> {
    await this.database.execute(
      `INSERT INTO inflection_write_commands
       (id, language_id, rules_json, rules_version, updated_at, test_cases_json)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        system.id,
        system.languageId,
        JSON.stringify(system.rules),
        system.rulesVersion,
        system.updatedAt,
        JSON.stringify(system.testCases),
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

