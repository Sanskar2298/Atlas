import { GoogleGenAI } from '@google/genai';
import { RepoService } from './repoService';
import { logger } from '../utils/logger';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export class TestGenerationService {
  private repoService: RepoService;

  constructor() {
    this.repoService = new RepoService();
  }

  public async generateTests(repoId: string, filePath: string, testFramework: string = 'jest'): Promise<string> {
    logger.info(`Generating tests for ${filePath} in repo ${repoId}`);
    
    try {
      const contentObj = await this.repoService.getFileContent(repoId, filePath);
      
      const prompt = `Generate comprehensive unit tests using ${testFramework} for the following file.
Include tests for normal execution paths, edge cases, and potential errors.
Return ONLY the test code. Do not include markdown formatting or explanations.

File: ${filePath}
Language: ${contentObj.language}
Content:
${contentObj.content}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
      });

      let text = response.text || '';
      text = text.replace(/^\`\`\`[a-z]*\n/, '').replace(/\n\`\`\`$/, '');
      return text;

    } catch (e) {
      logger.error(`Failed to generate tests for ${filePath}`, e);
      throw new Error('Test generation failed');
    }
  }
}
