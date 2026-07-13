import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { logger } from '../utils/logger';
import { RepoRepository } from '../repositories/repoRepository';
import { REPOS_DATA_DIR, METADATA_DATA_DIR } from '../config/storage';

export interface RepoInsights {
  overview: string;
  frameworks: string[];
  architecture: string;
  entryPoints: string[];
  complexityScore: number;
}

export class InsightService {
  private repoRepo: RepoRepository;
  private ai: GoogleGenAI;

  constructor() {
    this.repoRepo = new RepoRepository();
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  }

  private getInsightsPath(repoId: string): string {
    return path.join(METADATA_DATA_DIR, `${repoId}.insights.json`);
  }

  public async getInsights(repoId: string): Promise<RepoInsights | null> {
    const p = this.getInsightsPath(repoId);
    try {
      const content = await fs.readFile(p, 'utf-8');
      return JSON.parse(content) as RepoInsights;
    } catch {
      return null;
    }
  }

  public async generateInsights(repoId: string): Promise<void> {
    const repo = await this.repoRepo.findById(repoId);
    if (!repo) return;

    if (!process.env.GEMINI_API_KEY) {
      logger.warn('GEMINI_API_KEY not set, skipping insight generation.');
      return;
    }

    try {
      // Find package.json or README.md or similar at root to feed to the model
      const rootFiles = ['package.json', 'README.md', 'requirements.txt', 'go.mod'];
      let rootContext = '';

      for (const file of rootFiles) {
        try {
          const content = await fs.readFile(path.join(repo.localPath, file), 'utf-8');
          rootContext += `\n--- ${file} ---\n${content.substring(0, 5000)}\n`;
        } catch {
          // ignore
        }
      }

      const prompt = `
Analyze this software repository.
Name: ${repo.fullName}
Primary Language: ${repo.primaryLanguage}
Languages: ${JSON.stringify(repo.languages)}
File Count: ${repo.fileCount}

Based on these root files:
${rootContext}

Provide a JSON response strictly matching this TypeScript interface:
interface RepoInsights {
  overview: string; // 2-3 sentences max
  frameworks: string[]; // detected frameworks e.g. ["Next.js", "Express"]
  architecture: string; // brief summary of pattern e.g. "Monorepo with frontend and backend"
  entryPoints: string[]; // main files e.g. ["src/index.ts"]
  complexityScore: number; // 1 to 10
}

Return ONLY valid JSON.
      `;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text || '{}';
      // Clean up markdown json blocks if any
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const insights = JSON.parse(jsonStr) as RepoInsights;

      await fs.writeFile(this.getInsightsPath(repoId), JSON.stringify(insights, null, 2), 'utf-8');
      logger.info(`Generated insights for ${repoId}`);

    } catch (e) {
      logger.error(`Failed to generate insights for ${repoId}:`, e);
    }
  }
}
