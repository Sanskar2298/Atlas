import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { RepoService } from './repoService';
import { logger } from '../utils/logger';
import { CodeReviewResult, CodeReviewIssue } from '../models/fileAnalysis';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export class CodeReviewService {
  private repoService: RepoService;

  constructor() {
    this.repoService = new RepoService();
  }

  public async reviewFile(repoId: string, filePath: string): Promise<CodeReviewResult> {
    logger.info(`Reviewing file ${filePath} in repo ${repoId}`);
    
    try {
      const contentObj = await this.repoService.getFileContent(repoId, filePath);
      
      const prompt = `Review the following ${contentObj.language} code for bugs, security vulnerabilities, performance bottlenecks, and code smells.
      
File: ${filePath}
Content:
\`\`\`
${contentObj.content}
\`\`\`

Provide a detailed review in JSON format matching this exact schema:
{
  "summary": "High-level summary of the code quality and findings",
  "issues": [
    {
      "severity": "critical | warning | info | suggestion",
      "category": "bug | security | performance | code-smell | style",
      "title": "Short issue title",
      "description": "Detailed explanation of the issue",
      "line": 42,
      "suggestedFix": "Code snippet showing the fix (optional)"
    }
  ]
}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text || '{}';
      const jsonStr = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
      const result = JSON.parse(jsonStr);

      const issues: CodeReviewIssue[] = (result.issues || []).map((issue: any) => ({
        id: uuidv4(),
        filePath,
        line: issue.line || 1,
        severity: issue.severity || 'info',
        category: issue.category || 'code-smell',
        title: issue.title || 'Code Issue',
        description: issue.description || '',
        suggestedFix: issue.suggestedFix
      }));

      return {
        repoId,
        scope: 'file',
        scopePath: filePath,
        issues,
        summary: result.summary || 'Code review completed.',
        generatedAt: new Date().toISOString()
      };

    } catch (e) {
      logger.error(`Failed to review file ${filePath}`, e);
      throw new Error('Code review failed');
    }
  }
}
