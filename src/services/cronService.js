import nodeCron from 'node-cron';

const cron = nodeCron;
import { VideoAnalysisService } from './analysisService.js';
import Match from '../models/Match.js';
import FirebaseService from './firebaseService.js';
import AppError from '../utils/appError.js';
import AnalysisStatus from '../models/AnalysisStatus.js';
import { createOne, findOne, updateOne } from '../factory/repo.js';
import {
  processAnalysisResponse,
  transformNewAnalysisResults,
} from '../utils/analysisFormatter.js';
import ProcessingLock from '../models/ProcessingLock.js';
import matchNotificationService from './matchNotificationService.js';
import StreamingService from './streamingService.js';

class AnalysisStatusCronJob {
  constructor() {
    this.isRunning = false;
    this.PROCESSING_TIMEOUT = 48 * 60 * 60 * 1000; // 48 hours
    this.PLAYER_DETECTION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours
  }

  start() {
    console.log('Starting analysis status cron job...');

    this.cronJob = cron.schedule(
      '*/30 * * * * *',
      async () => {
        if (this.isRunning) {
          console.log('Previous cron job still running, skipping...');
          return;
        }

        this.isRunning = true;
        console.log('Running status check:', new Date().toISOString());

        try {
          await Promise.all([
            this.checkPendingDownloads(),
            this.checkPendingPlayerDetections(),
            this.checkPendingAnalyses(),
          ]);
        } catch (error) {
          console.error('Error in cron job:', error);
        } finally {
          this.isRunning = false;
        }
      },
      {
        scheduled: true,
        timezone: 'UTC',
      },
    );

    console.log('Status cron job started - running every 30 seconds');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('Analysis status cron job stopped');
    }
  }

  // ==========================================
  // VIDEO DOWNLOAD METHODS
  // ==========================================

  async checkPendingDownloads() {
    try {
      const pendingMatches = await Match.find({
        streamingStatus: 'pending',
        streamingJobId: { $exists: true, $ne: null },
      }).populate({ path: 'creator', select: 'fullName _id' });

      console.log(
        `Found ${pendingMatches.length} pending video downloads to check`,
      );

      const promises = pendingMatches.map((match) =>
        this.checkSingleDownload(match),
      );

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error checking pending downloads:', error);
    }
  }

  async checkSingleDownload(match) {
    const { _id: matchId, streamingJobId, creator } = match;

    try {
      console.log(`Checking download status for match ${matchId}, job ${streamingJobId}`);

      let jobStatus;
      try {
        jobStatus = await StreamingService.getJobStatus(streamingJobId);
      } catch (error) {
        // Handle 404 - job not found (expired or deleted)
        if (error.message.includes('404') || error.message.includes('not found')) {
          console.log(`⚠️  Job ${streamingJobId} not found (expired), marking as failed`);
          match.streamingStatus = 'failed';
          match.streamingCompletedAt = new Date();
          match.streamingError = 'Job expired or not found in streaming service';
          await match.save();
          return;
        }
        throw error; // Re-throw other errors
      }

      console.log(`Download job ${streamingJobId} status:`, jobStatus);

      if (jobStatus.status === 'completed') {
        if (!jobStatus.s3Url) {
          console.error(`Download completed but no s3Url for job ${streamingJobId}`);
          return;
        }

        console.log(`✅ Download completed for match ${matchId}, updating...`);

        // Update match with video URL
        match.video = jobStatus.s3Url;
        match.streamingStatus = 'completed';
        match.streamingCompletedAt = new Date();
        await match.save();

        // Send notification
        await matchNotificationService.notifyMatchVideoReady(creator._id, match);

        // Start player detection automatically
        try {
          console.log(`🎯 Initiating player detection for match ${matchId}`);

          const playerDetectionResponse = await VideoAnalysisService.fetchPlayers({
            video: jobStatus.s3Url,
          });

          if (playerDetectionResponse.player_detection_job_id) {
            match.playerDetectionJobId = playerDetectionResponse.player_detection_job_id;
            match.playerDetectionStatus = 'processing';
            match.playerDetectionStartedAt = new Date();
            await match.save();

            console.log(`✅ Player detection started for match ${matchId}`);

            // Notify that player detection has started
            await matchNotificationService.notifyPlayerDetectionStarted(
              creator._id,
              match
            );
          }
        } catch (error) {
          console.error(`Failed to initiate player detection for match ${matchId}:`, error);
        }

      } else if (jobStatus.status === 'failed') {
        console.error(`❌ Download failed for match ${matchId}`);

        match.streamingStatus = 'failed';
        match.streamingCompletedAt = new Date();
        match.streamingError = jobStatus.error || 'Download failed';
        await match.save();

        // Send notification about failure
        await matchNotificationService.notifyMatchVideoFailed(
          creator._id,
          match,
          jobStatus.error
        );

      } else if (jobStatus.status === 'processing') {
        console.log(`⏳ Download still processing for match ${matchId}`);
      }

    } catch (error) {
      console.error(`Error checking download for match ${matchId}:`, error.message);
    }
  }

  // ==========================================
  // PLAYER DETECTION METHODS
  // ==========================================

  async checkPendingPlayerDetections() {
    try {
      await this.cleanupExpiredLocks();

      // Find matches that need player detection started OR are processing
      const pendingMatches = await Match.find({
        $or: [
          { playerDetectionStatus: 'processing' }, // Check status
          { playerDetectionStatus: 'not_started' }, // Start detection
        ],
        video: { $exists: true, $ne: null },
      }).populate({ path: 'creator', select: 'fullName _id' });

      console.log(
        `Found ${pendingMatches.length} player detection tasks (processing + not_started)`,
      );

      const promises = pendingMatches.map((match) =>
        this.checkSinglePlayerDetection(match),
      );

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error checking pending player detections:', error);
    }
  }

  async checkSinglePlayerDetection(match) {
    const { _id: matchId, video, creator, playerDetectionStatus } = match;

    // If status is not_started, initiate player detection
    if (playerDetectionStatus === 'not_started') {
      try {
        console.log(`🎯 Starting player detection for match ${matchId} (status: not_started)`);

        const playerDetectionResponse = await VideoAnalysisService.fetchPlayers({
          video: video,
        });

        if (playerDetectionResponse.player_detection_job_id) {
          match.playerDetectionJobId = playerDetectionResponse.player_detection_job_id;
          match.playerDetectionStatus = 'processing';
          match.playerDetectionStartedAt = new Date();
          await match.save();

          console.log(`✅ Player detection initiated for match ${matchId}, job: ${playerDetectionResponse.player_detection_job_id}`);

          // Notify that player detection has started
          await matchNotificationService.notifyPlayerDetectionStarted(
            creator._id,
            match
          );
        }
      } catch (error) {
        console.error(`❌ Failed to start player detection for match ${matchId}:`, error.message);
      }
      return;
    }

    // For processing status, check the status
    const lockKey = `player_${matchId}`;
    if (await this.isProcessing(lockKey)) {
      console.log(
        `Player detection ${matchId} already being checked, skipping...`,
      );
      return;
    }

    const processingDuration =
      Date.now() - new Date(match.playerDetectionStartedAt).getTime();
    if (processingDuration > this.PLAYER_DETECTION_TIMEOUT) {
      console.log(
        `Player detection ${matchId} timed out after ${processingDuration}ms`,
      );
      await this.handlePlayerDetectionTimeout(match);
      return;
    }

    // Check retry count and fail if exceeded
    const retryCount = match.playerDetectionRetryCount || 0;
    const MAX_RETRIES = 50; // 10 retries * 3 minutes = 30 minutes max

    if (retryCount >= MAX_RETRIES) {
      console.log(
        `Player detection ${matchId} exceeded max retries (${MAX_RETRIES})`,
      );
      await this.handlePlayerDetectionFailure(
        match,
        `Failed after ${MAX_RETRIES} retry attempts`,
      );
      return;
    }

    const lockAcquired = await this.addProcessingLock(lockKey);
    if (!lockAcquired) {
      console.log(`Failed to acquire lock for player detection ${matchId}`);
      return;
    }

    try {
      console.log(
        `Checking player detection for match: ${matchId} (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})`,
      );

      // Check if we have a job ID
      if (!match.playerDetectionJobId) {
        console.log(
          `No player detection job ID found for match ${matchId}, will try to start detection`,
        );

        // Try to start player detection
        const fetchPlayerResult = await VideoAnalysisService.fetchPlayers({
          video,
        });

        if (fetchPlayerResult.player_detection_job_id) {
          match.playerDetectionJobId =
            fetchPlayerResult.player_detection_job_id;
          match.playerDetectionRetryCount = retryCount + 1;
          await match.save();
          console.log(
            `Player detection started for ${matchId}, job_id: ${fetchPlayerResult.player_detection_job_id}`,
          );
          return;
        }

        console.log('Fetch Player result:', fetchPlayerResult);
      }

      // Poll the status endpoint
      const statusResult = await VideoAnalysisService.getPlayerDetectionStatus(
        match.playerDetectionJobId,
      );

      console.log(
        `Player detection status for ${matchId}:`,
        JSON.stringify(statusResult, null, 2),
      );

      // Normalize field names (AI server uses "player detection status" with spaces)
      const detectionStatus =
        statusResult['player detection status'] ||
        statusResult.processing_status;

      // Check if still processing
      if (
        detectionStatus === 'processing' ||
        detectionStatus === 'pending' ||
        statusResult.status === 'processing'
      ) {
        console.log(
          `Player detection ${matchId} still processing, will check again later`,
        );
        match.playerDetectionRetryCount = retryCount + 1;
        await match.save();
        return;
      }

      // Check for errors
      if (statusResult.status === 'error' || statusResult.error) {
        throw new Error(
          statusResult.error ||
            statusResult.message ||
            'Player detection failed',
        );
      }

      // Check if completed
      if (
        detectionStatus === 'completed' ||
        statusResult.status === 'success'
      ) {
        // Transform players array to expected format
        // AI server returns array of URL strings, we need objects with image_url and player_id
        const playersArray = statusResult.players || [];
        const formattedPlayers = playersArray.map((player, index) => {
          // If already an object with image_url, use it as-is
          if (typeof player === 'object' && player.image_url) {
            return player;
          }
          // If it's a string URL, convert to expected format
          if (typeof player === 'string') {
            return {
              image_url: player,
              player_id: String.fromCharCode(97 + index), // a, b, c, d, etc.
            };
          }
          return player;
        });

        match.players = formattedPlayers;
        match.fetchedPlayerData = match.players.length > 0;
        match.playerDetectionStatus = 'completed';
        match.playerDetectionCompletedAt = new Date();
        match.playerDetectionRetryCount = 0; // Reset counter on success

        await match.save();

        console.log(
          `Player detection completed for ${matchId}: ${match.players.length} players found`,
        );

        await matchNotificationService.notifyPlayerDetectionComplete(
          creator._id,
          match,
          match.players,
        );
        return;
      }

      // Unknown status - increment retry
      console.log(
        `Unknown player detection status for ${matchId}:`,
        statusResult.processing_status || statusResult.status,
      );
      match.playerDetectionRetryCount = retryCount + 1;
      await match.save();
    } catch (error) {
      console.error(`Error checking player detection ${matchId}:`, error);

      // Increment retry count
      match.playerDetectionRetryCount = retryCount + 1;
      await match.save();

      console.log(
        `Will retry player detection for ${matchId} on next cron run (${match.playerDetectionRetryCount}/${MAX_RETRIES})`,
      );

      // If this was the last retry, mark as failed
      if (match.playerDetectionRetryCount >= MAX_RETRIES) {
        await this.handlePlayerDetectionFailure(match, error.message);
      }
    } finally {
      await this.removeProcessingLock(lockKey);
    }
  }

  async handlePlayerDetectionTimeout(match) {
    try {
      match.playerDetectionStatus = 'failed';
      match.playerDetectionError =
        'Processing timeout - video may be too large or corrupted';
      await match.save();

      await matchNotificationService.notifyPlayerDetectionFailed(
        match.creator,
        match,
        'Player detection timed out. Please try uploading the video again.',
      );

      console.log(`Player detection timeout handled for match ${match._id}`);
    } catch (error) {
      console.error(`Error handling player detection timeout:`, error);
    }
  }

  async handlePlayerDetectionFailure(match, errorMessage) {
    try {
      match.playerDetectionStatus = 'failed';
      match.playerDetectionError = errorMessage;
      await match.save();

      await matchNotificationService.notifyPlayerDetectionFailed(
        match.creator,
        match,
        `Player detection failed: ${errorMessage}`,
      );

      console.log(
        `Player detection failure handled for match ${match._id}: ${errorMessage}`,
      );
    } catch (error) {
      console.error(`Error handling player detection failure:`, error);
    }
  }

  // ==========================================
  // LOCK MANAGEMENT
  // ==========================================

  async addProcessingLock(lockKey) {
    try {
      let lock = await ProcessingLock.findOne({ matchId: lockKey });

      if (!lock) {
        lock = await createOne(ProcessingLock, {
          matchId: lockKey,
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + this.PROCESSING_TIMEOUT),
        });
      }

      return true;
    } catch (error) {
      console.error('Error adding processing lock:', error);
      return false;
    }
  }

  async isProcessing(lockKey) {
    try {
      const lock = await ProcessingLock.findOne({ matchId: lockKey });

      if (!lock) return false;

      if (lock.expiresAt < new Date()) {
        await ProcessingLock.deleteOne({ matchId: lockKey });
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking processing lock:', error);
      return false;
    }
  }

  async removeProcessingLock(lockKey) {
    try {
      await ProcessingLock.deleteOne({ matchId: lockKey });
    } catch (error) {
      console.error('Error removing processing lock:', error);
    }
  }

  async cleanupExpiredLocks() {
    try {
      const result = await ProcessingLock.deleteMany({
        expiresAt: { $lt: new Date() },
      });

      if (result.deletedCount > 0) {
        console.log(
          `Cleaned up ${result.deletedCount} expired processing locks`,
        );
      }
    } catch (error) {
      console.error('Error cleaning up expired locks:', error);
    }
  }

  // ==========================================
  // ANALYSIS STATUS METHODS
  // ==========================================

  async checkSingleAnalysis(match) {
    const { analysisId, _id: matchId, creator } = match;

    const lockKey = `analysis_${matchId}`;
    if (await this.isProcessing(lockKey)) {
      console.log(`Analysis ${matchId} already being processed, skipping...`);
      return;
    }

    const lockAcquired = await this.addProcessingLock(lockKey);
    if (!lockAcquired) {
      console.log(`Failed to acquire processing lock for ${matchId}`);
      return;
    }

    try {
      console.log(
        `Checking status for analysis: ${matchId} with job_id: ${analysisId}`,
      );

      const rawStatus =
        await VideoAnalysisService.getAnalysisStatus(analysisId);

      console.log(JSON.stringify(rawStatus, null, 2).bold.green);

      const status = rawStatus.analysis_status
        ? {
            ...rawStatus,
            status: rawStatus.analysis_status,
            message:
              rawStatus.status === 'success'
                ? 'Analysis completed'
                : 'Analysis in progress',
            job_id: rawStatus.job_id,
          }
        : rawStatus;

      let analysisStatus = await findOne(AnalysisStatus, { match_id: matchId });

      if (!analysisStatus) {
        await createOne(AnalysisStatus, status);
      } else {
        await updateOne(AnalysisStatus, { match_id: matchId }, status);
      }

      if (status.analysis_status === 'completed') {
        await this.handleCompletedAnalysis(match, status);
      } else if (status.analysis_status === 'failed') {
        await this.handleFailedAnalysis(match, status);
      } else {
        await this.updateMatchStatus(match, status.analysis_status);
      }
    } catch (error) {
      console.error(`Error checking analysis ${matchId}:`, error);
      await this.handleAnalysisError(match, error);
    } finally {
      await this.removeProcessingLock(lockKey);
    }
  }

  async checkPendingAnalyses() {
    try {
      await this.cleanupExpiredLocks();

      const pendingMatches = await Match.find({
        analysisStatus: {
          $in: ['pending', 'processing', 'in_progress', 'not_found'],
        },
      }).populate({ path: 'creator', select: 'fullName' });

      console.log(`Found ${pendingMatches.length} pending analyses to check`);

      const promises = pendingMatches.map((match) =>
        this.checkSingleAnalysis(match),
      );

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error fetching pending analyses:', error);
      throw error;
    }
  }

  async handleCompletedAnalysis(match, status) {
    const { analysisId, _id: matchId, creator } = match;

    try {
      console.log(`Analysis ${matchId} completed, fetching results...`);

      console.log(
        '🔍 handleCompletedAnalysis - status object keys:',
        Object.keys(status),
      );
      console.log(
        '🔍 handleCompletedAnalysis - has results:',
        'results' in status,
      );
      console.log(
        '🔍 handleCompletedAnalysis - results.all_clips:',
        status.results?.all_clips,
      );

      let results = transformNewAnalysisResults(status);

      // Don't use spread operator - it destroys the Map in files.highlights
      // Instead, directly add the match_id property
      results.match_id = matchId;

      createLogger.info(
        `Analysis ${analysisId} completed with results: ${JSON.stringify(
          results,
          null,
          2,
        )}`.bold.green,
      );

      await Match.findByIdAndUpdate(matchId, {
        analysisStatus: 'completed',
      });

      await processAnalysisResponse(results, creator);

      if (creator && creator._id) {
        await FirebaseService.sendNotification(
          creator._id,
          'Analysis Complete',
          'Your video analysis has completed successfully!',
          {
            matchId: matchId,
            analysisId: analysisId,
            type: 'analysis_completed',
            status: 'completed',
          },
        );
      }

      console.log(`Successfully processed completed analysis: ${analysisId}`);
    } catch (error) {
      console.error(`Error handling completed analysis ${analysisId}:`, error);
      await this.handleAnalysisError(match, error);
    }
  }

  async handleFailedAnalysis(match, status) {
    const { analysisId, _id: matchId, creator } = match;

    try {
      console.log(`Analysis ${analysisId} failed:`, status.message);

      await Match.findByIdAndUpdate(matchId, {
        analysisStatus: 'failed',
      });

      if (creator && creator._id) {
        await FirebaseService.sendNotification(
          creator._id,
          'Analysis Failed',
          'Your video analysis has failed. Please try again.',
          {
            matchId: matchId,
            analysisId: analysisId,
            type: 'analysis_failed',
            status: 'failed',
            error: status.message,
          },
        );
      }

      console.log(`Successfully processed failed analysis: ${analysisId}`);
    } catch (error) {
      console.error(`Error handling failed analysis ${analysisId}:`, error);
    }
  }

  async updateMatchStatus(match, newStatus) {
    const { analysisId, _id: matchId } = match;

    try {
      await Match.findByIdAndUpdate(matchId, {
        analysisStatus: newStatus,
        updatedAt: new Date(),
      });

      console.log(`Updated match ${matchId} status to: ${newStatus}`);
    } catch (error) {
      console.error(`Error updating match ${matchId} status:`, error);
    }
  }

  async handleAnalysisError(match, error) {
    const { analysisId, _id: matchId } = match;

    try {
      if (error.message.includes('404')) {
        await Match.findByIdAndUpdate(matchId, {
          analysisStatus: 'not_found',
          updatedAt: new Date(),
        });
      } else {
        console.error(
          `Temporary error checking analysis ${analysisId}:`,
          error.message,
        );
      }
    } catch (updateError) {
      console.error(`Error updating match after analysis error:`, updateError);
    }
  }

  async getStatus() {
    try {
      const activeLocks = await ProcessingLock.find({
        expiresAt: { $gt: new Date() },
      });

      const playerDetectionLocks = activeLocks.filter((lock) =>
        lock.matchId.startsWith('player_'),
      );
      const analysisLocks = activeLocks.filter((lock) =>
        lock.matchId.startsWith('analysis_'),
      );

      return {
        isRunning: this.isRunning,
        isScheduled: this.cronJob ? this.cronJob.scheduled : false,
        processingCount: activeLocks.length,
        playerDetectionCount: playerDetectionLocks.length,
        analysisCount: analysisLocks.length,
        processingPlayerDetections: playerDetectionLocks.map((lock) => ({
          matchId: lock.matchId.replace('player_', ''),
          startedAt: lock.startedAt,
          expiresAt: lock.expiresAt,
        })),
        processingAnalyses: analysisLocks.map((lock) => ({
          matchId: lock.matchId.replace('analysis_', ''),
          startedAt: lock.startedAt,
          expiresAt: lock.expiresAt,
        })),
      };
    } catch (error) {
      console.error('Error getting cron job status:', error);
      return {
        isRunning: this.isRunning,
        isScheduled: this.cronJob ? this.cronJob.scheduled : false,
        processingCount: 0,
        playerDetectionCount: 0,
        analysisCount: 0,
        processingPlayerDetections: [],
        processingAnalyses: [],
      };
    }
  }
}

