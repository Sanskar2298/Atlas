import { Request, Response, NextFunction } from 'express';
import { RepoService } from '../services/repoService';
import { ApiResponse } from '../models/types';
import { logger } from '../utils/logger';

const repoService = new RepoService();

// ── POST /api/repos/import ───────────────────────────────────────────────────

export async function importRepo(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { url } = req.body as { url: string };

    if (!url || typeof url !== 'string') {
      res.status(400).json({
        success: false,
        error: 'GitHub repository URL is required',
      } satisfies ApiResponse);
      return;
    }

    const validation = repoService.validateGitHubUrl(url.trim());
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: validation.error,
      } satisfies ApiResponse);
      return;
    }

    const repo = await repoService.importRepository(url.trim());

    res.status(202).json({
      success: true,
      data: repo,
      message: 'Repository import started. Poll /api/repos/:id for status.',
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

// ── GET /api/repos ───────────────────────────────────────────────────────────

export async function listRepos(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const repos = await repoService.getAllRepos();
    res.json({ success: true, data: repos } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

// ── GET /api/repos/:id ───────────────────────────────────────────────────────

export async function getRepo(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const repo = await repoService.getRepoById(id);

    if (!repo) {
      res.status(404).json({
        success: false,
        error: `Repository '${id}' not found`,
      } satisfies ApiResponse);
      return;
    }

    res.json({ success: true, data: repo } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

// ── GET /api/repos/:id/tree ──────────────────────────────────────────────────

export async function getRepoTree(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const tree = await repoService.getFileTree(id);
    res.json({ success: true, data: tree } satisfies ApiResponse);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not ready')) {
      res.status(409).json({
        success: false,
        error: err.message,
      } satisfies ApiResponse);
      return;
    }
    next(err);
  }
}

// ── GET /api/repos/:id/file ──────────────────────────────────────────────────

export async function getRepoFile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const filePath = req.query['path'] as string;

    if (!filePath) {
      res.status(400).json({
        success: false,
        error: 'Query parameter "path" is required',
      } satisfies ApiResponse);
      return;
    }

    const fileContent = await repoService.getFileContent(id, filePath);
    res.json({ success: true, data: fileContent } satisfies ApiResponse);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: err.message,
      } satisfies ApiResponse);
      return;
    }
    if (err instanceof Error && err.message.includes('path traversal')) {
      res.status(403).json({
        success: false,
        error: err.message,
      } satisfies ApiResponse);
      return;
    }
    next(err);
  }
}

// ── GET /api/repos/:id/status ────────────────────────────────────────────────

export async function getRepoStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const repo = await repoService.getRepoById(id);

    if (!repo) {
      res.status(404).json({
        success: false,
        error: `Repository '${id}' not found`,
      } satisfies ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        id: repo.id,
        status: repo.status,
        errorMessage: repo.errorMessage,
        fileCount: repo.fileCount,
        lastIndexed: repo.lastIndexed,
      },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
}

logger.debug('Repo controller loaded');
