import { GoogleGenAI } from '@google/genai';
import { RepoService } from './repoService';
import { logger } from '../utils/logger';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export class DocGenerationService {
  private repoService: RepoService;

  constructor() {
    this.repoService = new RepoService();
  }

  public async generateDocs(repoId: string, filePath: string, docType: string): Promise<string> {
    logger.info(`Generating ${docType} docs for ${filePath} in repo ${repoId}`);
    
    try {
      const contentObj = await this.repoService.getFileContent(repoId, filePath);
      
      let prompt = '';
      if (docType === 'function') {
        prompt = `Generate standard JSDoc/docstring documentation for the functions and classes in this file. 
Return ONLY the file content with the newly added doc comments. Do not include markdown code blocks.
File: ${filePath}
Content:
${contentObj.content}`;
      } else if (docType === 'readme') {
        prompt = `Generate a comprehensive README.md section based on this file.
Return ONLY the markdown content.
File: ${filePath}
Content:
${contentObj.content}`;
      } else {
        prompt = `Generate ${docType} documentation for this file.
Return ONLY the documentation text.
File: ${filePath}
Content:
${contentObj.content}`;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      let text = response.text || '';
      text = text.replace(/^\`\`\`[a-z]*\n/, '').replace(/\n\`\`\`$/, '');
      return text;

    } catch (e) {
      logger.error(`Failed to generate docs for ${filePath}`, e);
      throw new Error('Doc generation failed');
    }
  }
}
