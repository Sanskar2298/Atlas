import path from 'path';

/**
 * Map of file extensions to language display names.
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JavaScript / TypeScript
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.mts': 'TypeScript',

  // Python
  '.py': 'Python',
  '.pyw': 'Python',
  '.pyi': 'Python',

  // Java
  '.java': 'Java',

  // C / C++
  '.c': 'C',
  '.h': 'C',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.cxx': 'C++',
  '.hpp': 'C++',

  // Go
  '.go': 'Go',

  // Rust
  '.rs': 'Rust',

  // Web
  '.html': 'HTML',
  '.htm': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'SCSS',
  '.less': 'Less',

  // Data / Config
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
  '.xml': 'XML',
  '.env': 'Environment',

  // Markup / Docs
  '.md': 'Markdown',
  '.mdx': 'Markdown',
  '.txt': 'Text',
  '.rst': 'reStructuredText',

  // Shell
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.fish': 'Shell',
  '.ps1': 'PowerShell',

  // Ruby
  '.rb': 'Ruby',
  '.rake': 'Ruby',

  // PHP
  '.php': 'PHP',

  // Swift
  '.swift': 'Swift',

  // Kotlin
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',

  // SQL
  '.sql': 'SQL',

  // GraphQL
  '.graphql': 'GraphQL',
  '.gql': 'GraphQL',

  // Dockerfile
  Dockerfile: 'Dockerfile',
  '.dockerfile': 'Dockerfile',
};

/**
 * Detect programming language from file path.
 */
export function detectLanguage(filePath: string): string {
  const basename = path.basename(filePath);

  // Check exact filename (e.g., Dockerfile)
  if (EXTENSION_TO_LANGUAGE[basename]) {
    return EXTENSION_TO_LANGUAGE[basename];
  }

  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] || 'Plain Text';
}

/**
 * Map language name to Monaco Editor language id.
 */
export function languageToMonacoId(language: string): string {
  const map: Record<string, string> = {
    JavaScript: 'javascript',
    TypeScript: 'typescript',
    Python: 'python',
    Java: 'java',
    'C': 'c',
    'C++': 'cpp',
    Go: 'go',
    Rust: 'rust',
    HTML: 'html',
    CSS: 'css',
    SCSS: 'scss',
    Less: 'less',
    JSON: 'json',
    YAML: 'yaml',
    TOML: 'toml',
    XML: 'xml',
    Markdown: 'markdown',
    Shell: 'shell',
    PowerShell: 'powershell',
    Ruby: 'ruby',
    PHP: 'php',
    Swift: 'swift',
    Kotlin: 'kotlin',
    SQL: 'sql',
    GraphQL: 'graphql',
    Dockerfile: 'dockerfile',
  };
  return map[language] || 'plaintext';
}