const analysisStatusCron = new AnalysisStatusCronJob();

export default analysisStatusCron;

// class AnalysisStatusCronJob {
//   constructor() {
//     this.isRunning = false;
//     this.processingAnalyses = new Set(); // Track analyses being processed
//   }

//   // Start the cron job
//   start() {
//     console.log('Starting analysis status cron job...');

//     // Run every 5 minutes: '*/5 * * * *'
//     this.cronJob = cron.schedule(
//       '*/5 * * * *',
//       async () => {
//         if (this.isRunning) {
//           console.log('Previous cron job still running, skipping...');
//           return;
//         }

//         this.isRunning = true;
//         console.log('Running analysis status check:', new Date().toISOString());

//         try {
//           await this.checkPendingAnalyses();
//         } catch (error) {
//           console.error('Error in analysis status cron job:', error);
//         } finally {
//           this.isRunning = false;
//         }
//       },
//       {
//         scheduled: true,
//         timezone: 'UTC', // Adjust timezone as needed
//       }
//     );

//     console.log('Analysis status cron job started - running every 5 minutes');
//   }

//   // Stop the cron job
//   stop() {
//     if (this.cronJob) {
//       this.cronJob.stop();
//       console.log('Analysis status cron job stopped');
//     }
//   }

//   // Check all pending analyses
//   async checkPendingAnalyses() {
//     try {
//       // Find all matches with pending analyses
//       const pendingMatches = await Match.find({
//         analysisId: { $exists: true, $ne: null },
//         analysisStatus: { $in: ['pending', 'processing', 'in_progress'] },
//       }).populate({ path: 'creator', select: 'fullName' });

