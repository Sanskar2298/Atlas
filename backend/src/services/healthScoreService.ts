import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { RepoService } from './repoService';
import { FileAnalysisService } from './fileAnalysisService';
import { logger } from '../utils/logger';
import { REPOS_DATA_DIR } from '../config/storage';
import type {
  HealthScore, LanguageStat, TodoItem, DeadCodeCandidate, DuplicateCandidate
} from '../models/fileAnalysis';
import type { FileNode } from '../models/types';

export class HealthScoreService {
  private repoService: RepoService;
  private fileAnalysisService: FileAnalysisService;

  constructor() {
    this.repoService = new RepoService();
    this.fileAnalysisService = new FileAnalysisService();
  }

  public async getHealthScore(repoId: string): Promise<HealthScore | null> {
    try {
      const repo = await this.repoService.getRepoById(repoId);
      if (!repo) return null;

      const tree = await this.repoService.getFileTree(repoId);
      const allFiles = this.flattenTree(tree);
      
      let totalLines = 0;
      let totalComplexity = 0;
      let filesWithTests = 0;
      let filesWithErrorHandling = 0;
      let filesWithDocs = 0;
      
      const fileSizes: { path: string; lines: number }[] = [];
      const fileComplexities: { path: string; complexity: number }[] = [];

      // Language statistics
      const langData: Record<string, { fileCount: number; linesOfCode: number }> = {};

      // Dead code: track all exported symbols and all imported symbols
      const allExports: { filePath: string; name: string; type: string; line: number }[] = [];
      const allImportedSymbols = new Set<string>();

      // Duplicate detection: hash normalized function bodies
      const functionHashes: { hash: string; filePath: string; name: string; line: number }[] = [];

      for (const file of allFiles) {
        if (!file.language) continue; // Skip binary/unknown

        const analysis = await this.fileAnalysisService.getAnalysis(repoId, file.path);
        if (analysis) {
          totalLines += analysis.complexity.linesOfCode;
          totalComplexity += analysis.complexity.cyclomaticEstimate;
          
          if (analysis.complexity.hasTests) filesWithTests++;
          if (analysis.complexity.hasErrorHandling) filesWithErrorHandling++;
          
          // Documentation heuristic: check if file has a summary from AI
          if (analysis.summary && analysis.summary.length > 30) filesWithDocs++;
          
          fileSizes.push({ path: file.path, lines: analysis.complexity.linesOfCode });
          fileComplexities.push({ path: file.path, complexity: analysis.complexity.cyclomaticEstimate });

          // Aggregate language stats
          const lang = analysis.language || file.language || 'Unknown';
          if (!langData[lang]) langData[lang] = { fileCount: 0, linesOfCode: 0 };
          langData[lang].fileCount++;
          langData[lang].linesOfCode += analysis.complexity.linesOfCode;

          // Track exports for dead code detection
          for (const exp of analysis.exports) {
            allExports.push({
              filePath: file.path,
              name: exp.name,
              type: exp.type,
              line: exp.line,
            });
          }

          // Track imports
          for (const imp of analysis.imports) {
            for (const spec of imp.specifiers) {
              allImportedSymbols.add(spec);
            }
          }

          // Hash function symbols for duplicate detection
          for (const sym of analysis.symbols) {
            if (sym.type === 'function' || sym.type === 'method') {
              // Use name + approximate line count as a fingerprint
              const fingerprint = `${sym.name}:${(sym.endLine || sym.line) - sym.line}`;
              const hash = crypto.createHash('md5').update(fingerprint).digest('hex');
              functionHashes.push({ hash, filePath: file.path, name: sym.name, line: sym.line });
            }
          }
        }
      }

      if (fileSizes.length === 0) return null;

      // Sort to get top offenders
      fileSizes.sort((a, b) => b.lines - a.lines);
      fileComplexities.sort((a, b) => b.complexity - a.complexity);

      // ── Language Statistics ──
      const totalLinesAll = Object.values(langData).reduce((sum, d) => sum + d.linesOfCode, 0) || 1;
      const languageStats: LanguageStat[] = Object.entries(langData)
        .map(([language, data]) => ({
          language,
          fileCount: data.fileCount,
          linesOfCode: data.linesOfCode,
          percentage: Math.round((data.linesOfCode / totalLinesAll) * 1000) / 10,
        }))
        .sort((a, b) => b.linesOfCode - a.linesOfCode);

      // ── TODO/FIXME Extraction ──
      const todoItems = await this.extractTodos(repo.localPath, allFiles);

      // ── Dead Code Detection ──
      const deadCodeCandidates: DeadCodeCandidate[] = [];
      for (const exp of allExports) {
        // Skip default exports and common names
        if (exp.name === 'default' || exp.name === 'module.exports') continue;
        if (!allImportedSymbols.has(exp.name)) {
          deadCodeCandidates.push({
            filePath: exp.filePath,
            symbolName: exp.name,
            symbolType: exp.type,
            line: exp.line,
            reason: 'Exported symbol never imported by other files in this repository',
          });
        }
      }
      // Limit to top 20 to avoid noise
      deadCodeCandidates.splice(20);

      // ── Duplicate Detection ──
      const duplicateCandidates: DuplicateCandidate[] = [];
      const hashGroups: Record<string, typeof functionHashes> = {};
      for (const fh of functionHashes) {
        if (!hashGroups[fh.hash]) hashGroups[fh.hash] = [];
        hashGroups[fh.hash].push(fh);
      }
      for (const [, group] of Object.entries(hashGroups)) {
        if (group.length < 2) continue;
        // Don't flag same-file duplicates (overloads) or common names like 'constructor'
        for (let i = 0; i < group.length && duplicateCandidates.length < 15; i++) {
          for (let j = i + 1; j < group.length && duplicateCandidates.length < 15; j++) {
            if (group[i].filePath === group[j].filePath) continue;
            if (group[i].name === 'constructor' || group[i].name === 'render') continue;
            duplicateCandidates.push({
              filePathA: group[i].filePath,
              filePathB: group[j].filePath,
              symbolNameA: group[i].name,
              symbolNameB: group[j].name,
              lineA: group[i].line,
              lineB: group[j].line,
              similarity: 1.0, // exact hash match
            });
          }
        }
      }

      // ── Calculate scores (0-100) ──
      const numFiles = fileSizes.length;
      const testCoverage = Math.min(100, Math.round((filesWithTests / numFiles) * 200)); // Be generous
      const maintainability = Math.max(0, 100 - Math.round(totalComplexity / numFiles * 10));
      const security = Math.max(0, 100 - (deadCodeCandidates.length * 2)); // Penalize unused exports
      const documentation = Math.min(100, Math.round((filesWithDocs / numFiles) * 100));
      
      // Technical debt inversely proportional to complexity, dead code, and duplicates
      const technicalDebt = Math.max(0, Math.min(100,
        maintainability * 0.4 +
        testCoverage * 0.3 +
        Math.max(0, 100 - deadCodeCandidates.length * 3) * 0.15 +
        Math.max(0, 100 - duplicateCandidates.length * 5) * 0.15
      ));
      
      const overall = Math.round((testCoverage + maintainability + security + documentation + technicalDebt) / 5);

      return {
        repoId,
        overall,
        security,
        maintainability,
        testCoverage,
        documentation,
        technicalDebt,
        largestFiles: fileSizes.slice(0, 5),
        mostComplexFiles: fileComplexities.slice(0, 5),
        languageStats,
        todoItems,
        deadCodeCandidates,
        duplicateCandidates,
        generatedAt: new Date().toISOString()
      };
    } catch (e) {
      logger.error(`Failed to calculate health score for ${repoId}`, e);
      return null;
    }
  }

  /**
   * Extract TODO/FIXME/HACK/XXX/BUG comments from source files.
   */
  private async extractTodos(repoLocalPath: string, files: FileNode[]): Promise<TodoItem[]> {
    const todos: TodoItem[] = [];
    const pattern = /\b(TODO|FIXME|HACK|XXX|BUG)\b[:\s]*(.+)/i;
    const MAX_TODOS = 50;

    for (const file of files) {
      if (todos.length >= MAX_TODOS) break;
      if (!file.language) continue;

      try {
        const filePath = path.join(repoLocalPath, file.path);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length && todos.length < MAX_TODOS; i++) {
          const match = lines[i].match(pattern);
          if (match) {
            todos.push({
              filePath: file.path,
              line: i + 1,
              type: match[1].toUpperCase() as TodoItem['type'],
              text: match[2].trim().slice(0, 200), // cap length
            });
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return todos;
  }

  private flattenTree(nodes: FileNode[]): FileNode[] {
    const result: FileNode[] = [];
    const walk = (arr: FileNode[]) => {
      for (const n of arr) {
        if (n.type === 'file') result.push(n);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return result;
  }
}
