import { Router } from 'express';
import { startIndexing, getInsights, chatEndpoint } from '../controllers/aiController';
import { 
  semanticSearch, 
  getFileAnalysis, 
  getProjectOverview, 
  generateProjectOverview,
  findReferences, 
  findDefinition 
} from '../controllers/intelligenceController';
import {
  generatePlan,
  generateCode,
  reviewCode,
  generateDocs,
  generateTests,
  getHealthScore
} from '../controllers/engineerController';

export const aiRoutes = Router();

aiRoutes.post('/repos/:id/index', startIndexing);
aiRoutes.get('/repos/:id/insights', getInsights);
aiRoutes.post('/chat', chatEndpoint);

// Phase 3: Intelligence routes
aiRoutes.post('/search/semantic', semanticSearch);
aiRoutes.get('/repos/:id/file-analysis', getFileAnalysis);
aiRoutes.get('/repos/:id/overview', getProjectOverview);
aiRoutes.post('/repos/:id/overview/generate', generateProjectOverview);
aiRoutes.post('/repos/:id/find-references', findReferences);
aiRoutes.post('/repos/:id/find-definition', findDefinition);

// Phase 4: AI Engineer routes
aiRoutes.post('/repos/:id/plan', generatePlan);
aiRoutes.post('/repos/:id/generate', generateCode);
aiRoutes.post('/repos/:id/review', reviewCode);
aiRoutes.post('/repos/:id/generate-docs', generateDocs);
aiRoutes.post('/repos/:id/generate-tests', generateTests);
aiRoutes.get('/repos/:id/health-score', getHealthScore);