//       console.log(`Found ${pendingMatches.length} pending analyses to check`);

//       // Process each pending analysis
//       const promises = pendingMatches.map((match) =>
//         this.checkSingleAnalysis(match)
//       );

//       await Promise.allSettled(promises);
//     } catch (error) {
//       console.error('Error fetching pending analyses:', error);
//       throw error;
//     }
//   }

//   // Check status of a single analysis
//   async checkSingleAnalysis(match) {
//     const { analysisId, _id: matchId, creator } = match;

//     // Skip if already being processed
//     if (this.processingAnalyses.has(matchId)) {
//       console.log(`Analysis ${matchId} already being processed, skipping...`);
//       return;
//     }

//     this.processingAnalyses.add(matchId);

//     try {
//       console.log(`Checking status for analysis: ${matchId}`);

//       const status = await VideoAnalysisService.getAnalysisStatus(matchId);

//       let analysisStatus = await findOne(AnalysisStatus, { match_id: matchId });

//       if (!analysisStatus) {
//         await createOne(AnalysisStatus, status);
//       } else {
//         await updateOne(AnalysisStatus, { match_id: matchId }, status);
//       }

//       if (status.status === 'completed') {
//         await this.handleCompletedAnalysis(match, status);
//       } else if (status.status === 'failed') {
//         await this.handleFailedAnalysis(match, status);
//       } else {
//         // Still processing - update match status if needed
//         await this.updateMatchStatus(match, status.status);
//       }
//     } catch (error) {
//       console.error(`Error checking analysis ${matchId}:`, error);
//       await this.handleAnalysisError(match, error);
//     } finally {
//       this.processingAnalyses.delete(matchId);
//     }
//   }

