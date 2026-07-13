import { Request, Response } from 'express';
import { VectorSearchService } from '../services/vectorSearchService';
import { EmbeddingService } from '../services/embeddingService';
import { FileAnalysisService } from '../services/fileAnalysisService';
import { ProjectOverviewService } from '../services/projectOverviewService';
import { RepoService } from '../services/repoService';
import { logger } from '../utils/logger';

const searchService = new VectorSearchService();
const embeddingService = new EmbeddingService();
const fileAnalysisService = new FileAnalysisService();
const projectOverviewService = new ProjectOverviewService();
const repoService = new RepoService();

// POST /api/search/semantic
export const semanticSearch = async (req: Request, res: Response) => {
  const { repoId, query, filters } = req.body;
  
  if (!repoId || !query) {
    return res.status(400).json({ success: false, error: 'repoId and query are required' });
  }

  try {
    const queryVector = await embeddingService.generateEmbedding(query);
    const topChunks = await searchService.semanticSearch(repoId, queryVector, filters, 15);
    res.json({ success: true, data: topChunks });
  } catch (err: any) {
    logger.error('Semantic search error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/repos/:id/file-analysis?path=...
export const getFileAnalysis = async (req: Request, res: Response) => {
  const { id } = req.params;
  const filePath = req.query['path'] as string;

  if (!filePath) {
    return res.status(400).json({ success: false, error: 'path query parameter is required' });
  }

  try {
    const analysis = await fileAnalysisService.getAnalysis(id, filePath);
    if (!analysis) {
      return res.status(404).json({ success: false, error: 'Analysis not found' });
    }
    res.json({ success: true, data: analysis });
  } catch (err: any) {
    logger.error('Get file analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/repos/:id/overview
export const getProjectOverview = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const overview = await projectOverviewService.getOverview(id);
    if (!overview) {
      return res.status(404).json({ success: false, error: 'Project overview not found' });
    }
    res.json({ success: true, data: overview });
  } catch (err: any) {
    logger.error('Get project overview error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/repos/:id/overview/generate
export const generateProjectOverview = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Kick off generation — may take a while
    const overview = await projectOverviewService.generateOverview(id);
    if (!overview) {
      return res.status(404).json({ success: false, error: 'Repository not found or empty' });
    }
    res.json({ success: true, data: overview });
  } catch (err: any) {
    logger.error('Generate project overview error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/repos/:id/find-references
export const findReferences = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { symbol } = req.body;

  if (!symbol) {
    return res.status(400).json({ success: false, error: 'symbol is required' });
  }

  try {
    const references = await searchService.findReferences(id, symbol);
    res.json({ success: true, data: references });
  } catch (err: any) {
    logger.error('Find references error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/repos/:id/find-definition
export const findDefinition = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { symbol } = req.body;

  if (!symbol) {
    return res.status(400).json({ success: false, error: 'symbol is required' });
  }

  try {
    const definitions = await searchService.findDefinition(id, symbol);
    res.json({ success: true, data: definitions });
  } catch (err: any) {
    logger.error('Find definition error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
