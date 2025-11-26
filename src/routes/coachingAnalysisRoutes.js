import { Router } from 'express';
import { protect } from '../controllers/authController.js';
import { getCoachingInsights } from '../controllers/coachingAnalysisController.js';

const router = Router();

// Protect all coaching analysis routes
router.use(protect);

/**
 * GET /api/v1/coaching-analysis/:analysisId
 * Generate coaching insights for a specific analysis
 * Query params:
 *   - playerId (optional): specific player to analyze, defaults to first player
 */
router.get('/:analysisId', getCoachingInsights);

export default router;
