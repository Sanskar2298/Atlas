import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';

export const REPOS_DATA_DIR = path.resolve(
  process.env.REPOS_DATA_DIR || './data/repos'
);
export const METADATA_DATA_DIR = path.resolve(
  process.env.METADATA_DATA_DIR || './data/metadata'
);

/**
 * Ensures data directories exist at startup.
 */
export async function ensureDataDirectories(): Promise<void> {
  try {
    await fs.mkdir(REPOS_DATA_DIR, { recursive: true });
    await fs.mkdir(METADATA_DATA_DIR, { recursive: true });
    logger.info('Data directories ready', { REPOS_DATA_DIR, METADATA_DATA_DIR });
  } catch (err) {
    logger.error('Failed to create data directories', err);
    throw err;
  }
}
