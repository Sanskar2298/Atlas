import fs from 'fs/promises';
import path from 'path';
import { Repository } from '../models/types';
import { METADATA_DATA_DIR } from '../config/storage';
import { logger } from '../utils/logger';

/**
 * Repository metadata persistence layer.
 * Stores each repo as a JSON file under METADATA_DATA_DIR/<id>.json
 */
export class RepoRepository {
  private metaDir: string;

  constructor() {
    this.metaDir = METADATA_DATA_DIR;
  }

  private metaPath(id: string): string {
    return path.join(this.metaDir, `${id}.json`);
  }

  /** Save or update repository metadata. */
  async save(repo: Repository): Promise<void> {
    await fs.writeFile(this.metaPath(repo.id), JSON.stringify(repo, null, 2), 'utf-8');
    logger.debug('Saved repo metadata', { id: repo.id });
  }

  /** Load a single repository by ID. Returns null if not found. */
  async findById(id: string): Promise<Repository | null> {
    try {
      const raw = await fs.readFile(this.metaPath(id), 'utf-8');
      return JSON.parse(raw) as Repository;
    } catch {
      return null;
    }
  }

  /** Return all repositories sorted by clonedAt descending. */
  async findAll(): Promise<Repository[]> {
    try {
      const files = await fs.readdir(this.metaDir);
      const repos: Repository[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(this.metaDir, file), 'utf-8');
          repos.push(JSON.parse(raw) as Repository);
        } catch {
          logger.warn('Failed to parse metadata file', { file });
        }
      }

      return repos.sort(
        (a, b) => new Date(b.clonedAt).getTime() - new Date(a.clonedAt).getTime()
      );
    } catch {
      return [];
    }
  }

  /** Update a partial subset of repository fields. */
  async update(id: string, patch: Partial<Repository>): Promise<Repository | null> {
    const repo = await this.findById(id);
    if (!repo) return null;
    const updated = { ...repo, ...patch };
    await this.save(updated);
    return updated;
  }

  /** Delete repository metadata. */
  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(this.metaPath(id));
    } catch {
      logger.warn('Metadata file not found for deletion', { id });
    }
  }
}
