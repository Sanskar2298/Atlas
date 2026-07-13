import { Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { VectorSearchService } from './vectorSearchService';
import { EmbeddingService } from './embeddingService';
import { logger } from '../utils/logger';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class ChatService {
  private search: VectorSearchService;
  private embedding: EmbeddingService;
  private ai: GoogleGenAI;

  constructor() {
    this.search = new VectorSearchService();
    this.embedding = new EmbeddingService();
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    
    // Ensure index is ready
    this.search.initialize().catch(err => logger.error('Search init err', err));
  }

  public async streamChat(
    repoId: string,
    messages: ChatMessage[],
    res: Response
  ): Promise<void> {
    if (!process.env.GEMINI_API_KEY) {
      res.write('data: {"error": "GEMINI_API_KEY not set"}\n\n');
      res.end();
      return;
    }

    try {
      // 1. Get the latest user query
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg || lastMsg.role !== 'user') {
        throw new Error('Last message must be from user');
      }

      const query = lastMsg.content;

      // 2. Generate embedding for query
      const queryVector = await this.embedding.generateEmbedding(query);

      // 3. Retrieve relevant chunks
      const topChunks = await this.search.semanticSearch(repoId, queryVector, undefined, 10);

      // 4. Build context
      let contextStr = '=== REPOSITORY CONTEXT ===\n';
      if (topChunks.length === 0) {
        contextStr += 'No context found.\n';
      } else {
        topChunks.forEach((res, i) => {
          contextStr += `\n--- Chunk ${i + 1} ---\n`;
          contextStr += `File: ${res.chunk.filePath}\n`;
          contextStr += `Lines: ${res.chunk.startLine}-${res.chunk.endLine}\n`;
          contextStr += `Content:\n${res.chunk.content}\n`;
        });
      }

      // 5. System instructions
      const systemInstruction = `
You are Atlas AI, a highly intelligent software engineering assistant.
You are helping the user understand their codebase.

You must ALWAYS base your answers on the provided REPOSITORY CONTEXT.
If the information is not in the context, explicitly say that you cannot determine the answer from the current context.
NEVER hallucinate code or facts.

CRITICAL CITATION RULES:
Every time you mention code, functions, architecture, or any detail from the context, you MUST cite the file using standard markdown link syntax.
Format: [filename.ext](file:///<exact-filePath>#L<startLine>-<endLine>)
Example: The authentication is handled in [auth.ts](file:///src/middleware/auth.ts#L10-25).

Do NOT use placeholders. Do not wrap the link text in backticks.
Always maintain a helpful and professional tone.
`;

      const formattedMessages = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      // Inject context into the latest message
      const lastFormatted = formattedMessages[formattedMessages.length - 1];
      lastFormatted.parts = [
        { text: `${contextStr}\n\nUser Query: ${query}` }
      ];

      // 6. Stream from Gemini
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const responseStream = await this.ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: formattedMessages,
        systemInstruction,
      } as any);

      for await (const chunk of responseStream) {
        if (chunk.text) {
          const data = JSON.stringify({ text: chunk.text });
          res.write(`data: ${data}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();

    } catch (error: any) {
      logger.error('Chat stream error:', error);
      res.write(`data: {"error": "${error.message}"}\n\n`);
      res.end();
    }
  }
}
