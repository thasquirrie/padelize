import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/appError.js';
import { uploadLargeFile } from './s3UploadService.js';
import Match from '../models/Match.js';
import { findOne } from '../factory/repo.js';
import FirebaseService from './firebaseService.js';
import { processAnalysisResponse } from '../utils/analysisFormatter.js';
import AnalysisStatus from '../models/AnalysisStatus.js';
import mongoose from 'mongoose';
import Analysis from '../models/Analysis.js';

// Configuration - update with your Python API URL
// const PYTHON_API_BASE_URL = 'http://127.0.0.1:8000';
const PYTHON_API_BASE_URL = 'https://server.padelize.ai';
// const PYTHON_API_BASE_URL = 'http://54.195.115.106:8000';

class VideoAnalysisService {
  static createMultipartFormData(videoPath, options = {}, userId, matchId) {
    const boundary = `----FormBoundary${Math.random()
      .toString(36)
      .substring(2)}`;
    let body = '';

    // Add video file
    const videoBuffer = fs.readFileSync(videoPath);
    const filename = path.basename(videoPath);

    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="video"; filename="${filename}"\r\n`;
    body += `Content-Type: video/mp4\r\n\r\n`;

    const bodyParts = [Buffer.from(body, 'utf8'), videoBuffer];

    // Add form parameters
    let formFields = `\r\n`;

    const appendField = (name, value) => {
      formFields += `--${boundary}\r\n`;
      formFields += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
      formFields += `${value}\r\n`;
    };

    if (options.confidence !== undefined) {
      appendField('confidence', options.confidence);
    }

    if (options.skip_frames !== undefined) {
      appendField('skip_frames', options.skip_frames);
    }

    if (options.court_detection !== undefined) {
      appendField('court_detection', options.court_detection);
    }

    if (userId) {
      appendField('user_id', userId);
    }

    if (matchId) {
      appendField('match_id', matchId);
    }

    formFields += `--${boundary}--\r\n`;

    bodyParts.push(Buffer.from(formFields, 'utf8'));

    return {
      body: Buffer.concat(bodyParts),
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }

  static async fetchPlayers(body) {
    console.log('Body:', body);
    try {
      const formData = new URLSearchParams();

      // New API only needs video parameter
      if (body.video) {
        formData.append('video', body.video);
      }

      const response = await fetch(`${PYTHON_API_BASE_URL}/fetch_players/`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Python API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching players:', error);
      throw error;
    }
  }

  // Check player detection status
  static async getPlayerDetectionStatus(jobId) {
    try {
      const response = await fetch(
        `${PYTHON_API_BASE_URL}/fetch_players/status/?job_id=${jobId}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Status check error: ${response.status} - ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error('Error checking player detection status:', error);
      throw error;
    }
  }

  // Start video analysis using new API
  static async analyzeVideo(body) {
    try {
      // const formData = new URLSearchParams();

      // // New API only needs video parameter
      // if (body.video_path) {
      //   formData.append("video", body.video_path);
      // }

      const response = await fetch(`${PYTHON_API_BASE_URL}/analyses/`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Python API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error starting video analysis:', error);
      throw error;
    }
  }

  // Alternative approach using multipart form data for file uploads
  static async analyzeVideoWithFile(videoPath, options = {}, userId, matchId) {
    try {
      const { body, contentType } = this.createMultipartFormData(
        videoPath,
        options,
        userId,
        matchId
      );

      const response = await fetch(
        `${PYTHON_API_BASE_URL}/analyze-video-file`,
        {
          method: 'POST',
          body: body,
          headers: {
            'Content-Type': contentType,
            'Content-Length': body.length,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Python API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error starting video analysis with file:', error);
      throw error;
    }
  }

  // Check analysis status
  static async getAnalysisStatus(jobId) {
    try {
      const response = await fetch(
        `${PYTHON_API_BASE_URL}/analyses/status/?job_id=${jobId}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Status check error: ${response.status} - ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error('Error checking analysis status:', error);
      throw error;
    }
  }

  // Restart analysis
  static async restartAnalysis(matchId) {
    try {
      const response = await fetch(
        `${PYTHON_API_BASE_URL}/api/restart/${matchId}`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Restart error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error restarting analysis:', error);
      throw error;
    }
  }

  // Get analysis results
  static async getAnalysisResults(jobId) {
    try {
      const response = await fetch(
        `${PYTHON_API_BASE_URL}/analyses/status/?job_id=${jobId}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Results fetch error: ${response.status} - ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting analysis results:', error);
      throw error;
    }
  }

  // Delete analysis and cleanup files
  static async deleteAnalysis(analysisId) {
    try {
      const response = await fetch(
        `${PYTHON_API_BASE_URL}/analysis/${analysisId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Delete error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting analysis:', error);
      throw error;
    }
  }

  // Wait for analysis completion with polling
  static async waitForCompletion(
    analysisId,
    maxWaitTime = 300000,
    pollInterval = 2000
  ) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const rawStatus = await this.getAnalysisStatus(analysisId);

      // Handle both old and new status formats
      const analysisStatus = rawStatus.analysis_status || rawStatus.status;

      if (analysisStatus === 'completed') {
        const rawResults = await this.getAnalysisResults(analysisId);
        const { transformNewAnalysisResults } = await import(
          '../utils/analysisFormatter.js'
        );
        return transformNewAnalysisResults(rawResults);
      } else if (analysisStatus === 'failed') {
        throw new Error(
          `Analysis failed: ${rawStatus.message || 'Unknown error'}`
        );
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error('Analysis timeout - exceeded maximum wait time');
  }

  // Complete analysis workflow (start + wait for completion)
  static async analyzeVideoComplete(videoPath, options = {}) {
    try {
      // Start analysis
      const analysisStart = await this.analyzeVideoWithFile(videoPath, options);
      console.log(
        'Analysis started:',
        analysisStart.job_id || analysisStart.analysis_id
      );

      // Wait for completion
      const jobId = analysisStart.job_id || analysisStart.analysis_id;
      const results = await this.waitForCompletion(jobId);
      console.log('Analysis completed successfully');

      return {
        analysisId: jobId,
        ...results,
      };
    } catch (error) {
      console.error('Complete analysis workflow failed:', error);
      throw error;
    }
  }

  // Check if Python API is healthy
  static async checkHealth() {
    try {
      const response = await fetch(`${PYTHON_API_BASE_URL}/health`);

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Python API health check failed:', error);
      throw error;
    }
  }
}

// Express route handler that starts video analysis
export const analyzeVideoService = catchAsync(async (req, res, next) => {
  const { matchId } = req.body;
  const { _id: userId } = req.user;

  console.log({ matchId, userId });

  const match = await findOne(Match, { _id: matchId, creator: userId });
  if (!match || !match.video) {
    return next(
      new AppError('No match found or no video attached to analyze', 404)
    );
  }

  const options = {
    confidence: parseFloat(req.body.confidence) || 0.5,
    skip_frames: parseInt(req.body.skip_frames) || 5,
    court_detection: req.body.court_detection === 'true',
  };

  let analysisResult = null;
  const video_url = match.video;

  try {
    // Step 1: Start video analysis
    console.log('Starting video analysis...');

    // Send notification that analysis is starting
    await FirebaseService.sendNotification(
      userId,
      'Analysis Starting',
      'Your video analysis is now starting...',
      {
        matchId: matchId,
        type: 'analysis_starting',
        status: 'processing',
      }
    );

    analysisResult = await VideoAnalysisService.analyzeVideo({
      options,
      match_id: matchId,
      user_id: userId,
      game_type: 'doubles',
      target_player_position: 'near_right',
      enable_ball_tracking: true,
      enable_action_recognition: true,
      video_url,
    });

    const jobId = analysisResult.job_id || analysisResult.analysis_id;
    console.log('Analysis started:', jobId);

    if (!analysisResult || !jobId) {
      throw new Error('Analysis failed to start');
    }

    // Update match with analysis info
    match.analysisId = jobId;
    match.analysisStatus = 'processing'; // Set initial status
    await match.save();

    // Send notification that analysis has started successfully
    await FirebaseService.sendNotification(
      userId,
      'Analysis Started',
      'Your video analysis has started successfully! You will be notified when it completes.',
      {
        matchId: matchId,
        analysisId: jobId,
        type: 'analysis_started',
        status: 'processing',
      }
    );

    // Step 2: Return analysis info
    res.status(200).json({
      status: 'success',
      message: 'Video analysis started successfully',
      data: {
        analysis: {
          analysisId: jobId,
          status: 'processing',
          message: 'Analysis started successfully',
        },
        match,
      },
    });
  } catch (error) {
    console.error('Video analysis error:', error);

    // Send notification about analysis failure
    await FirebaseService.sendNotification(
      userId,
      'Analysis Failed',
      'There was an error starting your video analysis. Please try again.',
      {
        matchId: matchId,
        type: 'analysis_failed',
        error: error.message,
      }
    );

    return next(new AppError(`Process failed: ${error.message}`, 500));
  }
});

// Get analysis status
export const getAnalysisStatusService = catchAsync(async (req, res, next) => {
  const { analysisId } = req.params;
  const { _id: userId } = req.user;

  try {
    const rawStatus = await VideoAnalysisService.getAnalysisStatus(analysisId);

    // Handle both old and new status formats
    const status = rawStatus.analysis_status
      ? {
          status: rawStatus.analysis_status,
          message:
            rawStatus.status === 'success'
              ? 'Analysis completed'
              : 'Analysis in progress',
          job_id: rawStatus.job_id,
          ...rawStatus,
        }
      : rawStatus;

    // If analysis is completed, send notification
    if (
      status.status === 'completed' ||
      status.analysis_status === 'completed'
    ) {
      // Find the match to get context
      const match = await Match.findOne({ analysisId: analysisId });

      if (match && match.creator.toString() === userId.toString()) {
        await FirebaseService.sendNotification(
          userId,
          'Analysis Complete',
          'Your video analysis has completed successfully!',
          {
            matchId: match._id,
            analysisId: analysisId,
            type: 'analysis_completed',
            status: 'completed',
          }
        );
      }
    } else if (
      status.status === 'failed' ||
      status.analysis_status === 'failed'
    ) {
      // Send failure notification
      const match = await Match.findOne({ analysisId: analysisId });

      if (match && match.creator.toString() === userId.toString()) {
        await FirebaseService.sendNotification(
          userId,
          'Analysis Failed',
          'Your video analysis has failed. Please try again.',
          {
            matchId: match._id,
            analysisId: analysisId,
            type: 'analysis_failed',
            status: 'failed',
            error: status.message,
          }
        );
      }
    }

    res.status(200).json({
      status: 'success',
      data: status,
    });
  } catch (error) {
    return next(new AppError(`Status check failed: ${error.message}`, 500));
  }
});

// Get analysis results
export const getAnalysisResultsService = catchAsync(async (req, res, next) => {
  const { analysisId } = req.params;
  const { _id: userId } = req.user;

  try {
    const rawResults = await VideoAnalysisService.getAnalysisResults(
      analysisId
    );

    // Transform new format if needed
    const { transformNewAnalysisResults } = await import(
      '../utils/analysisFormatter.js'
    );
    const results = transformNewAnalysisResults(rawResults);

    const match = await Match.findOne({
      analysisId: analysisId,
      creator: userId,
    }).populate({
      path: 'creator',
      populate: {
        path: 'subscription',
        model: 'Subscription',
      },
    });

    if (!match) {
      return next(new AppError('Match not found or unauthorized', 404));
    }

    // Import filtering function
    const { filterAnalysisResultsBySubscription } = await import(
      '../utils/subscriptionUtils.js'
    );

    // Apply subscription-based filtering based on match creator's subscription
    const filteredResults = filterAnalysisResultsBySubscription(
      results,
      match.creator
    );

    // Update match with final results
    match.analysisStatus = 'completed';
    match.analysisResults = filteredResults; // Store filtered results
    await match.save();

    res.status(200).json({
      status: 'success',
      data: { results: filteredResults, match },
    });
  } catch (error) {
    return next(new AppError(`Results fetch failed: ${error.message}`, 500));
  }
});

// Complete analysis workflow (for file uploads)
export const analyzeVideoCompleteService = catchAsync(
  async (req, res, next) => {
    if (!req.file) {
      return next(new AppError('No video file provided', 400));
    }

    const { path: tempPath, originalname } = req.file;
    const { _id: userId } = req.user;
    const { matchId } = req.body;

    const options = {
      confidence: parseFloat(req.body.confidence) || 0.5,
      skip_frames: parseInt(req.body.skip_frames) || 3,
      court_detection: req.body.court_detection === 'true',
    };

    let analysisResults = null;
    let uploadResult = null;

    try {
      // Step 1: Complete video analysis (start + wait for completion)
      console.log('Starting complete video analysis...');

      await FirebaseService.sendNotification(
        userId,
        'Analysis Starting',
        'Your video analysis is now processing...',
        {
          matchId: matchId,
          type: 'analysis_starting',
          status: 'processing',
        }
      );

      analysisResults = await VideoAnalysisService.analyzeVideoComplete(
        tempPath,
        options
      );
      console.log('Analysis completed successfully');

      // Step 2: Upload file to your storage
      console.log('Uploading video file...');
      uploadResult = await uploadLargeFile(tempPath, originalname);

      if (!uploadResult) {
        throw new Error('Failed to upload video file');
      }

      console.log('File uploaded successfully');

      // Step 3: Update match if matchId provided
      if (matchId) {
        const match = await Match.findOne({
          _id: matchId,
          creator: userId,
        });

        if (match) {
          match.video = uploadResult.Location;
          match.analysisId = analysisResults.analysisId;
          match.analysisStatus = 'completed';
          match.analysisResults = analysisResults;
          await match.save();
        }
      }

      // Step 4: Send completion notification
      await FirebaseService.sendNotification(
        userId,
        'Analysis Complete',
        'Your video analysis has completed successfully!',
        {
          matchId: matchId,
          analysisId: analysisResults.analysisId,
          type: 'analysis_completed',
          status: 'completed',
        }
      );

      // Step 5: Clean up temp file
      fs.unlinkSync(tempPath);

      // Step 6: Return complete results with file URL
      res.status(200).json({
        status: 'success',
        message: 'Video analysis completed and file uploaded',
        data: {
          analysis: {
            analysisId: analysisResults.analysisId,
            status: 'completed',
            results: analysisResults,
          },
          upload: {
            fileUrl: uploadResult.Location,
            fileName: originalname,
          },
        },
      });
    } catch (error) {
      console.error('Complete video analysis/upload error:', error);

      // Send failure notification
      await FirebaseService.sendNotification(
        userId,
        'Analysis Failed',
        'There was an error processing your video analysis. Please try again.',
        {
          matchId: matchId,
          type: 'analysis_failed',
          error: error.message,
        }
      );

      // Clean up temp file on error
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (unlinkError) {
        console.error('Error cleaning up temp file:', unlinkError);
      }

      return next(
        new AppError(`Complete process failed: ${error.message}`, 500)
      );
    }
  }
);

// Delete analysis
export const deleteAnalysisService = catchAsync(async (req, res, next) => {
  const { analysisId } = req.params;
  const { _id: userId } = req.user;

  try {
    // Verify user owns the analysis
    const match = await Match.findOne({
      analysisId: analysisId,
      creator: userId,
    });

    if (!match) {
      return next(new AppError('Analysis not found or unauthorized', 404));
    }

    const result = await VideoAnalysisService.deleteAnalysis(analysisId);

    // Update match to remove analysis data
    match.analysisId = undefined;
    match.analysisStatus = undefined;
    match.analysisResults = undefined;
    await match.save();

    res.status(200).json({
      status: 'success',
      message: 'Analysis deleted successfully',
      data: result,
    });
  } catch (error) {
    return next(new AppError(`Delete failed: ${error.message}`, 500));
  }
});

// Check Python API health
export const checkPythonApiHealthService = catchAsync(
  async (req, res, next) => {
    try {
      const healthData = await VideoAnalysisService.checkHealth();

      res.status(200).json({
        status: 'success',
        message: 'Python API is healthy',
        data: {
          pythonApi: healthData,
          timestamp: new Date().toISOString(),
          apiUrl: PYTHON_API_BASE_URL,
        },
      });
    } catch (error) {
      // Python API is down or unhealthy
      res.status(503).json({
        status: 'error',
        message: 'Python API is unavailable',
        data: {
          error: error.message,
          timestamp: new Date().toISOString(),
          apiUrl: PYTHON_API_BASE_URL,
        },
      });
    }
  }
);

// Enhanced health check that tests multiple endpoints
export const fullHealthCheckService = catchAsync(async (req, res, next) => {
  const healthResults = {
    nodeApi: 'healthy',
    pythonApi: null,
    timestamp: new Date().toISOString(),
    details: {},
  };

  try {
    // Check Python API health
    const startTime = Date.now();
    const pythonHealth = await VideoAnalysisService.checkHealth();
    const responseTime = Date.now() - startTime;

    healthResults.pythonApi = 'healthy';
    healthResults.details.pythonApi = {
      status: pythonHealth,
      responseTime: `${responseTime}ms`,
      url: PYTHON_API_BASE_URL,
    };

    res.status(200).json({
      status: 'success',
      message: 'All services are healthy',
      data: healthResults,
    });
  } catch (error) {
    healthResults.pythonApi = 'unhealthy';
    healthResults.details.pythonApi = {
      error: error.message,
      url: PYTHON_API_BASE_URL,
    };

    res.status(503).json({
      status: 'partial',
      message: 'Some services are unavailable',
      data: healthResults,
    });
  }
});

export const testAnalysisSave = catchAsync(async (req, res, next) => {
  const { _id: userId } = req.user;

  const analysis = await processAnalysisResponse(req.body, userId);

  res.status(201).json({
    status: 'success',
    message: 'Analysis created successfully',
    data: analysis,
  });
});

export const restartAnalysisService = catchAsync(async (req, res, next) => {
  const { matchId } = req.params;

  const [match, analysisStatus] = await Promise.all([
    findOne(Match, { _id: matchId }),
    findOne(AnalysisStatus, { match_id: matchId }),
  ]);

  if (!match) {
    return next(new AppError('Match not found', 404));
  }

  const analysis = await VideoAnalysisService.restartAnalysis(matchId);

  match.analysisStatus = 'processing';
  analysisStatus.status = 'processing';

  await Promise.all([match.save(), analysisStatus.save()]);

  res.status(200).json({
    status: 'success',
    message: 'Analysis restarted successfully',
    data: analysis,
  });
});

// Export the service class for direct use
export { VideoAnalysisService };

class PlayerAnalyticsAggregator {
  /**
   * Get player averages for a specific time duration
   * @param {Object} options - Query options
   * @param {Date} options.startDate - Start date for the duration
   * @param {Date} options.endDate - End date for the duration
   * @param {Array} options.matchIds - Specific match IDs to include (optional)
   * @param {String} options.status - Analysis status filter (optional, default: 'completed')
   */
  static async getPlayerAverages(options = {}) {
    const {
      startDate,
      endDate,
      createdBy,
      matchIds,
      status = 'completed',
    } = options;

    // Build match criteria
    const matchCriteria = {
      status: status,
    };

    // Add date range filter
    if (startDate || endDate) {
      matchCriteria.createdAt = {};
      if (startDate) matchCriteria.createdAt.$gte = new Date(startDate);
      if (endDate) matchCriteria.createdAt.$lte = new Date(endDate);
    }

    // Add user filter
    if (createdBy) {
      matchCriteria.created_by = new mongoose.Types.ObjectId(createdBy);
    }

    // Add match IDs filter
    if (matchIds && matchIds.length > 0) {
      matchCriteria.match_id = {
        $in: matchIds.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    try {
      const pipeline = [
        // Match analyses based on criteria
        { $match: matchCriteria },

        // Add field to get only the first player from each analysis
        {
          $addFields: {
            first_player: { $arrayElemAt: ['$player_analytics.players', 0] },
          },
        },

        // Replace the players array with just the first player for processing
        {
          $addFields: {
            'player_analytics.players': '$first_player',
          },
        },

        // Group all first players together (since we're only looking at first player from each analysis)
        {
          $group: {
            _id: null, // Group all first players together

            // Count total analyses processed
            total_analyses: { $sum: 1 },

            // Average physical metrics
            avg_speed_kmh: {
              $avg: '$player_analytics.players.average_speed_kmh',
            },
            avg_peak_speed_kmh: {
              $avg: '$player_analytics.players.peak_speed_kmh',
            },
            max_peak_speed_kmh: {
              $max: '$player_analytics.players.peak_speed_kmh',
            },
            avg_total_distance_km: {
              $avg: '$player_analytics.players.total_distance_km',
            },
            avg_distance_from_center_km: {
              $avg: '$player_analytics.players.average_distance_from_center_km',
            },
            avg_calories_burned: {
              $avg: '$player_analytics.players.calories_burned',
            },

            // Court positioning metrics
            avg_net_dominance_percentage: {
              $avg: '$player_analytics.players.net_dominance_percentage',
            },
            avg_dead_zone_presence_percentage: {
              $avg: '$player_analytics.players.dead_zone_presence_percentage',
            },
            avg_baseline_play_percentage: {
              $avg: '$player_analytics.players.baseline_play_percentage',
            },

            // Sprint burst metrics
            total_sprint_bursts_sum: {
              $sum: '$player_analytics.players.total_sprint_bursts',
            },
            avg_sprint_bursts_per_match: {
              $avg: '$player_analytics.players.total_sprint_bursts',
            },

            // Sum and average shot statistics
            total_shots_sum: {
              $sum: '$player_analytics.players.shots.total_shots',
            },
            total_forehand_sum: {
              $sum: '$player_analytics.players.shots.forehand',
            },
            total_backhand_sum: {
              $sum: '$player_analytics.players.shots.backhand',
            },
            total_volley_sum: {
              $sum: '$player_analytics.players.shots.volley',
            },
            total_smash_sum: { $sum: '$player_analytics.players.shots.smash' },
            total_success_sum: {
              $sum: '$player_analytics.players.shots.success',
            },

            // Average shots per match
            avg_shots_per_match: {
              $avg: '$player_analytics.players.shots.total_shots',
            },
            avg_forehand_per_match: {
              $avg: '$player_analytics.players.shots.forehand',
            },
            avg_backhand_per_match: {
              $avg: '$player_analytics.players.shots.backhand',
            },
            avg_volley_per_match: {
              $avg: '$player_analytics.players.shots.volley',
            },
            avg_smash_per_match: {
              $avg: '$player_analytics.players.shots.smash',
            },

            // Collect all success rates for later calculation
            success_rates: {
              $push: '$player_analytics.players.shots.success_rate',
            },

            // Date range for reference
            first_analysis: { $min: '$createdAt' },
            last_analysis: { $max: '$createdAt' },
          },
        },

        // Add calculated fields
        {
          $addFields: {
            // Calculate overall success rate from totals
            overall_success_rate: {
              $cond: {
                if: { $gt: ['$total_shots_sum', 0] },
                then: {
                  $multiply: [
                    { $divide: ['$total_success_sum', '$total_shots_sum'] },
                    100,
                  ],
                },
                else: 0,
              },
            },

            // Calculate average success rate across matches
            avg_success_rate_per_match: { $avg: '$success_rates' },
          },
        },

        // Project final result structure
        {
          $project: {
            _id: 0,
            total_analyses: 1,
            date_range: {
              from: '$first_analysis',
              to: '$last_analysis',
            },

            // Physical performance averages
            performance_averages: {
              speed_kmh: { $round: ['$avg_speed_kmh', 2] },
              peak_speed_kmh: { $round: ['$avg_peak_speed_kmh', 2] },
              max_peak_speed_kmh: { $round: ['$max_peak_speed_kmh', 2] },
              total_distance_km: { $round: ['$avg_total_distance_km', 4] },
              distance_from_center_km: {
                $round: ['$avg_distance_from_center_km', 6],
              },
              calories_burned: { $round: ['$avg_calories_burned', 2] },
            },

            // Court positioning averages
            positioning_averages: {
              net_dominance_percentage: {
                $round: ['$avg_net_dominance_percentage', 2],
              },
              dead_zone_presence_percentage: {
                $round: ['$avg_dead_zone_presence_percentage', 2],
              },
              baseline_play_percentage: {
                $round: ['$avg_baseline_play_percentage', 2],
              },
            },

            // Sprint burst statistics
            sprint_burst_stats: {
              total_sprint_bursts: '$total_sprint_bursts_sum',
              avg_sprint_bursts_per_match: {
                $round: ['$avg_sprint_bursts_per_match', 2],
              },
            },

            // Shot statistics - totals across all matches
            shot_totals: {
              total_shots: '$total_shots_sum',
              forehand: '$total_forehand_sum',
              backhand: '$total_backhand_sum',
              volley: '$total_volley_sum',
              smash: '$total_smash_sum',
              successful_shots: '$total_success_sum',
              overall_success_rate: { $round: ['$overall_success_rate', 2] },
            },

            // Shot statistics - averages per match
            shot_averages_per_match: {
              shots_per_match: { $round: ['$avg_shots_per_match', 2] },
              forehand_per_match: { $round: ['$avg_forehand_per_match', 2] },
              backhand_per_match: { $round: ['$avg_backhand_per_match', 2] },
              volley_per_match: { $round: ['$avg_volley_per_match', 2] },
              smash_per_match: { $round: ['$avg_smash_per_match', 2] },
              success_rate_per_match: {
                $round: ['$avg_success_rate_per_match', 2],
              },
            },
          },
        },

        // No sorting needed since we have only one result
        { $limit: 1 },
      ];

      const results = await Analysis.aggregate(pipeline);

      // Calculate summary statistics
      const summary = await this.calculateSummaryStats(matchCriteria);

      return {
        summary,
        player_averages: results[0] || null,
      };
    } catch (error) {
      throw new Error(`Error calculating player averages: ${error.message}`);
    }
  }

  /**
   * Calculate summary statistics for the query period
   */
  static async calculateSummaryStats(matchCriteria) {
    const summaryPipeline = [
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          total_analyses: { $sum: 1 },
          total_duration_minutes: {
            $sum: '$player_analytics.metadata.duration_minutes',
          },
          avg_duration_minutes: {
            $avg: '$player_analytics.metadata.duration_minutes',
          },
          unique_matches: { $addToSet: '$match_id' },
          date_range: {
            $push: '$createdAt',
          },
        },
      },
      {
        $addFields: {
          unique_match_count: { $size: '$unique_matches' },
          earliest_date: { $min: '$date_range' },
          latest_date: { $max: '$date_range' },
        },
      },
      {
        $project: {
          _id: 0,
          total_analyses: 1,
          unique_matches: '$unique_match_count',
          total_duration_minutes: { $round: ['$total_duration_minutes', 2] },
          avg_duration_minutes: { $round: ['$avg_duration_minutes', 2] },
          date_range: {
            from: '$earliest_date',
            to: '$latest_date',
          },
        },
      },
    ];

    const summaryResult = await Analysis.aggregate(summaryPipeline);
    return summaryResult[0] || {};
  }

  /**
   * Get averages for the first player from each analysis
   */
  static async getFirstPlayerAverages(playerColor, options = {}) {
    const results = await this.getPlayerAverages(options);
    return results.first_player_averages;
  }

  /**
   * Compare first player performance across different time periods
   */
  static async compareFirstPlayerPerformance(period1, period2) {
    const [performance1, performance2] = await Promise.all([
      this.getFirstPlayerAverages(null, period1),
      this.getFirstPlayerAverages(null, period2),
    ]);

    if (!performance1 || !performance2) {
      throw new Error('First player data not found for one or both periods');
    }

    // Calculate percentage changes
    const comparison = {
      period1: { ...period1, data: performance1 },
      period2: { ...period2, data: performance2 },
      improvements: {
        speed_change_percent: this.calculatePercentageChange(
          performance1.performance_averages.speed_kmh,
          performance2.performance_averages.speed_kmh
        ),
        success_rate_change_percent: this.calculatePercentageChange(
          performance1.shot_totals.overall_success_rate,
          performance2.shot_totals.overall_success_rate
        ),
        shots_per_match_change_percent: this.calculatePercentageChange(
          performance1.shot_averages_per_match.shots_per_match,
          performance2.shot_averages_per_match.shots_per_match
        ),
      },
    };

    return comparison;
  }

  static calculatePercentageChange(oldValue, newValue) {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return Math.round(((newValue - oldValue) / oldValue) * 100 * 100) / 100;
  }

  /**
   * Get percentage change between the last two matches/analyses
   * @param {Object} options - Query options
   * @param {String} options.createdBy - User ID to filter analyses
   * @param {String} options.status - Analysis status filter (optional, default: 'completed')
   */
  static async getLastTwoMatchesComparison(options = {}) {
    const { createdBy, status = 'completed' } = options;

    // Build match criteria
    const matchCriteria = {
      status: status,
    };

    // Add user filter
    if (createdBy) {
      matchCriteria.created_by = new mongoose.Types.ObjectId(createdBy);
    }

    try {
      // Get the last two analyses
      const lastTwoAnalyses = await Analysis.find(matchCriteria)
        .sort({ createdAt: -1 })
        .limit(2)
        .select('player_analytics createdAt match_id');

      if (lastTwoAnalyses.length < 2) {
        throw new Error(
          'Not enough analyses found. Need at least 2 matches for comparison.'
        );
      }

      const [latest, previous] = lastTwoAnalyses;

      // Extract first player data from each analysis
      const latestPlayer = latest.player_analytics.players[0];
      const previousPlayer = previous.player_analytics.players[0];

      if (!latestPlayer || !previousPlayer) {
        throw new Error('Player data not found in one or both analyses');
      }

      // Calculate percentage changes
      const comparison = {
        latest_match: {
          match_id: latest.match_id,
          date: latest.createdAt,
          data: {
            speed_kmh: latestPlayer.average_speed_kmh,
            total_distance_km: latestPlayer.total_distance_km,
            distance_from_center_km:
              latestPlayer.average_distance_from_center_km,
            calories_burned: latestPlayer.calories_burned,
            total_shots: latestPlayer.shots.total_shots,
            successful_shots: latestPlayer.shots.success,
            success_rate: latestPlayer.shots.success_rate,
            forehand: latestPlayer.shots.forehand,
            backhand: latestPlayer.shots.backhand,
            volley: latestPlayer.shots.volley,
            smash: latestPlayer.shots.smash,
          },
        },
        previous_match: {
          match_id: previous.match_id,
          date: previous.createdAt,
          data: {
            speed_kmh: previousPlayer.average_speed_kmh,
            total_distance_km: previousPlayer.total_distance_km,
            distance_from_center_km:
              previousPlayer.average_distance_from_center_km,
            calories_burned: previousPlayer.calories_burned,
            total_shots: previousPlayer.shots.total_shots,
            successful_shots: previousPlayer.shots.success,
            success_rate: previousPlayer.shots.success_rate,
            forehand: previousPlayer.shots.forehand,
            backhand: previousPlayer.shots.backhand,
            volley: previousPlayer.shots.volley,
            smash: previousPlayer.shots.smash,
          },
        },
        percentage_changes: {
          speed_change: this.calculatePercentageChange(
            previousPlayer.average_speed_kmh,
            latestPlayer.average_speed_kmh
          ),
          distance_change: this.calculatePercentageChange(
            previousPlayer.total_distance_km,
            latestPlayer.total_distance_km
          ),
          center_distance_change: this.calculatePercentageChange(
            previousPlayer.average_distance_from_center_km,
            latestPlayer.average_distance_from_center_km
          ),
          calories_change: this.calculatePercentageChange(
            previousPlayer.calories_burned,
            latestPlayer.calories_burned
          ),
          shots_change: this.calculatePercentageChange(
            previousPlayer.shots.total_shots,
            latestPlayer.shots.total_shots
          ),
          successful_shots_change: this.calculatePercentageChange(
            previousPlayer.shots.success,
            latestPlayer.shots.success
          ),
          success_rate_change: this.calculatePercentageChange(
            previousPlayer.shots.success_rate,
            latestPlayer.shots.success_rate
          ),
          forehand_change: this.calculatePercentageChange(
            previousPlayer.shots.forehand,
            latestPlayer.shots.forehand
          ),
          backhand_change: this.calculatePercentageChange(
            previousPlayer.shots.backhand,
            latestPlayer.shots.backhand
          ),
          volley_change: this.calculatePercentageChange(
            previousPlayer.shots.volley,
            latestPlayer.shots.volley
          ),
          smash_change: this.calculatePercentageChange(
            previousPlayer.shots.smash,
            latestPlayer.shots.smash
          ),
        },
        summary: {
          improved_metrics: [],
          declined_metrics: [],
          unchanged_metrics: [],
        },
      };

      // Categorize improvements/declines
      Object.entries(comparison.percentage_changes).forEach(
        ([metric, change]) => {
          if (change > 0) {
            comparison.summary.improved_metrics.push({
              metric: metric.replace('_change', ''),
              change: `+${change}%`,
            });
          } else if (change < 0) {
            comparison.summary.declined_metrics.push({
              metric: metric.replace('_change', ''),
              change: `${change}%`,
            });
          } else {
            comparison.summary.unchanged_metrics.push({
              metric: metric.replace('_change', ''),
              change: '0%',
            });
          }
        }
      );

      return comparison;
    } catch (error) {
      throw new Error(`Error comparing last two matches: ${error.message}`);
    }
  }
}

export const playerAverageService = catchAsync(async (req, res, next) => {
  const { startDate, endDate, matchIds } = req.query;
  const { _id: userId } = req.user;

  try {
    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      createdBy: userId,
      matchIds: matchIds ? matchIds.split(',') : undefined,
    };

    const averages = await PlayerAnalyticsAggregator.getPlayerAverages(options);

    res.status(200).json({
      status: 'success',
      data: averages,
    });
  } catch (error) {
    return next(
      new AppError(`Failed to get player averages: ${error.message}`, 500)
    );
  }
});

export const lastTwoMatchesComparisonService = catchAsync(
  async (req, res, next) => {
    const { _id: userId } = req.user;

    try {
      const options = {
        createdBy: userId,
      };

      const comparison =
        await PlayerAnalyticsAggregator.getLastTwoMatchesComparison(options);

      res.status(200).json({
        status: 'success',
        data: comparison,
      });
    } catch (error) {
      return next(
        new AppError(
          `Failed to get last two matches comparison: ${error.message}`,
          500
        )
      );
    }
  }
);

// Usage examples:

// Example 1: Get first player averages for last 30 days
async function getLastMonthFirstPlayerAverages() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return await PlayerAnalyticsAggregator.getPlayerAverages({
    startDate: thirtyDaysAgo,
    endDate: new Date(),
    status: 'completed',
  });
}

// Example 2: Get first player averages for specific user
async function getUserFirstPlayerAverages(userId) {
  return await PlayerAnalyticsAggregator.getPlayerAverages({
    createdBy: userId,
    status: 'completed',
  });
}

// Example 3: Compare first player performance between two periods
async function compareFirstPlayerImprovement() {
  const lastMonth = {
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-30'),
  };

  const thisMonth = {
    startDate: new Date('2025-07-01'),
    endDate: new Date('2025-07-31'),
  };

  return await PlayerAnalyticsAggregator.compareFirstPlayerPerformance(
    lastMonth,
    thisMonth
  );
}

export { PlayerAnalyticsAggregator };
