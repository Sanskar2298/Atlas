import path from 'path';
import fs from 'fs/promises';
import { Stats, Dirent } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import simpleGit from 'simple-git';
import { Repository, FileNode, FileContent, ImportStatus } from '../models/types';
import { RepoRepository } from '../repositories/repoRepository';
import { REPOS_DATA_DIR } from '../config/storage';
import { detectLanguage, languageToMonacoId } from '../utils/languageDetector';
import { logger } from '../utils/logger';

// Directories and files to ignore during tree traversal
const IGNORED_PATTERNS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.cache',
  'out',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'vendor',
]);

const IGNORED_EXTENSIONS = new Set([
  '.env',
  '.lock',
  '.log',
]);

/**
 * Core service for repository import, indexing, and reading.
 */
export class RepoService {
  private repoRepo: RepoRepository;

  constructor() {
    this.repoRepo = new RepoRepository();
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validate that a URL is a GitHub repository URL.
   */
  validateGitHubUrl(url: string): { valid: boolean; error?: string } {
    try {
      const parsed = new URL(url);

      if (!['github.com', 'www.github.com'].includes(parsed.hostname)) {
        return { valid: false, error: 'URL must be a GitHub repository (github.com)' };
      }

      // Path should be /owner/repo or /owner/repo.git
      const parts = parsed.pathname.replace(/^\/|\/$/g, '').replace(/\.git$/, '').split('/');
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        return { valid: false, error: 'URL must point to a specific repository (e.g. github.com/owner/repo)' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Extract owner/repo name from GitHub URL.
   */
  private parseRepoName(url: string): { owner: string; name: string; fullName: string } {
    const parsed = new URL(url);
    const parts = parsed.pathname.replace(/^\/|\/$/g, '').replace(/\.git$/, '').split('/');
    return {
      owner: parts[0],
      name: parts[1],
      fullName: `${parts[0]}/${parts[1]}`,
    };
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  /**
   * Clone a GitHub repository and build its metadata.
   * Returns the repository ID immediately (async import).
   */
  async importRepository(url: string): Promise<Repository> {
    const id = uuidv4();
    const { name, fullName } = this.parseRepoName(url);
    const localPath = path.join(REPOS_DATA_DIR, id);

    // Create initial record
    const repo: Repository = {
      id,
      name,
      fullName,
      url,
      branch: 'main',
      status: 'cloning' as ImportStatus,
      clonedAt: new Date().toISOString(),
      lastIndexed: null,
      fileCount: 0,
      languages: {},
      primaryLanguage: 'Unknown',
      sizeBytes: 0,
      description: '',
      localPath,
    };

    await this.repoRepo.save(repo);
    logger.info('Starting repository import', { id, url });

    // Clone asynchronously (don't await — return immediately)
    this.cloneAndIndex(repo).catch((err) => {
      logger.error('Import failed', { id, err });
    });

    return repo;
  }

  /**
   * Clone the repository and index its files.
   */
  private async cloneAndIndex(repo: Repository): Promise<void> {
    const git = simpleGit();

    try {
      // Clone
      logger.info('Cloning repository', { url: repo.url, dest: repo.localPath });
      await git.clone(repo.url, repo.localPath, ['--depth', '1']);

      // Get default branch
      const localGit = simpleGit(repo.localPath);
      const branchResult = await localGit.revparse(['--abbrev-ref', 'HEAD']).catch(() => 'main');
      const branch = branchResult.trim();

      await this.repoRepo.update(repo.id, { status: 'indexing', branch });

      // Index files
      const { fileCount, languages, sizeBytes } = await this.indexFiles(repo.localPath);

      // Determine primary language
      const primaryLanguage = Object.entries(languages).sort(([, a], [, b]) => b - a)[0]?.[0] || 'Unknown';

      // Finalize
      await this.repoRepo.update(repo.id, {
        status: 'ready',
        fileCount,
        languages,
        primaryLanguage,
        sizeBytes,
        lastIndexed: new Date().toISOString(),
      });

      logger.info('Repository import complete', { id: repo.id, fileCount });
      
      // Trigger AI Indexing Pipeline asynchronously
      import('./indexingService').then(({ IndexingService }) => {
        new IndexingService().startIndexing(repo.id)
          .then(() => import('./insightService').then(({ InsightService }) => new InsightService().generateInsights(repo.id)))
          .catch(e => logger.error('Async indexing error:', e));
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Clone/index failed', { id: repo.id, message });
      await this.repoRepo.update(repo.id, {
        status: 'error',
        errorMessage: message,
      });
    }
  }

  /**
   * Walk the file tree and collect stats.
   */
  private async indexFiles(
    rootPath: string
  ): Promise<{ fileCount: number; languages: Record<string, number>; sizeBytes: number }> {
    let fileCount = 0;
    const languages: Record<string, number> = {};
    let sizeBytes = 0;

    const walk = async (dir: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (IGNORED_PATTERNS.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (IGNORED_EXTENSIONS.has(ext)) continue;

          try {
            const stat = await fs.stat(fullPath);
            sizeBytes += stat.size;
            fileCount++;

            const lang = detectLanguage(entry.name);
            languages[lang] = (languages[lang] || 0) + 1;
          } catch {
            // skip files we can't stat
          }
        }
      }
    };

    await walk(rootPath);
    return { fileCount, languages, sizeBytes };
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  async getAllRepos(): Promise<Repository[]> {
    return this.repoRepo.findAll();
  }

  async getRepoById(id: string): Promise<Repository | null> {
    return this.repoRepo.findById(id);
  }

  // ── File Tree ──────────────────────────────────────────────────────────────

  /**
   * Build a nested file tree for a repository.
   */
  async getFileTree(repoId: string): Promise<FileNode[]> {
    const repo = await this.repoRepo.findById(repoId);
    if (!repo) throw new Error(`Repository ${repoId} not found`);
    if (repo.status !== 'ready') throw new Error(`Repository is not ready (status: ${repo.status})`);

    return this.buildTree(repo.localPath, repo.localPath);
  }

  private async buildTree(rootPath: string, currentPath: string): Promise<FileNode[]> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (IGNORED_PATTERNS.has(entry.name)) continue;

      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        const children = await this.buildTree(rootPath, fullPath);
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: 'directory',
          children,
        });
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IGNORED_EXTENSIONS.has(ext)) continue;

        let stat: Stats | undefined;
        try {
          stat = await fs.stat(fullPath);
        } catch {
          // ignore
        }

        nodes.push({
          name: entry.name,
          path: relativePath,
          type: 'file',
          language: detectLanguage(entry.name),
          sizeBytes: stat?.size,
        });
      }
    }

    // Sort: directories first, then files, both alphabetically
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  // ── File Content ───────────────────────────────────────────────────────────

  /**
   * Read the content of a specific file within a repository.
   */
  async getFileContent(repoId: string, filePath: string): Promise<FileContent> {
    const repo = await this.repoRepo.findById(repoId);
    if (!repo) throw new Error(`Repository ${repoId} not found`);

    // Prevent path traversal attacks
    const safeRoot = path.resolve(repo.localPath);
    const fullPath = path.resolve(repo.localPath, filePath);
    if (!fullPath.startsWith(safeRoot)) {
      throw new Error('Invalid file path: path traversal detected');
    }

    let content: string;
    let stat: Stats;

    try {
      stat = await fs.stat(fullPath);
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }

    const language = detectLanguage(filePath);

    return {
      path: filePath,
      content,
      language,
      sizeBytes: stat.size,
      lastModified: stat.mtime.toISOString(),
      encoding: 'utf-8',
    };
  }
}
