import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { logger } from '../utils/logger';
import { METADATA_DATA_DIR } from '../config/storage';
import { RepoService } from './repoService';
import { FileAnalysisService } from './fileAnalysisService';
import type {
  ProjectOverview, LayerInfo, FolderSummary, DependencyEdge,
  FrameworkInfo, DependencyGraph, GraphNode, GraphEdge, ClusterInfo
} from '../models/fileAnalysis';
import type { FileNode } from '../models/types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Cluster colors for dependency graph visualization
const CLUSTER_COLORS = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7', '#0ea5e9', '#22c55e', '#eab308',
];

export class ProjectOverviewService {
  private repoService: RepoService;
  private fileAnalysisService: FileAnalysisService;

  constructor() {
    this.repoService = new RepoService();
    this.fileAnalysisService = new FileAnalysisService();
  }

  private getOverviewPath(repoId: string): string {
    return path.join(METADATA_DATA_DIR, `${repoId}.overview.json`);
  }

  /**
   * Get cached project overview or null.
   */
  public async getOverview(repoId: string): Promise<ProjectOverview | null> {
    try {
      const p = this.getOverviewPath(repoId);
      const content = await fs.readFile(p, 'utf-8');
      return JSON.parse(content) as ProjectOverview;
    } catch {
      return null;
    }
  }

