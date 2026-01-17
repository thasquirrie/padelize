import express from 'express';
import { handleStreamingWebhook } from '../controllers/streamingWebhookController.js';

const router = express.Router();

/**
 * @route   POST /api/v1/webhooks/streaming
 * @desc    Receive webhook from streaming.padelize.ai when video download completes
 * @access  Public (webhook endpoint - secured by job ID verification)
 *
 * Expected body:
 * {
 *   jobId: string,
 *   status: "completed" | "failed",
 *   s3Url?: string,  // only when completed
 *   error?: string   // only when failed
 * }
 */
router.post('/streaming', handleStreamingWebhook);

export default router;
