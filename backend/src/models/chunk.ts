export type ChunkType = 'function' | 'class' | 'interface' | 'type' | 'import' | 'export' | 'block' | 'file' | 'method';

export interface CodeChunk {
  id: string;
  repoId: string;
  filePath: string;
  language: string;
  content: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  symbolType?: 'class' | 'function' | 'interface' | 'type' | 'variable' | 'constant' | 'enum' | 'method';
  chunkType?: ChunkType;
  summary?: string;
  embedding?: number[];
}
