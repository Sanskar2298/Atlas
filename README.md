# Atlas — Understand. Build. Refactor.

Atlas is a premium AI software engineering workspace that understands entire GitHub repositories. It helps developers explore codebases, understand architecture, search code semantically, and build faster with AI.

This repository contains **Phase 1** and **Phase 2** of the platform:
- **Phase 1 (Frontend)**: Next.js 15 application with a premium dark-mode UI, Dashboard, and Workspace interface (Monaco editor, file tree, chat UI placeholders).
- **Phase 2 (Backend)**: Node.js Express API that handles cloning GitHub repositories locally, extracting metadata, and serving nested file trees and contents.

---

## Architecture

This project is structured as a monorepo containing two separate applications:

- `/frontend`: Next.js 15, React, TypeScript, Tailwind CSS, Framer Motion, Monaco Editor.
- `/backend`: Node.js, Express, TypeScript, `simple-git`, file-system persistence.

---

## Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- npm (or yarn/pnpm)
- Git installed on your system (required for the backend to clone repositories)

### 1. Setup Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables (optional, defaults are provided):
   ```bash
   cp .env.example .env
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
   *The backend will run on `http://localhost:5001`.*

### 2. Setup Frontend

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   *The frontend will run on `http://localhost:3000`.*

---

## Using the Application

1. Open your browser and navigate to **`http://localhost:3000`**.
2. Click **Get Started** or **Sign In** (Authentication is simulated in this phase; any credentials will work, or use the "Demo Login" button).
3. From the Dashboard, click **Connect Repository**.
4. Enter a public GitHub repository URL (e.g., `https://github.com/facebook/react`).
5. Wait for the backend to clone and index the repository.
6. Once complete, you will be redirected to the Workspace where you can explore the file tree, view code in the Monaco Editor, and see the simulated activity timeline.

---

## Design Philosophy

The UI is built with a focus on premium aesthetics:
- **Dark-first:** `bg-base` (#09090b) and `bg-surface` (#0f0f12).
- **Glassmorphism:** Subtle borders (`rgba(255,255,255,0.08)`) and blurs.
- **Micro-animations:** Powered by Framer Motion for page transitions, modal scaling, and list staggering.
- **Typography:** Clean, sans-serif (Inter) combined with monospace (JetBrains Mono) for code elements.

---

## Next Steps (Phase 3+)

The following features are stubbed out and ready for Phase 3 implementation:
- **AI Chat & Embeddings:** Connecting the Atlas Chat sidebar to an LLM provider and vector database.
- **Semantic Search:** Indexing cloned codebases for intent-based search.
- **File Editing:** Enabling write permissions in the Monaco editor and creating diffs.
- **GitHub Integration:** Authentic OAuth login and programmatic Pull Request creation.
