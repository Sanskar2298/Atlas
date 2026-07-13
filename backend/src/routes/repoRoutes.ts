import { Router } from 'express';
import {
  importRepo,
  listRepos,
  getRepo,
  getRepoTree,
  getRepoFile,
  getRepoStatus,
} from '../controllers/repoController';

export const repoRoutes = Router();

// POST /api/repos/import
repoRoutes.post('/import', importRepo);

// GET /api/repos
repoRoutes.get('/', listRepos);

// GET /api/repos/:id/status
repoRoutes.get('/:id/status', getRepoStatus);

// GET /api/repos/:id/tree
repoRoutes.get('/:id/tree', getRepoTree);

// GET /api/repos/:id/file?path=...
repoRoutes.get('/:id/file', getRepoFile);

// GET /api/repos/:id
repoRoutes.get('/:id', getRepo);
