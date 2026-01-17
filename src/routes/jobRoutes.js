import express from 'express';
import { getJobStatus } from '../controllers/jobController.js';
import { protect } from '../controllers/authController.js';

const router = express.Router();

/**
 * @route   GET /api/v1/jobs/:jobId
 * @desc    Get job status for streaming video download
 * @access  Protected (JWT required)
 *
 * Headers:
 *   Authorization: Bearer <jwt-token>
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
router.get('/:jobId', protect, getJobStatus);

export default router;