//   // Handle completed analysis
//   async handleCompletedAnalysis(match, status) {
//     const { analysisId, _id: matchId, creator } = match;

//     try {
//       console.log(`Analysis ${matchId} completed, fetching results...`);

//       // Get the analysis results
//       const results = await VideoAnalysisService.getAnalysisResults(matchId);

//       // Update match with results and status
//       await Match.findByIdAndUpdate(matchId, {
//         analysisStatus: 'completed',
//       });

//       await processAnalysisResponse(results, creator);

//       // Send success notification
//       if (creator && creator._id) {
//         await FirebaseService.sendNotification(
//           creator._id,
//           'Analysis Complete',
//           'Your video analysis has completed successfully!',
//           {
//             matchId: matchId,
//             analysisId: analysisId,
//             type: 'analysis_completed',
//             status: 'completed',
//           }
//         );
//       }

//       console.log(`Successfully processed completed analysis: ${analysisId}`);
//     } catch (error) {
//       console.error(`Error handling completed analysis ${analysisId}:`, error);
//       await this.handleAnalysisError(match, error);
//     }
//   }

//   // Handle failed analysis
//   async handleFailedAnalysis(match, status) {
//     const { analysisId, _id: matchId, creator } = match;

//     try {
//       console.log(`Analysis ${analysisId} failed:`, status.message);

