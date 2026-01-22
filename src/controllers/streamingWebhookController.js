import Match from '../models/Match.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/appError.js';
import matchNotificationService from '../services/matchNotificationService.js';
import { VideoAnalysisService } from '../services/analysisService.js';

/**
 * Handle webhook from streaming.padelize.ai when video download completes
 * POST /api/v1/webhooks/streaming
 *
 * Webhook Payload (from streaming.padelize.ai):
 * {
 *   jobId: string,              // Job identifier
 *   status: "completed" | "failed",
 *   s3Url?: string,             // S3 URL (only when status is "completed")
 *   error?: string              // Error message (only when status is "failed")
 * }
 */
export const handleStreamingWebhook = catchAsync(async (req, res, next) => {
  const { jobId, status, s3Url, error } = req.body;

  global.createLogger.info('Streaming webhook received', {
    jobId,
    status,
    hasS3Url: !!s3Url,
    error,
  });

  // Validate webhook payload
  if (!jobId || !status) {
    return next(
      new AppError('Invalid webhook payload: missing jobId or status', 400)
    );
  }

  if (!['completed', 'failed'].includes(status)) {
    return next(new AppError(`Invalid status: ${status}`, 400));
  }

  // Find the match by streamingJobId
  const match = await Match.findOne({ streamingJobId: jobId });
  if (!match) {
    global.createLogger.error('Match not found for streaming webhook', { jobId });
    return next(new AppError('Match not found for this job ID', 404));
  }

  // Handle completed download
  if (status === 'completed') {
    if (!s3Url) {
      global.createLogger.error('Completed webhook missing s3Url', { matchId, jobId });
      return next(new AppError('Missing s3Url in completed webhook', 400));
    }

    global.createLogger.info('Video download completed, updating match', {
      matchId: match._id,
      jobId,
      s3Url,
    });

    // Update match with video URL and status
    match.video = s3Url;
    match.streamingStatus = 'completed';
    match.streamingCompletedAt = new Date();
    await match.save();

    // Send notification
    await matchNotificationService.notifyMatchVideoReady(match.creator, match);

    // Optionally, trigger player detection automatically
    try {
      global.createLogger.info('Initiating player detection after video download', {
        matchId: match._id,
        videoUrl: s3Url,
      });

      const playerDetectionResponse = await VideoAnalysisService.fetchPlayers({
        video: s3Url,
      });

      if (playerDetectionResponse.player_detection_job_id) {
        match.playerDetectionJobId =
          playerDetectionResponse.player_detection_job_id;
        match.playerDetectionStatus = 'processing';
        match.playerDetectionStartedAt = new Date();
        await match.save();

        global.createLogger.info('Player detection initiated', {
          matchId: match._id,
          playerDetectionJobId: playerDetectionResponse.player_detection_job_id,
        });

        // Notify that player detection has started
        await matchNotificationService.notifyPlayerDetectionStarted(
          match.creator,
          match
        );
      }
    } catch (error) {
      global.createLogger.error('Failed to initiate player detection', {
        matchId: match._id,
        error: error.message,
      });
      // Don't fail the webhook - video is already saved
    }

    global.createLogger.info('Streaming webhook processed successfully', {
      matchId: match._id,
      jobId,
      status: 'completed',
    });

    return res.status(200).json({
      status: 'success',
      message: 'Video download completed and processed',
      data: {
        matchId: match._id,
        videoUrl: s3Url,
      },
    });
  }

  // Handle failed download
  if (status === 'failed') {
    global.createLogger.error('Video download failed', {
      matchId: match._id,
      jobId,
      error,
    });

    match.streamingStatus = 'failed';
    match.streamingCompletedAt = new Date();
    match.streamingError = error || 'Download failed';
    await match.save();

    // Send notification about failure
    await matchNotificationService.notifyMatchVideoFailed(
      match.creator,
      match,
      error
    );

    global.createLogger.info('Streaming webhook processed (failed status)', {
      matchId: match._id,
      jobId,
      status: 'failed',
      error,
    });

    return res.status(200).json({
      status: 'success',
      message: 'Video download failure recorded',
      data: {
        matchId: match._id,
        error,
      },
    });
  }
});
