import { GoogleGenAI } from '@google/genai';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const EMBEDDING_MODEL = 'text-embedding-004';

export class EmbeddingService {
  /**
   * Generates embeddings for a batch of strings.
   * Note: The @google/genai SDK provides an `embedContent` API.
   * If passing multiple texts, we map over them or use a batch API if available.
   * For simplicity and robust error handling, we map sequentially or with Promise.all.
   */
  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!process.env.GEMINI_API_KEY) {
      logger.warn('GEMINI_API_KEY is not set. Generating fake zero-embeddings for testing.');
      return texts.map(() => new Array(768).fill(0));
    }

    try {
      const embeddings: number[][] = [];
      // To avoid rate limits, we can batch them but let's do a simple Promise.all
      // or sequential if it's large. For MVP, we'll do sequential batches of 10.
      const batchSize = 10;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchPromises = batch.map(async (text) => {
          const response = await ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: text,
          });
          return response.embeddings?.[0]?.values || [];
        });

        const batchResults = await Promise.all(batchPromises);
        embeddings.push(...batchResults);
      }
      return embeddings;
    } catch (error) {
      logger.error('Error generating embeddings:', error);
      throw new Error('Failed to generate embeddings');
    }
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    const results = await this.generateEmbeddings([text]);
    return results[0] || [];
  }
}
