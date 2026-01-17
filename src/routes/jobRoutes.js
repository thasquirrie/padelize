import express from 'express';
import { getJobStatus } from '../controllers/jobController.js';
import { authenticateApiKey } from '../middleware/apiKeyAuth.js';

const router = express.Router();

/**
 * @route   GET /api/v1/jobs/:jobId
 * @desc    Get job status for streaming video download
 * @access  Public with API key authentication
 *
 * Headers:
 *   X-API-Key: <api-key>
 *
 * Response:
 * {
 *   jobId: string,
 *   status: "pending" | "completed" | "failed",
 *   link: string,              // Original video link
 *   linkType: string,          // Type of link (iCloud, Google Photos, etc.)
 *   s3Url: string,             // S3 URL when completed
 *   error: string,             // Error message when failed
 *   createdAt: Date,
 *   updatedAt: Date,
 *   completedAt: Date
 * }
 */
router.get('/:jobId', authenticateApiKey, getJobStatus);

export default router;
