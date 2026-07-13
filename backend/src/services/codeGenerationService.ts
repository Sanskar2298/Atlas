import { GoogleGenAI } from '@google/genai';
import { RepoService } from './repoService';
import { logger } from '../utils/logger';
import { DiffChange } from '../models/fileAnalysis';
import * as diff from 'diff';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export class CodeGenerationService {
  private repoService: RepoService;

  constructor() {
    this.repoService = new RepoService();
  }

  public async generateCodeChanges(repoId: string, planId: string, steps: any[]): Promise<DiffChange[]> {
    logger.info(`Generating code changes for repo ${repoId}`);
    
    // In a real implementation, we would fetch the full plan by ID.
    // For now, we'll just use the steps provided by the frontend.
    const changes: DiffChange[] = [];

    for (const step of steps) {
      if (!step.filePath) continue;

      try {
        let oldContent = '';
        if (step.changeType !== 'create') {
          try {
            const contentObj = await this.repoService.getFileContent(repoId, step.filePath);
            oldContent = contentObj.content;
          } catch (e) {
            // File might not exist yet despite not being marked 'create'
          }
        }

        const prompt = `You are an expert AI software engineer executing a step in a larger plan.
Task Step: ${step.description}
File: ${step.filePath}
Change Type: ${step.changeType}

${oldContent ? `Current File Content:\n\`\`\`\n${oldContent}\n\`\`\`\n` : ''}

Output ONLY the complete new content for this file. No markdown formatting, no markdown code blocks (\`\`\`), just the raw text content of the file. Do not include any explanations.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: prompt,
        });

        // Clean up markdown if the AI includes it anyway
        let newContent = response.text || '';
        newContent = newContent.replace(/^\`\`\`[a-z]*\n/, '').replace(/\n\`\`\`$/, '');

        changes.push({
          filePath: step.filePath,
          changeType: step.changeType,
          oldContent: oldContent || undefined,
          newContent,
          description: step.description
        });
      } catch (e) {
        logger.error(`Failed to generate code for ${step.filePath}`, e);
      }
    }

    return changes;
  }
}
