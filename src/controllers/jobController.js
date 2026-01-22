import Match from '../models/Match.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/appError.js';

/**
 * Get job status by jobId
 * GET /api/v1/jobs/:jobId
 *
 * Returns job status for streaming video download jobs
 */
export const getJobStatus = catchAsync(async (req, res, next) => {
  const { jobId } = req.params;

  global.createLogger.info('Job status requested', { jobId });

  // Find match by streamingJobId
  const match = await Match.findOne({ streamingJobId: jobId }).select(
    'streamingJobId streamingStatus streamingError streamingStartedAt streamingCompletedAt video videoLink createdAt updatedAt'
  );

  if (!match) {
    global.createLogger.warn('Job not found', { jobId });
    return next(new AppError('Job not found', 404));
  }

  // Map match streaming status to job status format
  const statusMap = {
    not_started: 'pending',
    pending: 'pending',
    completed: 'completed',
    failed: 'failed',
  };

  const jobStatus = statusMap[match.streamingStatus] || 'pending';

  // Build response
  const response = {
    jobId: match.streamingJobId,
    status: jobStatus,
    link: match.videoLink || null,
    linkType: match.videoLink ? detectLinkType(match.videoLink) : null,
    s3Url: match.video || null,
    error: match.streamingError || null,
    createdAt: match.streamingStartedAt || match.createdAt,
    updatedAt: match.updatedAt,
    completedAt: match.streamingCompletedAt || null,
  };

  global.createLogger.info('Job status retrieved', { jobId, status: jobStatus });

  res.status(200).json(response);
});

/**
 * Detect the type of video link (iCloud, Google Photos, etc.)
 */
function detectLinkType(link) {
  if (!link) return null;

  const lowerLink = link.toLowerCase();

  if (lowerLink.includes('icloud.com')) return 'iCloud';
  if (lowerLink.includes('google.com') || lowerLink.includes('photos.app.goo.gl'))
    return 'Google Photos';
  if (lowerLink.includes('dropbox.com')) return 'Dropbox';
  if (lowerLink.includes('drive.google.com')) return 'Google Drive';
  if (lowerLink.includes('onedrive')) return 'OneDrive';

  return 'Other';
}
