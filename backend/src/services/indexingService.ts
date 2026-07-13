import fs from 'fs/promises';
import path from 'path';
import { RepoRepository } from '../repositories/repoRepository';
import { ChunkingService } from './chunkingService';
import { EmbeddingService } from './embeddingService';
import { VectorSearchService } from './vectorSearchService';
import { FileAnalysisService } from './fileAnalysisService';
import { ProjectOverviewService } from './projectOverviewService';
import { logger } from '../utils/logger';
import { FileNode } from '../models/types';
import { RepoService } from './repoService';

export class IndexingService {
  private repoRepo: RepoRepository;
  private chunking: ChunkingService;
  private embedding: EmbeddingService;
  private search: VectorSearchService;
  private repoService: RepoService;
  private fileAnalysis: FileAnalysisService;
  private projectOverview: ProjectOverviewService;

  constructor() {
    this.repoRepo = new RepoRepository();
    this.chunking = new ChunkingService();
    this.embedding = new EmbeddingService();
    this.search = new VectorSearchService();
    this.repoService = new RepoService();
    this.fileAnalysis = new FileAnalysisService();
    this.projectOverview = new ProjectOverviewService();
    
    // Ensure index dir exists
    this.search.initialize().catch(err => logger.error('Failed to initialize search service:', err));
  }

  /**
   * Starts the indexing pipeline for a given repository.
   * Runs asynchronously.
   */
  public async startIndexing(repoId: string): Promise<void> {
    const repo = await this.repoRepo.findById(repoId);
    if (!repo) throw new Error('Repository not found');

    logger.info(`Starting indexing for ${repo.fullName} (${repoId})`);
    
    // We could mark it as indexing if we add more status types, but for now
    // we'll just process it.

    try {
      // 1. Get the full tree
      const tree = await this.repoService.getFileTree(repoId);
      
      // 2. Flatten tree to file paths
      const filePaths: string[] = [];
      const flatten = (nodes: FileNode[]) => {
        for (const node of nodes) {
          if (node.type === 'file') {
            filePaths.push(node.path);
          } else if (node.children) {
            flatten(node.children);
          }
        }
      };
      flatten(tree);

      logger.info(`Found ${filePaths.length} files to index for ${repoId}`);

      // Clear old index for full re-index
      // In a real app we'd do incremental based on last modified timestamps
      await this.search.clearIndex(repoId);

      // Process files in batches to not blow up memory
      let totalChunks = 0;
      let processedFiles = 0;
      const totalFiles = filePaths.length;

      for (const filePath of filePaths) {
        try {
          const contentObj = await this.repoService.getFileContent(repoId, filePath);
          
          // Skip large files or binary files
          if (contentObj.encoding === 'binary' || contentObj.sizeBytes > 500 * 1024) {
            processedFiles++;
            continue;
          }
          
          // Skip formats we don't want to chunk like minified js
          if (filePath.endsWith('.min.js') || filePath.endsWith('.map')) {
            processedFiles++;
            continue;
          }

          // Generate file analysis
          const analysis = await this.fileAnalysis.analyzeFile(
            repoId, 
            filePath, 
            contentObj.language, 
            contentObj.content
          );

          // Chunk file
          const chunks = this.chunking.chunkFile(repoId, filePath, contentObj.language, contentObj.content);
          
          if (chunks.length > 0) {
            // Generate embeddings
            const contentsToEmbed = chunks.map(c => `File: ${c.filePath}\nLanguage: ${c.language}\n${c.symbolName ? `Symbol: ${c.symbolName}\n` : ''}\n${c.summary || ''}\n${c.content}`);
            const embeddings = await this.embedding.generateEmbeddings(contentsToEmbed);

            // Merge embeddings into chunks
            for (let i = 0; i < chunks.length; i++) {
              (chunks as any)[i].embedding = embeddings[i];
            }

            // Save chunks to disk
            await this.search.saveChunks(repoId, chunks as any);
            totalChunks += chunks.length;
          }
          
          processedFiles++;
          if (processedFiles % 10 === 0 || processedFiles === totalFiles) {
            logger.info(`Indexing progress ${repoId}: ${processedFiles}/${totalFiles} files, ${totalChunks} chunks`);
          }

        } catch (fileErr) {
          logger.warn(`Failed to process file ${filePath} for indexing:`, fileErr);
          processedFiles++;
        }
      }

      // Generate Project Overview after all files are processed
      await this.projectOverview.generateOverview(repoId);

      // Update repo metadata with indexing status
      repo.lastIndexed = new Date().toISOString();
      this.repoRepo.save(repo);

      logger.info(`Finished indexing ${repoId}. Total chunks: ${totalChunks}`);

    } catch (error) {
      logger.error(`Error during indexing repo ${repoId}:`, error);
    }
  }
}
