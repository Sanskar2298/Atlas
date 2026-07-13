import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { logger } from '../utils/logger';
import { METADATA_DATA_DIR } from '../config/storage';
import { ChunkingService } from './chunkingService';
import type { FileAnalysis, SymbolInfo, ImportInfo, ExportInfo, ComplexityIndicators } from '../models/fileAnalysis';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export class FileAnalysisService {
  private chunking: ChunkingService;

  constructor() {
    this.chunking = new ChunkingService();
  }

  private getAnalysisDir(repoId: string): string {
    return path.join(METADATA_DATA_DIR, repoId, 'files');
  }

  private getAnalysisPath(repoId: string, filePath: string): string {
    const safeName = filePath.replace(/[/\\]/g, '__');
    return path.join(this.getAnalysisDir(repoId), `${safeName}.analysis.json`);
  }

  /**
   * Get cached file analysis, or return null.
   */
  public async getAnalysis(repoId: string, filePath: string): Promise<FileAnalysis | null> {
    try {
      const p = this.getAnalysisPath(repoId, filePath);
      const content = await fs.readFile(p, 'utf-8');
      return JSON.parse(content) as FileAnalysis;
    } catch {
      return null;
    }
  }

  /**
   * Analyze a single file: extract symbols, imports, exports, complexity, and generate AI summary.
   */
  public async analyzeFile(
    repoId: string,
    filePath: string,
    language: string,
    content: string
  ): Promise<FileAnalysis> {
    // Static analysis first (no AI needed)
    const symbols = this.extractSymbols(filePath, language, content);
    const imports = this.extractImports(content, language);
    const exports = this.extractExports(content, language);
    const complexity = this.calculateComplexity(content, language, symbols);

    // AI-generated summary and purpose
    let summary = '';
    let purpose = '';

    if (process.env.GEMINI_API_KEY && content.length < 50000) {
      try {
        const aiResult = await this.generateAISummary(filePath, language, content, symbols);
        summary = aiResult.summary;
        purpose = aiResult.purpose;
      } catch (e) {
        logger.warn(`AI summary failed for ${filePath}:`, e);
        summary = this.generateFallbackSummary(filePath, language, symbols);
        purpose = this.inferPurpose(filePath, language);
      }
    } else {
      summary = this.generateFallbackSummary(filePath, language, symbols);
      purpose = this.inferPurpose(filePath, language);
    }

    const analysis: FileAnalysis = {
      repoId,
      filePath,
      language,
      summary,
      purpose,
      symbols,
      imports,
      exports,
      complexity,
      generatedAt: new Date().toISOString(),
    };

    // Cache to disk
    await this.saveAnalysis(repoId, filePath, analysis);
    return analysis;
  }

  private async saveAnalysis(repoId: string, filePath: string, analysis: FileAnalysis): Promise<void> {
    const dir = this.getAnalysisDir(repoId);
    await fs.mkdir(dir, { recursive: true });
    const p = this.getAnalysisPath(repoId, filePath);
    await fs.writeFile(p, JSON.stringify(analysis, null, 2), 'utf-8');
  }

  /**
   * Extract symbols (classes, functions, etc.) from file content.
   */
  private extractSymbols(filePath: string, language: string, content: string): SymbolInfo[] {
    const rawSymbols = this.chunking.extractSymbols(filePath, language, content);
    return rawSymbols.map(s => ({
      name: s.name,
      type: s.type || 'variable',
      line: s.line,
      exported: s.exported,
    }));
  }

  /**
   * Extract imports from file content.
   */
  private extractImports(content: string, language: string): ImportInfo[] {
    const lines = content.split('\n');
    const imports: ImportInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // ES import: import { X, Y } from 'module'
      const esMatch = line.match(/^import\s+(?:(?:(\{[^}]+\})|(\*\s+as\s+\S+)|([A-Za-z0-9_$]+))\s*,?\s*(?:(\{[^}]+\}))?)\s*from\s+['"]([^'"]+)['"]/);
      if (esMatch) {
        const specifiers: string[] = [];
        let isDefault = false;

        if (esMatch[1]) { // named: { X, Y }
          specifiers.push(...esMatch[1].replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean));
        }
        if (esMatch[2]) { // namespace: * as X
          specifiers.push(esMatch[2].replace('* as ', '').trim());
        }
        if (esMatch[3]) { // default import
          specifiers.push(esMatch[3]);
          isDefault = true;
        }
        if (esMatch[4]) { // additional named imports
          specifiers.push(...esMatch[4].replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean));
        }

        imports.push({ source: esMatch[5], specifiers, isDefault, line: i + 1 });
        continue;
      }

      // Simple: import 'module' (side-effect)
      const sideEffect = line.match(/^import\s+['"]([^'"]+)['"]/);
      if (sideEffect) {
        imports.push({ source: sideEffect[1], specifiers: [], isDefault: false, line: i + 1 });
        continue;
      }

      // CommonJS: const X = require('module')
      const cjsMatch = line.match(/^(?:const|let|var)\s+(?:(\{[^}]+\})|([A-Za-z0-9_$]+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (cjsMatch) {
        const specifiers: string[] = [];
        if (cjsMatch[1]) {
          specifiers.push(...cjsMatch[1].replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean));
        }
        if (cjsMatch[2]) {
          specifiers.push(cjsMatch[2]);
        }
        imports.push({ source: cjsMatch[3], specifiers, isDefault: !!cjsMatch[2], line: i + 1 });
        continue;
      }

      // Python: from module import X, Y or import module
      const pyFromMatch = line.match(/^from\s+(\S+)\s+import\s+(.+)/);
      if (pyFromMatch) {
        const specifiers = pyFromMatch[2].split(',').map(s => s.trim().split(' as ')[0].trim()).filter(Boolean);
        imports.push({ source: pyFromMatch[1], specifiers, isDefault: false, line: i + 1 });
        continue;
      }
      const pyImportMatch = line.match(/^import\s+([A-Za-z0-9_.]+)/);
      if (pyImportMatch && language === 'Python') {
        imports.push({ source: pyImportMatch[1], specifiers: [pyImportMatch[1]], isDefault: true, line: i + 1 });
        continue;
      }

      // Go: import "package"
      const goMatch = line.match(/^\s*(?:"([^"]+)"|([\w.]+)\s+"([^"]+)")/);
      if (goMatch && language === 'Go') {
        const source = goMatch[3] || goMatch[1];
        const alias = goMatch[2] || '';
        if (source) {
          imports.push({ source, specifiers: alias ? [alias] : [], isDefault: false, line: i + 1 });
        }
      }
    }

    return imports;
  }

  /**
   * Extract exports from file content.
   */
  private extractExports(content: string, language: string): ExportInfo[] {
    const lines = content.split('\n');
    const exports: ExportInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // export default
      if (/^export\s+default\s+/.test(line)) {
        const nameMatch = line.match(/export\s+default\s+(?:class|function|const|let|var)?\s*([A-Za-z0-9_$]+)/);
        exports.push({
          name: nameMatch?.[1] || 'default',
          type: 'default',
          line: i + 1,
        });
        continue;
      }

      // export { X, Y }
      if (/^export\s*\{/.test(line)) {
        const namesMatch = line.match(/\{([^}]+)\}/);
        if (namesMatch) {
          const names = namesMatch[1].split(',').map(s => s.trim().split(' as ')[0].trim()).filter(Boolean);
          for (const name of names) {
            exports.push({ name, type: 'named', line: i + 1 });
          }
        }
        continue;
      }

      // export const/function/class/interface/type/enum
      const namedMatch = line.match(/^export\s+(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/);
      if (namedMatch) {
        exports.push({ name: namedMatch[1], type: 'named', line: i + 1 });
        continue;
      }

      // module.exports
      if (/^module\.exports\s*=/.test(line)) {
        exports.push({ name: 'module.exports', type: 'default', line: i + 1 });
      }
    }

    return exports;
  }

  /**
   * Calculate complexity indicators for a file.
   */
  private calculateComplexity(content: string, language: string, symbols: SymbolInfo[]): ComplexityIndicators {
    const lines = content.split('\n');
    const linesOfCode = lines.filter(l => l.trim() !== '' && !l.trim().startsWith('//') && !l.trim().startsWith('#')).length;

    // Estimate cyclomatic complexity: count decision points
    const decisionKeywords = ['if', 'else if', 'elif', 'switch', 'case', 'for', 'while', 'catch', 'ternary', '&&', '||', '??'];
    let cyclomaticEstimate = 1;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/\bif\s*\(/.test(trimmed) || /\belif\s+/.test(trimmed) || /\belse\s+if\s*\(/.test(trimmed)) cyclomaticEstimate++;
      if (/\bfor\s*[\s(]/.test(trimmed)) cyclomaticEstimate++;
      if (/\bwhile\s*\(/.test(trimmed)) cyclomaticEstimate++;
      if (/\bcase\s+/.test(trimmed)) cyclomaticEstimate++;
      if (/\bcatch\s*\(/.test(trimmed) || /\bexcept\s/.test(trimmed)) cyclomaticEstimate++;
      if (/\?\s*.*:/.test(trimmed)) cyclomaticEstimate++; // ternary
    }
    cyclomaticEstimate = Math.min(10, Math.ceil(cyclomaticEstimate / Math.max(linesOfCode / 50, 1)));

    // Calculate max nesting depth
    let maxDepth = 0;
    let currentDepth = 0;
    for (const line of lines) {
      const opens = (line.match(/{/g) || []).length;
      const closes = (line.match(/}/g) || []).length;
      currentDepth += opens - closes;
      maxDepth = Math.max(maxDepth, currentDepth);
    }

    const functionCount = symbols.filter(s => s.type === 'function' || s.type === 'method').length;
    const classCount = symbols.filter(s => s.type === 'class').length;
    const importCount = this.extractImports(content, language).length;

    // Error handling detection
    const hasErrorHandling = /\b(?:try\s*{|catch\s*\(|\.catch\(|except\s|rescue\s)/.test(content);
    const hasTests = /\b(?:describe|it|test|expect|assert|should)\s*\(/.test(content) ||
                     /(?:\.test\.|\.spec\.|_test\.)/.test('');

    return {
      linesOfCode,
      cyclomaticEstimate,
      nestingDepth: maxDepth,
      functionCount,
      classCount,
      importCount,
      hasErrorHandling,
      hasTests,
    };
  }

  /**
   * Generate AI summary and purpose using Gemini.
   */
  private async generateAISummary(
    filePath: string,
    language: string,
    content: string,
    symbols: SymbolInfo[]
  ): Promise<{ summary: string; purpose: string }> {
    const truncatedContent = content.length > 15000 ? content.substring(0, 15000) + '\n... (truncated)' : content;
    const symbolList = symbols.map(s => `${s.type}: ${s.name} (line ${s.line})`).join('\n');

    const prompt = `Analyze this ${language} file and provide a brief summary and purpose.

File: ${filePath}
Language: ${language}
Symbols found:
${symbolList}

File content:
${truncatedContent}

Respond in JSON format ONLY:
{
  "summary": "1-2 sentence summary of what this file does",
  "purpose": "1 sentence describing the file's role in the project"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '{}';
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);
    return {
      summary: result.summary || 'No summary available.',
      purpose: result.purpose || 'Unknown purpose.',
    };
  }

  /**
   * Generate a fallback summary without AI.
   */
  private generateFallbackSummary(filePath: string, language: string, symbols: SymbolInfo[]): string {
    const funcCount = symbols.filter(s => s.type === 'function' || s.type === 'method').length;
    const classCount = symbols.filter(s => s.type === 'class').length;
    const parts: string[] = [];

    if (classCount > 0) parts.push(`${classCount} class${classCount > 1 ? 'es' : ''}`);
    if (funcCount > 0) parts.push(`${funcCount} function${funcCount > 1 ? 's' : ''}`);

    const basename = path.basename(filePath);
    return parts.length > 0
      ? `${language} file containing ${parts.join(' and ')}.`
      : `${language} file: ${basename}`;
  }

  /**
   * Infer file purpose from its path.
   */
  private inferPurpose(filePath: string, language: string): string {
    const lower = filePath.toLowerCase();
    if (lower.includes('controller')) return 'HTTP request handler / controller';
    if (lower.includes('service')) return 'Business logic service';
    if (lower.includes('model') || lower.includes('schema')) return 'Data model / schema definition';
    if (lower.includes('route')) return 'API route definitions';
    if (lower.includes('middleware')) return 'Request middleware';
    if (lower.includes('util') || lower.includes('helper')) return 'Utility functions';
    if (lower.includes('config')) return 'Configuration';
    if (lower.includes('test') || lower.includes('spec')) return 'Test file';
    if (lower.includes('component')) return 'UI component';
    if (lower.includes('hook')) return 'React hook';
    if (lower.includes('page')) return 'Page / view';
    if (lower.includes('layout')) return 'Layout component';
    if (lower.includes('type') || lower.includes('interface')) return 'Type definitions';
    if (lower.includes('index')) return 'Module entry point';
    return `${language} module`;
  }
}