//       // Update match status
//       await Match.findByIdAndUpdate(matchId, {
//         analysisStatus: 'failed',
//       });

//       // Send failure notification
//       if (creator && creator._id) {
//         await FirebaseService.sendNotification(
//           creator._id,
//           'Analysis Failed',
//           'Your video analysis has failed. Please try again.',
//           {
//             matchId: matchId,
//             analysisId: analysisId,
//             type: 'analysis_failed',
//             status: 'failed',
//             error: status.message,
//           }
//         );
//       }

//       console.log(`Successfully processed failed analysis: ${analysisId}`);
//     } catch (error) {
//       console.error(`Error handling failed analysis ${analysisId}:`, error);
//     }
//   }

//   // Update match status for still processing analyses
//   async updateMatchStatus(match, newStatus) {
//     const { analysisId, _id: matchId } = match;

//     try {
//       await Match.findByIdAndUpdate(matchId, {
//         analysisStatus: newStatus,
//         updatedAt: new Date(),
//       });

//       console.log(`Updated match ${matchId} status to: ${newStatus}`);
//     } catch (error) {
//       console.error(`Error updating match ${matchId} status:`, error);
//     }
//   }

//   // Handle analysis check errors
//   async handleAnalysisError(match, error) {
//     const { analysisId, _id: matchId } = match;

