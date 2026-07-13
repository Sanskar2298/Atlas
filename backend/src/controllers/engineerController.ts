import { Request, Response } from 'express';
import { TaskPlannerService } from '../services/taskPlannerService';
import { CodeGenerationService } from '../services/codeGenerationService';
import { CodeReviewService } from '../services/codeReviewService';
import { DocGenerationService } from '../services/docGenerationService';
import { TestGenerationService } from '../services/testGenerationService';
import { HealthScoreService } from '../services/healthScoreService';
import { logger } from '../utils/logger';

const plannerService = new TaskPlannerService();
const codeGenService = new CodeGenerationService();
const reviewService = new CodeReviewService();
const docService = new DocGenerationService();
const testService = new TestGenerationService();
const healthScoreService = new HealthScoreService();

// POST /api/repos/:id/plan
export const generatePlan = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { request } = req.body;

  if (!request) {
    return res.status(400).json({ success: false, error: 'request is required' });
  }

  try {
    const plan = await plannerService.generatePlan(id, request);
    res.json({ success: true, data: plan });
  } catch (err: any) {
    logger.error('Generate plan error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/repos/:id/generate
export const generateCode = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { planId, steps } = req.body;

  if (!steps || !Array.isArray(steps)) {
    return res.status(400).json({ success: false, error: 'steps array is required' });
  }

  try {
    const changes = await codeGenService.generateCodeChanges(id, planId, steps);
    res.json({ success: true, data: changes });
  } catch (err: any) {
    logger.error('Generate code error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/repos/:id/review
export const reviewCode = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({ success: false, error: 'filePath is required' });
  }

  try {
    const review = await reviewService.reviewFile(id, filePath);
    res.json({ success: true, data: review });
  } catch (err: any) {
    logger.error('Code review error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/repos/:id/generate-docs
export const generateDocs = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { filePath, docType } = req.body;

  if (!filePath || !docType) {
    return res.status(400).json({ success: false, error: 'filePath and docType are required' });
  }

  try {
    const docs = await docService.generateDocs(id, filePath, docType);
    res.json({ success: true, data: docs });
  } catch (err: any) {
    logger.error('Generate docs error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/repos/:id/generate-tests
export const generateTests = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { filePath, framework } = req.body;

  if (!filePath) {
    return res.status(400).json({ success: false, error: 'filePath is required' });
  }

  try {
    const tests = await testService.generateTests(id, filePath, framework);
    res.json({ success: true, data: tests });
  } catch (err: any) {
    logger.error('Generate tests error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/repos/:id/health-score
export const getHealthScore = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const score = await healthScoreService.getHealthScore(id);
    if (!score) {
      return res.status(404).json({ success: false, error: 'Health score not found' });
    }
    res.json({ success: true, data: score });
  } catch (err: any) {
    logger.error('Get health score error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
