// ── File Analysis Types ──────────────────────────────────────────────────────

export interface SymbolInfo {
  name: string;
  type: 'class' | 'function' | 'interface' | 'type' | 'variable' | 'constant' | 'enum' | 'method';
  line: number;
  endLine?: number;
  description?: string;
  exported: boolean;
}

export interface ImportInfo {
  source: string;          // module path e.g. 'express', './utils'
  specifiers: string[];    // named imports e.g. ['Router', 'Request']
  isDefault: boolean;
  line: number;
}

export interface ExportInfo {
  name: string;
  type: 'default' | 'named' | 're-export';
  line: number;
}

export interface ComplexityIndicators {
  linesOfCode: number;
  cyclomaticEstimate: number;   // 1-10
  nestingDepth: number;
  functionCount: number;
  classCount: number;
  importCount: number;
  hasErrorHandling: boolean;
  hasTests: boolean;
}

export interface FileAnalysis {
  repoId: string;
  filePath: string;
  language: string;
  summary: string;
  purpose: string;
  symbols: SymbolInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  complexity: ComplexityIndicators;
  generatedAt: string;
}

// ── Project Overview Types ───────────────────────────────────────────────────

export interface LayerInfo {
  name: string;                // e.g. 'Frontend', 'Backend', 'Database'
  description: string;
  files: string[];
  technologies: string[];
}

export interface DependencyEdge {
  from: string;   // file path
  to: string;     // module or file path
  type: 'import' | 'require' | 'dynamic';
}

export interface FolderSummary {
  path: string;
  fileCount: number;
  primaryLanguage: string;
  purpose: string;
}

export interface FrameworkInfo {
  name: string;
  version?: string;
  category: 'frontend' | 'backend' | 'database' | 'devops' | 'testing' | 'utility';
}

export interface GraphNode {
  id: string;         // file path
  label: string;      // display name (basename)
  group: string;      // directory cluster
  size: number;       // visual weight (based on import count)
}

export interface GraphEdge {
  source: string;     // from node id
  target: string;     // to node id
  type: 'import' | 'require' | 'dynamic';
}

export interface ClusterInfo {
  name: string;       // directory name
  color: string;      // hex color for visualization
  fileCount: number;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: ClusterInfo[];
}

export interface ProjectOverview {
  repoId: string;
  architectureSummary: string;
  layers: LayerInfo[];
  folderSummaries: FolderSummary[];
  dependencyEdges: DependencyEdge[];
  communicationPatterns: string[];   // e.g. "REST API between frontend and backend"
  entryPoints: string[];
  frameworks: FrameworkInfo[];
  deploymentConfigs: string[];
  dependencyGraph: DependencyGraph;
  generatedAt: string;
}

// ── Code Review Types ────────────────────────────────────────────────────────

export type IssueSeverity = 'critical' | 'warning' | 'info' | 'suggestion';
export type IssueCategory = 'bug' | 'security' | 'performance' | 'dead-code' | 'code-smell' | 'duplicate' | 'error-handling' | 'style';

export interface CodeReviewIssue {
  id: string;
  filePath: string;
  line: number;
  endLine?: number;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  description: string;
  suggestedFix?: string;
  codeSnippet?: string;
}

export interface CodeReviewResult {
  repoId: string;
  scope: 'file' | 'directory' | 'repo';
  scopePath?: string;
  issues: CodeReviewIssue[];
  summary: string;
  generatedAt: string;
}

// ── Task Plan Types ──────────────────────────────────────────────────────────

export interface TaskStep {
  stepNumber: number;
  description: string;
  filePath?: string;
  changeType: 'create' | 'modify' | 'delete' | 'refactor';
}

export interface TaskPlan {
  id: string;
  repoId: string;
  request: string;
  understanding: string;
  filesToModify: string[];
  filesToCreate: string[];
  steps: TaskStep[];
  estimatedComplexity: number;  // 1-10
  riskAssessment: string;
  generatedAt: string;
}

// ── Diff Types ───────────────────────────────────────────────────────────────

export interface DiffChange {
  filePath: string;
  changeType: 'create' | 'modify' | 'delete';
  oldContent?: string;
  newContent: string;
  description: string;
}

// ── Health Score Types ───────────────────────────────────────────────────────

export interface LanguageStat {
  language: string;
  fileCount: number;
  linesOfCode: number;
  percentage: number;   // 0-100
}

export interface TodoItem {
  filePath: string;
  line: number;
  type: 'TODO' | 'FIXME' | 'HACK' | 'XXX' | 'BUG';
  text: string;
}

export interface DeadCodeCandidate {
  filePath: string;
  symbolName: string;
  symbolType: string;
  line: number;
  reason: string;
}

export interface DuplicateCandidate {
  filePathA: string;
  filePathB: string;
  symbolNameA: string;
  symbolNameB: string;
  lineA: number;
  lineB: number;
  similarity: number;   // 0-1
}

export interface HealthScore {
  repoId: string;
  overall: number;         // 0-100
  security: number;        // 0-100
  maintainability: number; // 0-100
  testCoverage: number;    // 0-100
  documentation: number;   // 0-100
  technicalDebt: number;   // 0-100 (higher = less debt)
  largestFiles: { path: string; lines: number }[];
  mostComplexFiles: { path: string; complexity: number }[];
  languageStats: LanguageStat[];
  todoItems: TodoItem[];
  deadCodeCandidates: DeadCodeCandidate[];
  duplicateCandidates: DuplicateCandidate[];
  generatedAt: string;
}

// ── Activity Types ───────────────────────────────────────────────────────────

export interface AIActivity {
  id: string;
  repoId: string;
  type: 'index' | 'search' | 'chat' | 'review' | 'plan' | 'generate' | 'docs' | 'tests';
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