//     try {
//       // If it's a 404 error, the analysis might have been deleted
//       if (error.message.includes('404')) {
//         await Match.findByIdAndUpdate(matchId, {
//           analysisStatus: 'not_found',
//           updatedAt: new Date(),
//         });
//       } else {
//         // For other errors, just log but don't update status
//         console.error(
//           `Temporary error checking analysis ${analysisId}:`,
//           error.message
//         );
//       }
//     } catch (updateError) {
//       console.error(`Error updating match after analysis error:`, updateError);
//     }
//   }

//   // Get current status of the cron job
//   getStatus() {
//     return {
//       isRunning: this.isRunning,
//       isScheduled: this.cronJob ? this.cronJob.scheduled : false,
//       processingCount: this.processingAnalyses.size,
//       processingAnalyses: Array.from(this.processingAnalyses),
//     };
//   }
// }

// Create and export singleton instance

// class AnalysisStatusCronJob {
//   constructor() {
//     this.isRunning = false;
//     this.PROCESSING_TIMEOUT = 48 * 60 * 60 * 1000; // 48 hours
//   }

//   // Start the cron job - STILL NEEDED!
//   start() {
//     console.log('Starting analysis status cron job...');

//     // Run every 5 minutes: '*/5 * * * *'
//     this.cronJob = cron.schedule(
//       '*/3 * * * *',
//       async () => {
//         if (this.isRunning) {
//           console.log('Previous cron job still running, skipping...');
//           return;
//         }

//         this.isRunning = true;
//         console.log('Running analysis status check:', new Date().toISOString());

//         try {
//           await this.checkPendingAnalyses();
//         } catch (error) {
//           console.error('Error in analysis status cron job:', error);
//         } finally {
//           this.isRunning = false;
//         }
//       },
//       {
//         scheduled: true,
//         timezone: 'UTC',
//       }
//     );

