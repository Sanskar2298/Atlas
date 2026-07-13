import { Router } from 'express';
import { createPullRequest } from '../controllers/githubController';

export const githubRoutes = Router();

githubRoutes.post('/repos/:id/github/pr', createPullRequest);
