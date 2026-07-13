import { Request, Response } from 'express';
import { IndexingService } from '../services/indexingService';
import { InsightService } from '../services/insightService';
import { VectorSearchService } from '../services/vectorSearchService';
import { EmbeddingService } from '../services/embeddingService';
import { ChatService, ChatMessage } from '../services/chatService';
import { logger } from '../utils/logger';

const indexing = new IndexingService();
const insight = new InsightService();
const searchService = new VectorSearchService();
const embedding = new EmbeddingService();
const chat = new ChatService();

// POST /api/repos/:id/index
export const startIndexing = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  // Kick off async
  indexing.startIndexing(id)
    .then(() => insight.generateInsights(id))
    .catch(err => logger.error(`Indexing failed for ${id}:`, err));
    
  res.status(202).json({ success: true, message: 'Indexing started' });
};

// GET /api/repos/:id/insights
export const getInsights = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = await insight.getInsights(id);
  
  if (!data) {
    return res.status(404).json({ success: false, error: 'Insights not found' });
  }
  
  res.json({ success: true, data });
};

// POST /api/search
export const search = async (req: Request, res: Response) => {
  const { repoId, query } = req.body;
  if (!repoId || !query) {
    return res.status(400).json({ success: false, error: 'repoId and query are required' });
  }

  try {
    const queryVector = await embedding.generateEmbedding(query);
    const topChunks = await searchService.semanticSearch(repoId, queryVector, undefined, 10);
    res.json({ success: true, data: topChunks });
  } catch (err: any) {
    logger.error('Search error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/chat
export const chatEndpoint = async (req: Request, res: Response) => {
  const { repoId, messages } = req.body;
  
  if (!repoId || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'repoId and messages array are required' });
  }

  // Uses SSE, so no standard JSON response
  await chat.streamChat(repoId, messages as ChatMessage[], res);
};