//     console.log('Analysis status cron job started - running every 5 minutes');
//   }

//   // Stop the cron job - STILL NEEDED!
//   stop() {
//     if (this.cronJob) {
//       this.cronJob.stop();
//       console.log('Analysis status cron job stopped');
//     }
//   }

//   // Add processing lock with timestamp
//   async addProcessingLock(matchId) {
//     console.log({ matchId });
//     try {
//       let lock = await ProcessingLock.findOne({ matchId });

//       if (!lock)
//         lock = await createOne(ProcessingLock, {
//           matchId,
//           startedAt: new Date(),
//           expiresAt: new Date(Date.now() + this.PROCESSING_TIMEOUT),
//         });
//       console.log('1:', { lock });
//       return true;
//     } catch (error) {
//       console.error('Error adding processing lock:', error);
//       return false;
//     }
//   }

//   // Check if analysis is being processed
//   async isProcessing(matchId) {
//     try {
//       const lock = await ProcessingLock.findOne({ matchId });

//       console.log('Is processing:', { lock });

//       if (!lock) return false;

//       // Check if lock has expired
//       if (lock.expiresAt < new Date()) {
//         await ProcessingLock.deleteOne({ matchId });
//         return false;
//       }

//       return true;
//     } catch (error) {
//       console.error('Error checking processing lock:', error);
//       return false;
//     }
//   }

//   // Remove processing lock
//   async removeProcessingLock(matchId) {
//     try {
//       await ProcessingLock.deleteOne({ matchId });
//     } catch (error) {
//       console.error('Error removing processing lock:', error);
//     }
//   }

//   // Clean up expired locks
//   async cleanupExpiredLocks() {
//     try {
//       const result = await ProcessingLock.deleteMany({
//         expiresAt: { $lt: new Date() },
//       });

//       console.log({ result });
//       if (result.deletedCount > 0) {
//         console.log(
//           `Cleaned up ${result.deletedCount} expired processing locks`
//         );
//       }
//     } catch (error) {
//       console.error('Error cleaning up expired locks:', error);
//     }
//   }

//   // Modified checkSingleAnalysis method
//   async checkSingleAnalysis(match) {
//     const { analysisId, _id: matchId, creator } = match;

//     // Check if already being processed
//     if (await this.isProcessing(matchId)) {
//       console.log(`Analysis ${matchId} already being processed, skipping...`);
//       return;
//     }

//     // Add processing lock
//     const lockAcquired = await this.addProcessingLock(matchId);
//     console.log({ lockAcquired });
//     if (!lockAcquired) {
//       console.log(`Failed to acquire processing lock for ${matchId}`);
//       return;
//     }

//     try {
//       console.log(`Checking status for analysis: ${matchId} with job_id: ${analysisId}`);

//       const rawStatus = await VideoAnalysisService.getAnalysisStatus(analysisId);

//       console.log({ rawStatus });

//       // Extract status from new format if needed
//       const status = rawStatus.analysis_status ? {
//         ...rawStatus,
//         status: rawStatus.analysis_status,
//         message: rawStatus.status === 'success' ? 'Analysis completed' : 'Analysis in progress',
//         job_id: rawStatus.job_id,
//       } : rawStatus;

//       console.log({status});

//       let analysisStatus = await findOne(AnalysisStatus, { match_id: matchId });

//       if (!analysisStatus) {
//         await createOne(AnalysisStatus, status);
//       } else {
//         console.log('Updating existing AnalysisStatus record', status);
//         await updateOne(AnalysisStatus, { match_id: matchId }, status);
//       }

//       console.log('We got here!');

//       console.log('Status:', status.analysis_status);

//       if (status.analysis_status === 'completed') {
//         await this.handleCompletedAnalysis(match, status);
//       } else if (status.analysis_status === 'failed') {
//         await this.handleFailedAnalysis(match, status);
//       } else {
//         await this.updateMatchStatus(match, status.analysis_status);
//       }
//     } catch (error) {
//       console.error(`Error checking analysis ${matchId}:`, error);
//       await this.handleAnalysisError(match, error);
//     } finally {
//       await this.removeProcessingLock(matchId);
//     }
//   }

//   // Modified checkPendingAnalyses to include cleanup
//   async checkPendingAnalyses() {
//     try {
//       // First, clean up any expired locks
//       await this.cleanupExpiredLocks();

//       // Find all matches with pending analyses
//       const pendingMatches = await Match.find({
//         analysisStatus: {
//           $in: ['pending', 'processing', 'in_progress', 'not_found'],
//         },
//       }).populate({ path: 'creator', select: 'fullName' });

//       console.log({ pendingMatches });

//       console.log(`Found ${pendingMatches.length} pending analyses to check`);

//       // Process each pending analysis
//       const promises = pendingMatches.map((match) =>
//         this.checkSingleAnalysis(match)
//       );

