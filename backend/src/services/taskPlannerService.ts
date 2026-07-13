import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { VectorSearchService } from './vectorSearchService';
import { EmbeddingService } from './embeddingService';
import { logger } from '../utils/logger';
import { TaskPlan, TaskStep } from '../models/fileAnalysis';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export class TaskPlannerService {
  private search: VectorSearchService;
  private embedding: EmbeddingService;

  constructor() {
    this.search = new VectorSearchService();
    this.embedding = new EmbeddingService();
  }

  public async generatePlan(repoId: string, request: string): Promise<TaskPlan> {
    logger.info(`Generating task plan for repo ${repoId}: ${request}`);

    // 1. Semantic search to understand the codebase context
    const queryVector = await this.embedding.generateEmbedding(request);
    const topChunks = await this.search.semanticSearch(repoId, queryVector, undefined, 20);

    let contextStr = '';
    for (const res of topChunks) {
      contextStr += `File: ${res.chunk.filePath}\nContent:\n${res.chunk.content}\n---\n`;
    }

    // 2. Build prompt
    const prompt = `You are an expert AI software engineer. The user wants to accomplish the following task:
"${request}"

Here are the most relevant code snippets from their repository to help you understand the context:
${contextStr}

Create a detailed implementation plan for this task. Respond ONLY in valid JSON format matching this schema:
{
  "understanding": "1-3 sentences demonstrating you understand the goal and the existing code context",
  "filesToModify": ["path/to/file1", "path/to/file2"],
  "filesToCreate": ["path/to/new_file"],
  "steps": [
    {
      "stepNumber": 1,
      "description": "What to do in this step",
      "filePath": "path/to/file (if applicable)",
      "changeType": "create | modify | delete | refactor"
    }
  ],
  "estimatedComplexity": 5, // 1-10 scale
  "riskAssessment": "What could go wrong or what needs careful testing"
}
`;

    // 3. Call AI
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
    });

    const text = response.text || '{}';
    const jsonStr = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (e) {
      logger.error('Failed to parse TaskPlan JSON', e);
      throw new Error('AI returned invalid plan format');
    }

    // 4. Construct plan
    const plan: TaskPlan = {
      id: uuidv4(),
      repoId,
      request,
      understanding: result.understanding || 'Task plan generated.',
      filesToModify: result.filesToModify || [],
      filesToCreate: result.filesToCreate || [],
      steps: result.steps || [],
      estimatedComplexity: result.estimatedComplexity || 5,
      riskAssessment: result.riskAssessment || 'None identified.',
      generatedAt: new Date().toISOString()
    };

    return plan;
  }
}
