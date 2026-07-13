import { Request, Response } from 'express';
import { GitHubService } from '../services/githubService';
import { logger } from '../utils/logger';

const githubService = new GitHubService();

// POST /api/repos/:id/github/pr
export const createPullRequest = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { changes, title, description, branchName } = req.body;

  if (!changes || !Array.isArray(changes)) {
    return res.status(400).json({ success: false, error: 'changes array is required' });
  }

  if (!title || !branchName) {
    return res.status(400).json({ success: false, error: 'title and branchName are required' });
  }

  try {
    const result = await githubService.createPullRequest(id, changes, title, description || '', branchName);
    res.json({ success: true, data: result });
  } catch (err: any) {
    logger.error('Create PR error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