//       await Promise.allSettled(promises);
//     } catch (error) {
//       console.error('Error fetching pending analyses:', error);
//       throw error;
//     }
//   }

//   // Handle completed analysis
//   async handleCompletedAnalysis(match, status) {
//     const { analysisId, _id: matchId, creator } = match;

//     try {
//       console.log(`Analysis ${matchId} completed, fetching results...`);

//       // Get the analysis results
//       // const rawResults = await VideoAnalysisService.getAnalysisResults(analysisId);

//       // console.log({ rawResults });

//       // Transform new format to expected format if needed
//       let results = transformNewAnalysisResults(status);

//       console.log({ results });

//       results = {...results, match_id: matchId};

//       console.log({ transformedResults: results });

//       // Update match with results and status
//       await Match.findByIdAndUpdate(matchId, {
//         analysisStatus: 'completed',
//       });

//       await processAnalysisResponse(results, creator);

//       // Send success notification
//       if (creator && creator._id) {
//         await FirebaseService.sendNotification(
//           creator._id,
//           'Analysis Complete',
//           'Your video analysis has completed successfully!',
//           {
//             matchId: matchId,
//             analysisId: analysisId,
//             type: 'analysis_completed',
//             status: 'completed',
//           }
//         );
//       }

//       console.log(`Successfully processed completed analysis: ${analysisId}`);
//     } catch (error) {
//       console.error(`Error handling completed analysis ${analysisId}:`, error);
//       await this.handleAnalysisError(match, error);
//     }
//   }

//   // Handle failed analysis
//   async handleFailedAnalysis(match, status) {
//     const { analysisId, _id: matchId, creator } = match;

//     try {
//       console.log(`Analysis ${analysisId} failed:`, status.message);

//       // Update match status
//       await Match.findByIdAndUpdate(matchId, {
//         analysisStatus: 'failed',
//       });

//       // Send failure notification
//       if (creator && creator._id) {
//         await FirebaseService.sendNotification(
//           creator._id,
//           'Analysis Failed',
//           'Your video analysis has failed. Please try again.',
//           {
//             matchId: matchId,
//             analysisId: analysisId,
//             type: 'analysis_failed',
//             status: 'failed',
//             error: status.message,
//           }
//         );
//       }

//       console.log(`Successfully processed failed analysis: ${analysisId}`);
//     } catch (error) {
//       console.error(`Error handling failed analysis ${analysisId}:`, error);
//     }
//   }

//   // Update match status for still processing analyses
//   async updateMatchStatus(match, newStatus) {
//     const { analysisId, _id: matchId } = match;

//     try {
//       await Match.findByIdAndUpdate(matchId, {
//         analysisStatus: newStatus,
//         updatedAt: new Date(),
//       });

//       console.log(`Updated match ${matchId} status to: ${newStatus}`);
//     } catch (error) {
//       console.error(`Error updating match ${matchId} status:`, error);
//     }
//   }

//   // Handle analysis check errors
//   async handleAnalysisError(match, error) {
//     const { analysisId, _id: matchId } = match;

//     try {
//       // If it's a 404 error, the analysis might have been deleted
//       if (error.message.includes('404')) {
//         await Match.findByIdAndUpdate(matchId, {
//           analysisStatus: 'not_found',
//           updatedAt: new Date(),
//         });
//       } else {
//         // For other errors, just log but don't update status
//         console.error(
//           `Temporary error checking analysis ${analysisId}:`,
//           error.message
//         );
//       }
//     } catch (updateError) {
//       console.error(`Error updating match after analysis error:`, updateError);
//     }
//   }

//   // Get current status including processing locks
//   async getStatus() {
//     try {
//       const activeLocks = await ProcessingLock.find({
//         expiresAt: { $gt: new Date() },
//       });

//       return {
//         isRunning: this.isRunning,
//         isScheduled: this.cronJob ? this.cronJob.scheduled : false,
//         processingCount: activeLocks.length,
//         processingAnalyses: activeLocks.map((lock) => ({
//           matchId: lock.matchId,
//           startedAt: lock.startedAt,
//           expiresAt: lock.expiresAt,
//         })),
//       };
//     } catch (error) {
//       console.error('Error getting cron job status:', error);
//       return {
//         isRunning: this.isRunning,
//         isScheduled: this.cronJob ? this.cronJob.scheduled : false,
//         processingCount: 0,
//         processingAnalyses: [],
//       };
//     }
//   }
// }
// const analysisStatusCron = new AnalysisStatusCronJob();

// export default analysisStatusCron;

// export const pendingMatches = catchAsync(async (req, res) => {
//    const pendingMatches = await Match.find({
//      analysisStatus: {
//        $in: ['pending', 'processing', 'in_progress', 'not_found  '],
//      },
//    }).populate({ path: 'creator', select: 'fullName' });
// });
