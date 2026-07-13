import { v4 as uuidv4 } from 'uuid';
import { CodeChunk, ChunkType } from '../models/chunk';

const MAX_LINES_PER_CHUNK = 250;
const MIN_LINES_PER_CHUNK = 10;

// ── Language-specific symbol regexes ─────────────────────────────────────────

interface SymbolMatch {
  name: string;
  symbolType: CodeChunk['symbolType'];
  chunkType: ChunkType;
}

// JavaScript / TypeScript patterns
const JS_TS_PATTERNS: { regex: RegExp; symbolType: CodeChunk['symbolType']; chunkType: ChunkType }[] = [
  { regex: /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/, symbolType: 'class', chunkType: 'class' },
  { regex: /^(?:export\s+)?(?:default\s+)?function\s*\*?\s+([A-Za-z0-9_$]+)/, symbolType: 'function', chunkType: 'function' },
  { regex: /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z0-9_$]+)/, symbolType: 'function', chunkType: 'function' },
  { regex: /^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]*)\s*=>/, symbolType: 'function', chunkType: 'function' },
  { regex: /^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*function/, symbolType: 'function', chunkType: 'function' },
  { regex: /^(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/, symbolType: 'interface', chunkType: 'interface' },
  { regex: /^(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=/, symbolType: 'type', chunkType: 'type' },
  { regex: /^(?:export\s+)?enum\s+([A-Za-z0-9_$]+)/, symbolType: 'enum', chunkType: 'block' },
  { regex: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*[:=]/, symbolType: 'variable', chunkType: 'block' },
];

// Python patterns
const PYTHON_PATTERNS: { regex: RegExp; symbolType: CodeChunk['symbolType']; chunkType: ChunkType }[] = [
  { regex: /^class\s+([A-Za-z0-9_]+)/, symbolType: 'class', chunkType: 'class' },
  { regex: /^(?:async\s+)?def\s+([A-Za-z0-9_]+)/, symbolType: 'function', chunkType: 'function' },
  { regex: /^([A-Z][A-Z0-9_]+)\s*=/, symbolType: 'constant', chunkType: 'block' },
];

// Java / Kotlin patterns
const JAVA_PATTERNS: { regex: RegExp; symbolType: CodeChunk['symbolType']; chunkType: ChunkType }[] = [
  { regex: /^(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?(?:final\s+)?class\s+([A-Za-z0-9_]+)/, symbolType: 'class', chunkType: 'class' },
  { regex: /^(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?(?:final\s+)?interface\s+([A-Za-z0-9_]+)/, symbolType: 'interface', chunkType: 'interface' },
  { regex: /^(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?(?:final\s+)?enum\s+([A-Za-z0-9_]+)/, symbolType: 'enum', chunkType: 'block' },
  { regex: /^\s{2,}(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?(?:final\s+)?(?:synchronized\s+)?(?:\S+\s+)+([A-Za-z0-9_]+)\s*\(/, symbolType: 'method', chunkType: 'method' },
];

// Go patterns
const GO_PATTERNS: { regex: RegExp; symbolType: CodeChunk['symbolType']; chunkType: ChunkType }[] = [
  { regex: /^func\s+\([^)]+\)\s+([A-Za-z0-9_]+)/, symbolType: 'method', chunkType: 'method' },
  { regex: /^func\s+([A-Za-z0-9_]+)/, symbolType: 'function', chunkType: 'function' },
  { regex: /^type\s+([A-Za-z0-9_]+)\s+struct/, symbolType: 'class', chunkType: 'class' },
  { regex: /^type\s+([A-Za-z0-9_]+)\s+interface/, symbolType: 'interface', chunkType: 'interface' },
  { regex: /^type\s+([A-Za-z0-9_]+)/, symbolType: 'type', chunkType: 'type' },
];

// Rust patterns
const RUST_PATTERNS: { regex: RegExp; symbolType: CodeChunk['symbolType']; chunkType: ChunkType }[] = [
  { regex: /^(?:pub\s+)?struct\s+([A-Za-z0-9_]+)/, symbolType: 'class', chunkType: 'class' },
  { regex: /^(?:pub\s+)?enum\s+([A-Za-z0-9_]+)/, symbolType: 'enum', chunkType: 'block' },
  { regex: /^(?:pub\s+)?trait\s+([A-Za-z0-9_]+)/, symbolType: 'interface', chunkType: 'interface' },
  { regex: /^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/, symbolType: 'function', chunkType: 'function' },
  { regex: /^impl(?:<[^>]+>)?\s+([A-Za-z0-9_]+)/, symbolType: 'class', chunkType: 'class' },
  { regex: /^\s+(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/, symbolType: 'method', chunkType: 'method' },
];

// C / C++ patterns
const CPP_PATTERNS: { regex: RegExp; symbolType: CodeChunk['symbolType']; chunkType: ChunkType }[] = [
  { regex: /^(?:class|struct)\s+([A-Za-z0-9_]+)/, symbolType: 'class', chunkType: 'class' },
  { regex: /^(?:namespace)\s+([A-Za-z0-9_]+)/, symbolType: 'class', chunkType: 'block' },
  { regex: /^(?:template\s*<[^>]*>\s*)?(?:static\s+)?(?:inline\s+)?(?:virtual\s+)?(?:const\s+)?(?:\S+\s+)+([A-Za-z0-9_]+)\s*\(/, symbolType: 'function', chunkType: 'function' },
];

// Import detection patterns
const IMPORT_PATTERNS = [
  /^import\s+/,                          // JS/TS/Java/Python
  /^from\s+\S+\s+import\s+/,            // Python
  /^(?:const|let|var)\s+.*=\s*require\(/, // CommonJS
  /^use\s+/,                              // Rust
  /^#include\s+/,                          // C/C++
];

// Export detection patterns
const EXPORT_PATTERNS = [
  /^export\s+(?:default\s+)?/,           // JS/TS
  /^module\.exports\s*=/,                 // CommonJS
  /^pub\s+/,                              // Rust
];

function getPatternsForLanguage(language: string): { regex: RegExp; symbolType: CodeChunk['symbolType']; chunkType: ChunkType }[] {
  switch (language) {
    case 'JavaScript':
    case 'TypeScript':
      return JS_TS_PATTERNS;
    case 'Python':
      return PYTHON_PATTERNS;
    case 'Java':
    case 'Kotlin':
      return JAVA_PATTERNS;
    case 'Go':
      return GO_PATTERNS;
    case 'Rust':
      return RUST_PATTERNS;
    case 'C':
    case 'C++':
      return CPP_PATTERNS;
    default:
      return JS_TS_PATTERNS; // Fallback to JS/TS patterns
  }
}

function isImportLine(line: string): boolean {
  return IMPORT_PATTERNS.some(p => p.test(line.trim()));
}

function isExportLine(line: string): boolean {
  return EXPORT_PATTERNS.some(p => p.test(line.trim()));
}

export class ChunkingService {
  /**
   * Intelligently chunks file content based on language-aware heuristics.
   * Preserves function and class boundaries, separates imports/exports.
   */
  public chunkFile(
    repoId: string,
    filePath: string,
    language: string,
    content: string
  ): Omit<CodeChunk, 'embedding'>[] {
    const lines = content.split('\n');
    const chunks: Omit<CodeChunk, 'embedding'>[] = [];
    const patterns = getPatternsForLanguage(language);

    // If file is small, keep it as a single chunk
    if (lines.length <= MAX_LINES_PER_CHUNK) {
      const chunkType = this.classifyWholeFile(lines, language);
      return [
        {
          id: uuidv4(),
          repoId,
          filePath,
          language,
          content,
          startLine: 1,
          endLine: lines.length,
          chunkType,
        },
      ];
    }

    // Phase 1: Extract import block at the top
    let importEndIdx = 0;
    const importLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        if (importLines.length > 0) importLines.push(lines[i]);
        continue;
      }
      if (isImportLine(lines[i])) {
        importLines.push(lines[i]);
        importEndIdx = i;
      } else {
        break;
      }
    }

    if (importLines.length >= 2) {
      chunks.push({
        id: uuidv4(),
        repoId,
        filePath,
        language,
        content: importLines.join('\n'),
        startLine: 1,
        endLine: importEndIdx + 1,
        chunkType: 'import',
        symbolName: 'imports',
      });
    }

    // Phase 2: Process rest of file with symbol-aware chunking
    const startIdx = importLines.length >= 2 ? importEndIdx + 1 : 0;
    let currentChunkLines: string[] = [];
    let chunkStartLine = startIdx + 1;
    let currentSymbolName = '';
    let currentSymbolType: CodeChunk['symbolType'] | undefined;
    let currentChunkType: ChunkType = 'block';

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Try to match a new symbol at the start of a line (non-indented or moderately indented)
      let match: SymbolMatch | null = null;
      const leadingSpaces = line.length - line.trimStart().length;

      // For top-level symbols, check at column 0 (or small indent for some languages)
      if (leadingSpaces <= 4) {
        for (const pattern of patterns) {
          const m = trimmedLine.match(pattern.regex);
          if (m && m[1]) {
            match = { name: m[1], symbolType: pattern.symbolType, chunkType: pattern.chunkType };
            break;
          }
        }
      }

      // If we found a new symbol and current chunk is big enough, flush
      if (match && currentChunkLines.length >= MIN_LINES_PER_CHUNK) {
        chunks.push({
          id: uuidv4(),
          repoId,
          filePath,
          language,
          content: currentChunkLines.join('\n'),
          startLine: chunkStartLine,
          endLine: i, // previous line
          symbolName: currentSymbolName || undefined,
          symbolType: currentSymbolType,
          chunkType: currentChunkType,
        });
        currentChunkLines = [];
        chunkStartLine = i + 1;
        currentSymbolName = match.name;
        currentSymbolType = match.symbolType;
        currentChunkType = match.chunkType;
      } else if (!currentSymbolName && match) {
        currentSymbolName = match.name;
        currentSymbolType = match.symbolType;
        currentChunkType = match.chunkType;
      }

      // Force split if chunk is too large
      if (currentChunkLines.length >= MAX_LINES_PER_CHUNK) {
        chunks.push({
          id: uuidv4(),
          repoId,
          filePath,
          language,
          content: currentChunkLines.join('\n'),
          startLine: chunkStartLine,
          endLine: i,
          symbolName: currentSymbolName || undefined,
          symbolType: currentSymbolType,
          chunkType: currentChunkType,
        });
        currentChunkLines = [];
        chunkStartLine = i + 1;
        currentSymbolName = '';
        currentSymbolType = undefined;
        currentChunkType = 'block';
      }

      currentChunkLines.push(line);
    }

    // Flush remaining
    if (currentChunkLines.length > 0) {
      const isWhitespaceOnly = currentChunkLines.every(l => l.trim() === '');
      if (!isWhitespaceOnly) {
        chunks.push({
          id: uuidv4(),
          repoId,
          filePath,
          language,
          content: currentChunkLines.join('\n'),
          startLine: chunkStartLine,
          endLine: lines.length,
          symbolName: currentSymbolName || undefined,
          symbolType: currentSymbolType,
          chunkType: currentChunkType,
        });
      }
    }

    return chunks;
  }

  /**
   * Classify a small file's primary chunk type.
   */
  private classifyWholeFile(lines: string[], language: string): ChunkType {
    const content = lines.join('\n');
    const importCount = lines.filter(l => isImportLine(l)).length;
    const exportCount = lines.filter(l => isExportLine(l)).length;

    // Primarily imports (e.g. barrel file)
    if (importCount > lines.length * 0.5) return 'import';
    if (exportCount > lines.length * 0.5) return 'export';

    return 'file';
  }

  /**
   * Extract symbol information from file content for code navigation.
   */
  public extractSymbols(
    filePath: string,
    language: string,
    content: string
  ): { name: string; type: CodeChunk['symbolType']; line: number; exported: boolean }[] {
    const lines = content.split('\n');
    const patterns = getPatternsForLanguage(language);
    const symbols: { name: string; type: CodeChunk['symbolType']; line: number; exported: boolean }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      for (const pattern of patterns) {
        const m = trimmed.match(pattern.regex);
        if (m && m[1]) {
          symbols.push({
            name: m[1],
            type: pattern.symbolType!,
            line: i + 1,
            exported: isExportLine(line) || trimmed.startsWith('pub '),
          });
          break;
        }
      }
    }

    return symbols;
  }
}
