import fs from 'fs/promises';
import path from 'path';
import { CodeChunk } from '../models/chunk';
import { logger } from '../utils/logger';

export interface SearchResult {
  chunk: CodeChunk;
  score: number;
}

export class VectorSearchService {
  private indexesDir: string;
  private cache: Map<string, CodeChunk[]> = new Map();

  constructor() {
    this.indexesDir = path.join(process.cwd(), 'data', 'indexes');
  }

  public async initialize(): Promise<void> {
    await fs.mkdir(this.indexesDir, { recursive: true });
  }

  private getIndexPath(repoId: string): string {
    return path.join(this.indexesDir, `${repoId}.index.jsonl`);
  }

  /**
   * Save chunks to a JSONL file, appending to it.
   */
  public async saveChunks(repoId: string, chunks: CodeChunk[]): Promise<void> {
    const indexPath = this.getIndexPath(repoId);
    
    // Format chunks as JSONL
    const lines = chunks.map(chunk => JSON.stringify(chunk)).join('\n') + '\n';
    
    await fs.appendFile(indexPath, lines, 'utf-8');
    
    // Invalidate cache
    this.cache.delete(repoId);
  }

  /**
   * Clears the index for a given repository.
   */
  public async clearIndex(repoId: string): Promise<void> {
    const indexPath = this.getIndexPath(repoId);
    try {
      await fs.unlink(indexPath);
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        logger.error(`Error deleting index for ${repoId}:`, e);
      }
    }
    this.cache.delete(repoId);
  }

  /**
   * Loads all chunks into memory.
   */
  private async loadIndex(repoId: string): Promise<CodeChunk[]> {
    if (this.cache.has(repoId)) {
      return this.cache.get(repoId)!;
    }

    const indexPath = this.getIndexPath(repoId);
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() !== '');
      const chunks: CodeChunk[] = lines.map(line => JSON.parse(line));
      
      this.cache.set(repoId, chunks);
      return chunks;
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return [];
      }
      throw e;
    }
  }

  /**
   * Performs semantic code search.
   */
  public async semanticSearch(
    repoId: string, 
    queryEmbedding: number[], 
    filters?: { language?: string; fileType?: string; directory?: string },
    topK: number = 10
  ): Promise<SearchResult[]> {
    let chunks = await this.loadIndex(repoId);
    if (chunks.length === 0) return [];

    // Apply filters
    if (filters) {
      if (filters.language) {
        chunks = chunks.filter(c => c.language.toLowerCase() === filters.language!.toLowerCase());
      }
      if (filters.fileType) {
        chunks = chunks.filter(c => c.filePath.endsWith(filters.fileType!));
      }
      if (filters.directory) {
        chunks = chunks.filter(c => c.filePath.startsWith(filters.directory!));
      }
    }

    const results: SearchResult[] = [];

    for (const chunk of chunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) continue;
      
      const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      results.push({ chunk, score });
    }

    // Sort descending by score
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * Find definition of a symbol.
   */
  public async findDefinition(repoId: string, symbolName: string): Promise<CodeChunk[]> {
    const chunks = await this.loadIndex(repoId);
    return chunks.filter(c => 
      c.symbolName === symbolName && 
      (c.chunkType === 'function' || c.chunkType === 'class' || c.chunkType === 'interface' || c.chunkType === 'type' || c.chunkType === 'method')
    );
  }

  /**
   * Find references to a symbol.
   */
  public async findReferences(repoId: string, symbolName: string): Promise<CodeChunk[]> {
    const chunks = await this.loadIndex(repoId);
    // Rough heuristic: chunk contains the symbol name, but isn't the definition itself
    return chunks.filter(c => 
      c.content.includes(symbolName) && 
      c.symbolName !== symbolName
    );
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