  /**
   * Generate a comprehensive project overview based on file tree and individual file analyses.
   */
  public async generateOverview(repoId: string): Promise<ProjectOverview | null> {
    const repo = await this.repoService.getRepoById(repoId);
    if (!repo) return null;

    try {
      const tree = await this.repoService.getFileTree(repoId);
      const flatFiles = this.flattenTree(tree);
      
      // We need at least some files to analyze
      if (flatFiles.length === 0) return null;

      // Generate folder summaries
      const folderSummaries = this.generateFolderSummaries(tree);
      
      // Load all available file analyses for dependency tracking and entry points
      const fileAnalyses = [];
      const dependencyEdges: DependencyEdge[] = [];
      const entryPoints: string[] = [];

      for (const file of flatFiles) {
        const analysis = await this.fileAnalysisService.getAnalysis(repoId, file.path);
        if (analysis) {
          fileAnalyses.push(analysis);
          
          // Build dependency edges from imports
          for (const imp of analysis.imports) {
             // Basic resolution - if it starts with '.' it's likely internal
             if (imp.source.startsWith('.')) {
               // A simplified heuristic for resolving internal dependencies
               const dir = path.dirname(file.path);
               const resolved = path.join(dir, imp.source).replace(/\\/g, '/');
               dependencyEdges.push({
                 from: file.path,
                 to: resolved, // Note: might not have extension, frontend handles this
                 type: 'import'
               });
             } else {
               // External dependency
               dependencyEdges.push({
                 from: file.path,
                 to: imp.source,
                 type: 'require' // Distinguish external packages
               });
             }
          }
          
          // Heuristic for entry points
          if (
            file.path.endsWith('index.ts') || 
            file.path.endsWith('index.js') || 
            file.path.endsWith('main.go') || 
            file.path.endsWith('main.rs') || 
            file.path.endsWith('main.py') || 
            file.path.endsWith('app.ts') || 
            file.path.endsWith('server.ts') ||
            file.path.includes('pages/') ||
            file.path.includes('app/page.')
          ) {
            entryPoints.push(file.path);
          }
        }
      }

      // Detect Architectural Layers
      const layers = this.detectLayers(flatFiles);

      // Detect Frameworks & Technologies
      const frameworks = await this.detectFrameworks(repo.localPath);

      // Detect Deployment Configurations
      const deploymentConfigs = await this.detectDeploymentConfigs(repo.localPath, flatFiles);

      // Build Dependency Graph for visualization
      const dependencyGraph = this.buildDependencyGraph(flatFiles, dependencyEdges);

      // AI Architecture Summary
      let architectureSummary = "A standard software repository.";
      let communicationPatterns: string[] = [];
      
      if (process.env.GEMINI_API_KEY) {
        try {
          const aiResult = await this.generateAIArchitectureSummary(
            repo.fullName, 
            folderSummaries, 
            layers, 
            entryPoints,
            frameworks
          );
          architectureSummary = aiResult.summary;
          communicationPatterns = aiResult.communicationPatterns;
        } catch (e) {
          logger.warn(`AI architecture summary failed for ${repoId}:`, e);
        }
      }

      const overview: ProjectOverview = {
        repoId,
        architectureSummary,
        layers,
        folderSummaries,
        dependencyEdges,
        communicationPatterns,
        entryPoints,
        frameworks,
        deploymentConfigs,
        dependencyGraph,
        generatedAt: new Date().toISOString()
      };

      // Save to disk
      await fs.writeFile(this.getOverviewPath(repoId), JSON.stringify(overview, null, 2), 'utf-8');
      logger.info(`Generated project overview for ${repoId}`);
      
      return overview;
    } catch (e) {
      logger.error(`Failed to generate project overview for ${repoId}:`, e);
      return null;
    }
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

  private generateFolderSummaries(tree: FileNode[]): FolderSummary[] {
    const summaries: FolderSummary[] = [];

    const analyzeFolder = (node: FileNode, currentPath: string) => {
      if (node.type !== 'directory' || !node.children) return;

      const folderPath = currentPath ? `${currentPath}/${node.name}` : node.name;
      const files = this.flattenTree(node.children);
      
      if (files.length > 0) {
        // Find primary language
        const langCounts: Record<string, number> = {};
        for (const f of files) {
          if (f.language) {
            langCounts[f.language] = (langCounts[f.language] || 0) + 1;
          }
        }
        const primaryLanguage = Object.entries(langCounts)
          .sort(([,a], [,b]) => b - a)[0]?.[0] || 'Unknown';

        // Basic purpose heuristic based on folder name
        let purpose = 'General files';
        const name = node.name.toLowerCase();
        if (name === 'src' || name === 'lib') purpose = 'Source code';
        else if (name === 'components' || name === 'views') purpose = 'UI Components';
        else if (name === 'api' || name === 'routes' || name === 'controllers') purpose = 'API / Routing';
        else if (name === 'models' || name === 'types') purpose = 'Data models and types';
        else if (name === 'utils' || name === 'helpers') purpose = 'Utility functions';
        else if (name === 'tests' || name === 'spec') purpose = 'Testing';
        else if (name === 'public' || name === 'assets') purpose = 'Static assets';
        else if (name === 'config') purpose = 'Configuration files';
        else if (name === 'middleware') purpose = 'Middleware layer';
        else if (name === 'hooks') purpose = 'React hooks';
        else if (name === 'services') purpose = 'Business logic services';
        else if (name === 'repositories') purpose = 'Data access layer';

        summaries.push({
          path: folderPath,
          fileCount: files.length,
          primaryLanguage,
          purpose
        });
      }

      // Recurse for top level folders
      if (!currentPath) {
        for (const child of node.children) {
          analyzeFolder(child, folderPath);
        }
      }
    };

    for (const node of tree) {
      analyzeFolder(node, '');
    }

    return summaries;
  }

  private detectLayers(files: FileNode[]): LayerInfo[] {
    const layers: LayerInfo[] = [];
    
    // Heuristics for different layers
    const frontendFiles = files.filter(f => 
      f.path.includes('frontend/') || 
      f.path.includes('client/') || 
      f.path.includes('components/') ||
      f.path.includes('pages/') ||
      f.path.includes('app/') ||
      f.path.endsWith('.tsx') || 
      f.path.endsWith('.jsx') ||
      f.path.endsWith('.vue') ||
      f.path.endsWith('.svelte') ||
      f.path.endsWith('.html') ||
      f.path.endsWith('.css')
    );

    const backendFiles = files.filter(f => 
      f.path.includes('backend/') || 
      f.path.includes('server/') || 
      f.path.includes('api/') ||
      f.path.includes('controllers/') ||
      f.path.includes('routes/') ||
      f.path.includes('services/') ||
      (f.path.endsWith('.go') && !f.path.includes('frontend/')) ||
      (f.path.endsWith('.rs') && !f.path.includes('frontend/')) ||
      (f.path.endsWith('.py') && !f.path.includes('frontend/')) ||
      (f.path.endsWith('.java') && !f.path.includes('frontend/'))
    );

    const databaseFiles = files.filter(f => 
      f.path.includes('db/') || 
      f.path.includes('database/') || 
      f.path.includes('models/') ||
      f.path.includes('schemas/') ||
      f.path.includes('migrations/') ||
      f.path.includes('prisma/') ||
      f.path.endsWith('.sql')
    );

    if (frontendFiles.length > 0) {
      layers.push({
        name: 'Frontend',
        description: 'User interface and client-side logic',
        files: frontendFiles.slice(0, 10).map(f => f.path), // Top 10 for overview
        technologies: Array.from(new Set(frontendFiles.map(f => f.language).filter(Boolean) as string[]))
      });
    }

    if (backendFiles.length > 0) {
      layers.push({
        name: 'Backend',
        description: 'Server-side logic and API endpoints',
        files: backendFiles.slice(0, 10).map(f => f.path),
        technologies: Array.from(new Set(backendFiles.map(f => f.language).filter(Boolean) as string[]))
      });
    }

    if (databaseFiles.length > 0) {
      layers.push({
        name: 'Database / Data Layer',
        description: 'Data models, schemas, and database interaction',
        files: databaseFiles.slice(0, 10).map(f => f.path),
        technologies: Array.from(new Set(databaseFiles.map(f => f.language).filter(Boolean) as string[]))
      });
    }

    return layers;
  }

  /**
   * Detect frameworks and technologies from manifest files.
   */
  private async detectFrameworks(repoLocalPath: string): Promise<FrameworkInfo[]> {
    const frameworks: FrameworkInfo[] = [];
    const seen = new Set<string>();

    const addFramework = (name: string, version: string | undefined, category: FrameworkInfo['category']) => {
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        frameworks.push({ name, version, category });
      }
    };

    // ── package.json (Node.js ecosystem) ──
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(repoLocalPath, 'package.json'), 'utf-8'));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      // Frontend frameworks
      const frontendMap: Record<string, string> = {
        'next': 'Next.js', 'react': 'React', 'vue': 'Vue.js', 'svelte': 'Svelte',
        '@angular/core': 'Angular', 'solid-js': 'SolidJS', 'preact': 'Preact',
        'nuxt': 'Nuxt.js', 'gatsby': 'Gatsby', 'remix': 'Remix', 'astro': 'Astro',
      };
      for (const [dep, name] of Object.entries(frontendMap)) {
        if (allDeps[dep]) addFramework(name, allDeps[dep]?.replace(/[\^~]/, ''), 'frontend');
      }

      // Backend frameworks
      const backendMap: Record<string, string> = {
        'express': 'Express', 'fastify': 'Fastify', 'koa': 'Koa', 'hapi': 'Hapi',
        'nestjs': 'NestJS', '@nestjs/core': 'NestJS', 'hono': 'Hono',
        'socket.io': 'Socket.IO',
      };
      for (const [dep, name] of Object.entries(backendMap)) {
        if (allDeps[dep]) addFramework(name, allDeps[dep]?.replace(/[\^~]/, ''), 'backend');
      }

      // Database clients
      const dbMap: Record<string, string> = {
        'prisma': 'Prisma', '@prisma/client': 'Prisma', 'mongoose': 'Mongoose',
        'sequelize': 'Sequelize', 'typeorm': 'TypeORM', 'knex': 'Knex',
        'pg': 'PostgreSQL', 'mysql2': 'MySQL', 'redis': 'Redis', 'ioredis': 'Redis',
        'mongodb': 'MongoDB', 'better-sqlite3': 'SQLite',
      };
      for (const [dep, name] of Object.entries(dbMap)) {
        if (allDeps[dep]) addFramework(name, allDeps[dep]?.replace(/[\^~]/, ''), 'database');
      }

      // Testing
      const testMap: Record<string, string> = {
        'jest': 'Jest', 'vitest': 'Vitest', 'mocha': 'Mocha', 'cypress': 'Cypress',
        'playwright': 'Playwright', '@playwright/test': 'Playwright',
        '@testing-library/react': 'Testing Library',
      };
      for (const [dep, name] of Object.entries(testMap)) {
        if (allDeps[dep]) addFramework(name, allDeps[dep]?.replace(/[\^~]/, ''), 'testing');
      }

      // Utilities
      const utilMap: Record<string, string> = {
        'tailwindcss': 'Tailwind CSS', 'typescript': 'TypeScript', 'webpack': 'Webpack',
        'vite': 'Vite', 'esbuild': 'esbuild', 'rollup': 'Rollup',
        'graphql': 'GraphQL', 'trpc': 'tRPC', '@trpc/server': 'tRPC',
      };
      for (const [dep, name] of Object.entries(utilMap)) {
        if (allDeps[dep]) addFramework(name, allDeps[dep]?.replace(/[\^~]/, ''), 'utility');
      }

      // Package manager detection
      if (pkg.packageManager?.startsWith('pnpm')) addFramework('pnpm', undefined, 'utility');
      else if (pkg.packageManager?.startsWith('yarn')) addFramework('Yarn', undefined, 'utility');
      else addFramework('npm', undefined, 'utility');
    } catch {
      // No package.json
    }

    // ── requirements.txt (Python) ──
    try {
      const req = await fs.readFile(path.join(repoLocalPath, 'requirements.txt'), 'utf-8');
      const pyMap: Record<string, [string, FrameworkInfo['category']]> = {
        'django': ['Django', 'backend'], 'flask': ['Flask', 'backend'],
        'fastapi': ['FastAPI', 'backend'], 'sqlalchemy': ['SQLAlchemy', 'database'],
        'pytest': ['pytest', 'testing'], 'celery': ['Celery', 'backend'],
        'pandas': ['Pandas', 'utility'], 'numpy': ['NumPy', 'utility'],
        'tensorflow': ['TensorFlow', 'utility'], 'torch': ['PyTorch', 'utility'],
      };
      for (const line of req.split('\n')) {
        const match = line.match(/^([a-zA-Z0-9_-]+)\s*([=<>!~]+\s*[\d.]+)?/);
        if (match) {
          const pkg = match[1].toLowerCase();
          const mapping = pyMap[pkg];
          if (mapping) addFramework(mapping[0], match[2]?.replace(/[=<>!~\s]+/, ''), mapping[1]);
        }
      }
      addFramework('Python', undefined, 'utility');
    } catch {
      // No requirements.txt
    }

    // ── go.mod (Go) ──
    try {
      const goMod = await fs.readFile(path.join(repoLocalPath, 'go.mod'), 'utf-8');
      addFramework('Go', undefined, 'backend');
      if (goMod.includes('github.com/gin-gonic/gin')) addFramework('Gin', undefined, 'backend');
      if (goMod.includes('github.com/gorilla/mux')) addFramework('Gorilla Mux', undefined, 'backend');
      if (goMod.includes('github.com/gofiber/fiber')) addFramework('Fiber', undefined, 'backend');
      if (goMod.includes('gorm.io/gorm')) addFramework('GORM', undefined, 'database');
    } catch {
      // No go.mod
    }

    // ── Cargo.toml (Rust) ──
    try {
      const cargo = await fs.readFile(path.join(repoLocalPath, 'Cargo.toml'), 'utf-8');
      addFramework('Rust', undefined, 'backend');
      if (cargo.includes('actix-web')) addFramework('Actix Web', undefined, 'backend');
      if (cargo.includes('rocket')) addFramework('Rocket', undefined, 'backend');
      if (cargo.includes('tokio')) addFramework('Tokio', undefined, 'utility');
    } catch {
      // No Cargo.toml
    }

    return frameworks;
  }

  /**
   * Detect deployment and CI/CD configurations.
   */
  private async detectDeploymentConfigs(repoLocalPath: string, flatFiles: FileNode[]): Promise<string[]> {
    const configs: string[] = [];

    const checkFile = async (relativePath: string, label: string) => {
      try {
        await fs.access(path.join(repoLocalPath, relativePath));
        configs.push(label);
      } catch {
        // not found
      }
    };

    await checkFile('Dockerfile', 'Docker');
    await checkFile('docker-compose.yml', 'Docker Compose');
    await checkFile('docker-compose.yaml', 'Docker Compose');
    await checkFile('.github/workflows', 'GitHub Actions');
    await checkFile('.gitlab-ci.yml', 'GitLab CI');
    await checkFile('Jenkinsfile', 'Jenkins');
    await checkFile('vercel.json', 'Vercel');
    await checkFile('netlify.toml', 'Netlify');
    await checkFile('fly.toml', 'Fly.io');
    await checkFile('render.yaml', 'Render');
    await checkFile('railway.json', 'Railway');
    await checkFile('heroku.yml', 'Heroku');
    await checkFile('Procfile', 'Heroku (Procfile)');
    await checkFile('k8s', 'Kubernetes');
    await checkFile('kubernetes', 'Kubernetes');
    await checkFile('terraform', 'Terraform');
    await checkFile('.circleci', 'CircleCI');
    await checkFile('serverless.yml', 'Serverless Framework');
    await checkFile('amplify.yml', 'AWS Amplify');
    await checkFile('appspec.yml', 'AWS CodeDeploy');
    await checkFile('nginx.conf', 'Nginx');
    await checkFile('.env.example', 'Environment Variables (.env)');

    return configs;
  }

  /**
   * Build a dependency graph structure for frontend visualization.
   * Only includes internal file-to-file edges (filters out external packages).
   */
  private buildDependencyGraph(flatFiles: FileNode[], edges: DependencyEdge[]): DependencyGraph {
    // Build set of known file paths for resolving
    const knownPaths = new Set(flatFiles.map(f => f.path));

    // Resolve edge targets to actual files — try adding common extensions
    const resolveTarget = (target: string): string | null => {
      if (knownPaths.has(target)) return target;
      const exts = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js', '/index.tsx'];
      for (const ext of exts) {
        if (knownPaths.has(target + ext)) return target + ext;
      }
      return null;
    };

    // Filter to only internal edges with resolvable targets
    const internalEdges: GraphEdge[] = [];
    const connectedFiles = new Set<string>();

    for (const edge of edges) {
      if (edge.type === 'require' && !edge.to.startsWith('.')) continue; // external package
      const resolved = resolveTarget(edge.to);
      if (resolved && knownPaths.has(edge.from)) {
        internalEdges.push({
          source: edge.from,
          target: resolved,
          type: edge.type,
        });
        connectedFiles.add(edge.from);
        connectedFiles.add(resolved);
      }
    }

    // Build clusters by top-level directory
    const dirCounts: Record<string, number> = {};
    for (const filePath of connectedFiles) {
      const parts = filePath.split('/');
      const topDir = parts.length > 1 ? parts[0] : '(root)';
      dirCounts[topDir] = (dirCounts[topDir] || 0) + 1;
    }

    const clusterNames = Object.keys(dirCounts).sort((a, b) => dirCounts[b] - dirCounts[a]);
    const clusters: ClusterInfo[] = clusterNames.map((name, i) => ({
      name,
      color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
      fileCount: dirCounts[name],
    }));

    const clusterColorMap: Record<string, string> = {};
    for (const c of clusters) {
      clusterColorMap[c.name] = c.color;
    }

    // Count incoming edges per node for sizing
    const incomingCounts: Record<string, number> = {};
    for (const e of internalEdges) {
      incomingCounts[e.target] = (incomingCounts[e.target] || 0) + 1;
    }

    // Build nodes — only files that participate in at least one edge
    const nodes: GraphNode[] = [];
    for (const filePath of connectedFiles) {
      const parts = filePath.split('/');
      const topDir = parts.length > 1 ? parts[0] : '(root)';
      const label = parts[parts.length - 1]; // basename
      nodes.push({
        id: filePath,
        label,
        group: topDir,
        size: Math.min(10, 2 + (incomingCounts[filePath] || 0)),
      });
    }

    // Limit graph to a reasonable size for rendering
    const MAX_NODES = 100;
    if (nodes.length > MAX_NODES) {
      // Keep the most-connected nodes
      nodes.sort((a, b) => b.size - a.size);
      const kept = new Set(nodes.slice(0, MAX_NODES).map(n => n.id));
      const filteredNodes = nodes.filter(n => kept.has(n.id));
      const filteredEdges = internalEdges.filter(e => kept.has(e.source) && kept.has(e.target));
      return { nodes: filteredNodes, edges: filteredEdges, clusters };
    }

    return { nodes, edges: internalEdges, clusters };
  }

  private async generateAIArchitectureSummary(
    repoName: string, 
    folderSummaries: FolderSummary[], 
    layers: LayerInfo[], 
    entryPoints: string[],
    frameworks: FrameworkInfo[]
  ): Promise<{ summary: string; communicationPatterns: string[] }> {
    const prompt = `Analyze the architecture of the repository "${repoName}" based on its structure.

Folders:
${folderSummaries.map(s => `- ${s.path}: ${s.purpose} (${s.fileCount} ${s.primaryLanguage} files)`).join('\n')}

Detected Layers:
${layers.map(l => `- ${l.name}: ${l.description}`).join('\n')}

Detected Frameworks:
${frameworks.map(f => `- ${f.name} ${f.version || ''} (${f.category})`).join('\n')}

Entry Points:
${entryPoints.slice(0, 5).map(e => `- ${e}`).join('\n')}

Provide a JSON response ONLY:
{
  "summary": "A 2-3 paragraph high-level technical summary of the project architecture, design patterns, and organization.",
  "communicationPatterns": ["Pattern 1 (e.g. REST API between frontend/backend)", "Pattern 2 (e.g. Server-side rendering)", "etc..."]
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '{}';
    const jsonStr = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    return JSON.parse(jsonStr);
  }
}
