// ── Repository Types ─────────────────────────────────────────────────────────

export type ImportStatus = 'pending' | 'cloning' | 'indexing' | 'ready' | 'error';

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  url: string;
  branch: string;
  status: ImportStatus;
  clonedAt: string;
  lastIndexed: string | null;
  fileCount: number;
  languages: Record<string, number>; // { TypeScript: 42, Python: 10 }
  primaryLanguage: string;
  sizeBytes: number;
  description: string;
  localPath: string;
  errorMessage?: string;
}

// ── File Tree Types ──────────────────────────────────────────────────────────

export type FileNodeType = 'file' | 'directory';

export interface FileNode {
  name: string;
  path: string;             // relative to repo root
  type: FileNodeType;
  language?: string;        // detected language for files
  sizeBytes?: number;
  children?: FileNode[];    // only present for directories
}

// ── File Content Types ───────────────────────────────────────────────────────

export interface FileContent {
  path: string;
  content: string;
  language: string;
  sizeBytes: number;
  lastModified: string;
  encoding: 'utf-8' | 'binary';
}

// ── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ImportRequest {
  url: string;
}

export interface FileRequest {
  path: string;
}
