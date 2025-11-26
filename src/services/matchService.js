import { createOne, deleteOne, findOne, getAll } from '../factory/repo.js';
import { findOneAndUpdate } from '../factory/userRepo.js';
import Match from '../models/Match.js';
import AppError from '../utils/appError.js';
import catchAsync from '../utils/catchAsync.js';
import fs from 'fs';
import { uploadLargeFile } from './s3UploadService.js';
import matchNotificationService from './matchNotificationService.js';
import { VideoAnalysisService } from './analysisService.js';
import AnalysisStatus from '../models/AnalysisStatus.js';
import Analysis from '../models/Analysis.js';
import mongoose from 'mongoose';
import Follow from '../models/Follow.js';
import User from '../models/User.js';
import {
  checkUserAnalysisQuota,
  filterAnalysisResultsBySubscription,
  getProcessingMessage,
} from '../utils/subscriptionUtils.js';
import analysisStatusCron from './cronService.js';

export const createMatchServiceService = catchAsync(async (req, res, next) => {
  const match = await createOne(Match, req.body);

  // Send notification using the dedicated service
  await matchNotificationService.notifyMatchCreated(req.user._id, match);

  res.status(201).json({
    status: 'success',
    data: {
      match,
    },
  });
});

// export const getMatchService = catchAsync(async (req, res, next) => {
//   const { _id: userId } = req.user;

//   console.log({ userId: userId.toString() });

//   const [match, analysisStatus] = await Promise.all([
//     findOne(
//       Match,
//       {
//         _id: req.params.matchId,
//       },
//       [
//         { path: 'analysisStatusId' },
//         {
//           path: 'creator',
//           populate: {
//             path: 'subscription',
//             model: 'Subscription',
//           },
//         },
//       ]
//     ),
//     findOne(AnalysisStatus, { match_id: req.params.matchId }),
//   ]);

//   if (!match) return next(new AppError('No match found', 404));
//   // console.log(
//   //   'Creator Id:',
//   //   match.creator.id.toString() == userId.toString(),
//   //   match
//   // );

//   if (!match.public && userId.toString() != match.creator.id.toString()) {
//     console.log(userId.toString(), match.creator.id.toString());
//     return next(
//       new AppError(
//         "You are not authorized to view this match because it's not made public",
//         403
//       )
//     );
//   }

//   if (!match.fetchedPlayerData) {
//     console.log('Player data not fetched yet');

//     const fetchPlayerJSON = await VideoAnalysisService.fetchPlayers({
//       video: match.video,
//     });

//     console.log({ fetchPlayerJSON });

//     const fetchPlayerResult = await fetchPlayerJSON.json();

//     match.players = fetchPlayerResult.players;
//     match.fetchedPlayerData =
//       fetchPlayerResult[0] != 'not found' ? true : false;

//     await match.save();

//     console.log('Fetch player result:', fetchPlayerResult);
//   }

//   const quotaCheck = await checkUserAnalysisQuota(req.user);

//   if (!match.analysisStatus && match.formattedPlayerData) {
//     try {
//       // Check subscription quota before auto-starting analysis

//       if (quotaCheck.canAnalyze) {
//         await startVideoAnalysis(
//           match,
//           req.user._id,
//           req.body,
//           quotaCheck.priority
//         );
//         match.analysisStatus = 'processing';
//       } else {
//         // Don't auto-start if quota exceeded
//         console.log('Auto-analysis skipped: quota exceeded');
//         await matchNotificationService.notifyAnalysisError(
//           req.user._id,
//           match,
//           'Auto-analysis failed to start. You have exceeded your quota for this week.'
//         );
//       }
//     } catch (analysisError) {
//       console.error('Auto-analysis failed:', analysisError);
//       await matchNotificationService.notifyAnalysisError(
//         req.user._id,
//         match,
//         'Auto-analysis failed to start. You can try again manually.'
//       );
//     }
//   }

//   if (match.analysisStatus === 'failed') {
//     try {
//       // Use analysisId (job_id) instead of match._id for restart
//       await VideoAnalysisService.restartAnalysis(match.analysisId || match._id);

//       match.analysisStatus = 'processing';
//       if (analysisStatus) {
//         analysisStatus.status = 'processing';
//         await analysisStatus.save();
//       }

//       await matchNotificationService.notifyAnalysisRestart(req.user._id, match);
//     } catch (analysisError) {
//       await matchNotificationService.notifyAnalysisError(
//         req.user._id,
//         match,
//         'Failed to restart analysis. Please try again manually.'
//       );
//       console.error('Error restarting analysis:', analysisError);
//     }
//   }

//   if (
//     match.analysisStatus === 'processing' ||
//     match.analysisStatus === 'pending'
//   ) {
//     await analysisStatusCron.checkSingleAnalysis(match);
//   }

//   await match.save();

//   let analysis = await findOne(Analysis, { match_id: match._id });

//   // Filter analysis results based on match creator's subscription and serialize properly
//   if (analysis) {
//     // Convert Mongoose document to plain object to avoid internal properties
//     const analysisObj = analysis.toObject ? analysis.toObject() : analysis;
//     // Use match creator's subscription, not the viewer's
//     analysis = filterAnalysisResultsBySubscription(analysisObj, match.creator);
//   }

//   res.status(200).json({
//     status: 'success',
//     message:
//       !quotaCheck.canAnalyze && match.analysisStatus != 'completed'
//         ? 'Match analysis failed to start. You have exceeded your quota for this week.'
//         : match.analysisStatus === 'failed'
//         ? 'Match analysis failed, restarting now...'
//         : match.analysisStatus === 'processing' ||
//           match.analysisStatus === 'pending'
//         ? 'Match analysis is still processing...'
//         : 'Match analysis completed successfully.',
//     data: {
//       match,
//       analysis,
//     },
//   });
// });

// Shared async processing function (same as before)

export const getMatchService = catchAsync(async (req, res, next) => {
  const { _id: userId } = req.user;

  const [match, analysisStatus] = await Promise.all([
    findOne(
      Match,
      {
        _id: req.params.matchId,
      },
      [
        { path: 'analysisStatusId' },
        {
          path: 'creator',
          populate: {
            path: 'subscription',
            model: 'Subscription',
          },
        },
      ]
    ),
    findOne(AnalysisStatus, { match_id: req.params.matchId }),
  ]);

  if (!match) return next(new AppError('No match found', 404));

  if (!match.public && userId.toString() != match.creator.id.toString()) {
    return next(
      new AppError(
        "You are not authorized to view this match because it's not made public",
        403
      )
    );
  }

  // Player detection is now handled by:
  // 1. Upload service (quick attempt with 10s timeout)
  // 2. Cron job (background processing and retry)
  // Just return current status - no synchronous fetching

  // Reset retry count if max retries reached and match is viewed
  // This allows cron to retry when AI server comes back online
  const MAX_RETRIES = 10;
  if (
    match.playerDetectionStatus === 'processing' &&
    match.playerDetectionRetryCount >= MAX_RETRIES
  ) {
    console.log(
      `Resetting retry count for match ${match._id} (was at ${match.playerDetectionRetryCount}/${MAX_RETRIES}) due to match view`
    );
    match.playerDetectionRetryCount = 0;
    match.playerDetectionStartedAt = new Date(); // Reset start time too
    await match.save();
  }

  // Reset failed player detection back to processing when viewed
  // This gives it another chance when AI server comes back online
  if (
    match.playerDetectionStatus === 'failed' &&
    match.playerDetectionRetryCount >= MAX_RETRIES &&
    match.video // Only if video exists
  ) {
    console.log(
      `Resetting failed player detection for match ${match._id} back to processing due to match view`
    );
    match.playerDetectionStatus = 'processing';
    match.playerDetectionRetryCount = 0;
    match.playerDetectionStartedAt = new Date();
    match.playerDetectionError = null;
    await match.save();
  }

  const quotaCheck = await checkUserAnalysisQuota(req.user);

  // Only auto-start analysis if player detection is completed
  if (
    !match.analysisStatus &&
    match.formattedPlayerData &&
    match.playerDetectionStatus === 'completed'
  ) {
    try {
      if (quotaCheck.canAnalyze) {
        await startVideoAnalysis(
          match,
          req.user._id,
          req.body,
          quotaCheck.priority
        );
        match.analysisStatus = 'processing';
      } else {
        console.log('Auto-analysis skipped: quota exceeded');
        await matchNotificationService.notifyAnalysisError(
          req.user._id,
          match,
          'Auto-analysis failed to start. You have exceeded your quota for this week.'
        );
      }
    } catch (analysisError) {
      console.error('Auto-analysis failed:', analysisError);
      await matchNotificationService.notifyAnalysisError(
        req.user._id,
        match,
        'Auto-analysis failed to start. You can try again manually.'
      );
    }
  }

  if (match.analysisStatus === 'failed') {
    try {
      await VideoAnalysisService.restartAnalysis(match.analysisId || match._id);
      match.analysisStatus = 'processing';

      if (analysisStatus) {
        analysisStatus.status = 'processing';
        await analysisStatus.save();
      }

      await matchNotificationService.notifyAnalysisRestart(req.user._id, match);
    } catch (analysisError) {
      await matchNotificationService.notifyAnalysisError(
        req.user._id,
        match,
        'Failed to restart analysis. Please try again manually.'
      );
      console.error('Error restarting analysis:', analysisError);
    }
  }

  // Reset 'not_found' analysis status when viewed (happens when AI server was down)
  // This allows the analysis to be restarted when server comes back online
  if (match.analysisStatus === 'not_found' && match.video) {
    console.log(
      `Resetting not_found analysis for match ${match._id} due to match view`
    );
    match.analysisStatus = 'failed'; // Set to failed so it can be restarted
    await match.save();
  }

  if (
    match.analysisStatus === 'processing' ||
    match.analysisStatus === 'pending'
  ) {
    console.log('We got called');
    await analysisStatusCron.checkSingleAnalysis(match);
  }

  await match.save();

  let analysis = await findOne(Analysis, { match_id: match._id });

  if (analysis) {
    const analysisObj = analysis.toObject ? analysis.toObject() : analysis;
    analysis = filterAnalysisResultsBySubscription(analysisObj, match.creator);
  }

  // Build comprehensive status message
  let message = 'Match retrieved successfully.';

  if (match.playerDetectionStatus === 'processing') {
    message = 'Match retrieved. Player detection is in progress...';
  } else if (match.playerDetectionStatus === 'failed') {
    message =
      'Match retrieved. Player detection failed. Our system will retry automatically.';
  } else if (!quotaCheck.canAnalyze && match.analysisStatus != 'completed') {
    message =
      'Match analysis failed to start. You have exceeded your quota for this week.';
  } else if (match.analysisStatus === 'failed') {
    message = 'Match analysis failed, restarting now...';
  } else if (
    match.analysisStatus === 'processing' ||
    match.analysisStatus === 'pending'
  ) {
    message = 'Match analysis is still processing...';
  } else if (match.analysisStatus === 'completed') {
    message = 'Match analysis completed successfully.';
  }

  res.status(200).json({
    status: 'success',
    message,
    data: {
      match,
      analysis,
      processingStatus: {
        playerDetection: {
          status: match.playerDetectionStatus || 'not_started',
          playersFound: match.players?.length || 0,
          startedAt: match.playerDetectionStartedAt,
          completedAt: match.playerDetectionCompletedAt,
          error: match.playerDetectionError,
        },
        analysis: {
          status: match.analysisStatus || 'not_started',
          analysisId: match.analysisId,
        },
      },
    },
  });
});

async function processPlayersAsync(matchId, videoUrl) {
  try {
    console.log(`Starting player detection for match ${matchId}`);

    const fetchPlayerJSON = await VideoAnalysisService.fetchPlayers({
      video: videoUrl,
    });

    const fetchPlayerResult = await fetchPlayerJSON.json();

    const match = await Match.findById(matchId);
    if (!match) {
      console.error('Match not found during player detection update');
      return;
    }

    match.players = fetchPlayerResult.players || [];
    match.fetchedPlayerData =
      fetchPlayerResult[0] != 'not found' && match.players.length > 0;
    match.playerDetectionStatus = 'completed';
    match.playerDetectionCompletedAt = new Date();

    await match.save();

    console.log(`Player detection completed for match ${matchId}:`, {
      playersFound: match.players.length,
      fetchedPlayerData: match.fetchedPlayerData,
    });

    // Notify user of completion
    await matchNotificationService.notifyPlayerDetectionComplete(
      match.creator,
      match,
      match.players
    );
  } catch (error) {
    console.error('Player detection failed:', error);

    try {
      await Match.findByIdAndUpdate(matchId, {
        playerDetectionStatus: 'failed',
        playerDetectionError: error.message,
      });

      const match = await Match.findById(matchId);
      if (match) {
        await matchNotificationService.notifyPlayerDetectionFailed(
          match.creator,
          match,
          error.message
        );
      }
    } catch (updateError) {
      console.error('Failed to update match with error status:', updateError);
    }
  }
}

export const getAllMatchesService = catchAsync(async (req, res, next) => {
  const { _id: userId } = req.user;
  req.query.creator = userId;

  const matches = await Match.aggregate([
    {
      $match: {
        creator: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $lookup: {
        from: 'analyses',
        let: {
          matchAnalysisId: '$analysisId',
          matchObjectId: '$_id',
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$match_id', '$$matchAnalysisId'] },
                  { $eq: ['$match_id', { $toString: '$$matchObjectId' }] },
                ],
              },
            },
          },
        ],
        as: 'analysis',
      },
    },
    {
      $addFields: {
        firstPlayer: {
          $let: {
            vars: { analysisDoc: { $arrayElemAt: ['$analysis', 0] } },
            in: {
              $cond: {
                if: { $ne: ['$$analysisDoc', null] },
                then: {
                  $arrayElemAt: [
                    '$$analysisDoc.player_analytics.players',
                    { $ifNull: ['$creatorPlayerIndex', 0] },
                  ],
                },
                else: null,
              },
            },
          },
        },
      },
    },
    { $unset: 'analysis' },
  ]);

  res.status(200).json({
    status: 'success',
    length: matches.length,
    data: {
      matches,
    },
  });
});

export const getUserMatchesService = catchAsync(async (req, res, next) => {
  const matches = await Match.aggregate([
    {
      $match: {
        creator: new mongoose.Types.ObjectId(req.query.userId),
        analysisStatus: 'completed',
      },
    },
    {
      $lookup: {
        from: 'analyses',
        let: {
          matchAnalysisId: '$analysisId',
          matchObjectId: '$_id',
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$match_id', '$$matchAnalysisId'] },
                  { $eq: ['$match_id', { $toString: '$$matchObjectId' }] },
                ],
              },
            },
          },
        ],
        as: 'analysis',
      },
    },
    {
      $addFields: {
        firstPlayer: {
          $let: {
            vars: { analysisDoc: { $arrayElemAt: ['$analysis', 0] } },
            in: {
              $cond: {
                if: { $ne: ['$$analysisDoc', null] },
                then: {
                  $arrayElemAt: [
                    '$$analysisDoc.player_analytics.players',
                    { $ifNull: ['$creatorPlayerIndex', 0] },
                  ],
                },
                else: null,
              },
            },
          },
        },
      },
    },
    { $unset: 'analysis' },
    // {
    //   $project: {
    //     format: 1,
    //     type: 1,
    //     teams: 1,
    //     location: 1,
    //     analysisStatus: 1,
    //     firstPlayer: 1,
    //     createdAt: 1,
    //     updatedAt: 1,
    //   },
    // },
  ]);

  res.status(200).json({
    status: 'success',
    length: matches.length,
    data: { matches },
  });
});

export const updateMatchService = catchAsync(async (req, res, next) => {
  const match = await findOneAndUpdate(
    Match,
    { _id: req.params.matchId, creator: req.user._id },
    req.body
  );

  if (!match)
    return next(
      new AppError(
        'No match found or you are not authorized to update this match',
        404
      )
    );

  // Send notification using the dedicated service
  await matchNotificationService.notifyMatchUpdated(req.user._id, match);

  res.status(200).json({
    status: 'success',
    data: {
      match,
    },
  });
});

export const deleteMatchService = catchAsync(async (req, res, next) => {
  const match = await deleteOne(Match, {
    _id: req.params.matchId,
    creator: req.user._id,
  });

  if (!match)
    return next(
      new AppError(
        'No match found or you are not authorized to delete this match',
        404
      )
    );

  // Send notification using the dedicated service
  await matchNotificationService.notifyMatchDeleted(
    req.user._id,
    req.params.matchId
  );

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// export const uploadVideoService = catchAsync(async (req, res, next) => {
//   try {
//     // Validate an uploaded file exists
//     if (!req.file) return next(new AppError('No file uploaded', 400));

//     const { path: tempPath, originalname } = req.file;

//     const match = await findOne(Match, {
//       _id: req.body.matchId,
//       creator: req.user._id,
//     });

//     console.log({ match });

//     if (!match) return next(new AppError('Match not found', 404));

//     if (match.video && match.players.length > 0)
//       return next(
//         new AppError('Match already has a video attached to it', 400)
//       );

//     // Core Upload Execution

//     if (!match.video) {
//       result = await uploadLargeFile(tempPath, originalname);
//       // Use async unlink and ensure cleanup even on failures
//       try {
//         if (tempPath) await fs.promises.unlink(tempPath);
//       } catch (e) {
//         // Log and continue if temp file can't be removed (don't crash the request)
//         console.warn('Failed to remove temp file:', e.message || e);
//       }

//       match.video = result.Location;

//       // Send notification using the dedicated service
//       await matchNotificationService.notifyVideoUploaded(
//         req.user._id,
//         match,
//         result.Location
//       );

//       console.log('We got here after uploading!', match.video);
//     }

//     // Fetch lightweight player info but don't block the response for a slow external service.
//     // We'll wait a short time (timeout) and if it doesn't return, respond immediately
//     const fetchPlayers = VideoAnalysisService.fetchPlayers({
//       video: match.video,
//     });

//     const withTimeout = (p, ms) =>
//       Promise.race([
//         p,
//         new Promise((_, rej) =>
//           setTimeout(() => rej(new Error('timeout')), ms)
//         ),
//       ]);

//     let fetchPlayerResult = null;
//     try {
//       // wait up to 8 seconds for a quick response; otherwise continue without it
//       fetchPlayerResult = await withTimeout(fetchPlayers, 8000);
//     } catch (e) {
//       // If timed out or errored, log and continue. The background task (fetchPlayers) may still complete.
//       console.warn(
//         'fetchPlayers did not complete in time or errored:',
//         e.message || e
//       );
//       // prevent unhandled rejection if the original promise later rejects
//       fetchPlayers.catch((err) =>
//         console.warn('fetchPlayers (background) error:', err)
//       );
//     }

//     // If the service returned a raw fetch Response, parse it to JSON here so the API returns usable data.
//     if (fetchPlayerResult && typeof fetchPlayerResult.json === 'function') {
//       try {
//         fetchPlayerResult = await fetchPlayerResult.json();
//       } catch (err) {
//         console.warn(
//           'Failed to parse fetchPlayers response body:',
//           err && err.message ? err.message : err
//         );
//         fetchPlayerResult = null;
//       }
//     }

//     console.log('Fetch player result:', fetchPlayerResult);

//     // Safely set players if the parsed result contains them
//     match.players = (fetchPlayerResult && fetchPlayerResult.players) || [];
//     match.fetchedPlayerData =
//       match.players.length ===
//       match.teams[0].players.length + match.teams[1].players.length
//         ? true
//         : false;
//     await match.save();

//     res.status(200).json({
//       status: 'success',
//       message: 'Uploaded successfully',
//       data: {
//         match,
//         fetchPlayerResult,
//       },
//     });
//   } catch (error) {
//     console.error('Upload failed:', error);
//     await matchNotificationService.notifyUploadError(
//       req.user._id,
//       req.body.matchId,
//       'There was an error uploading your video. Please try again.'
//     );
//     res.status(500).json({ error: 'Upload failed' });
//   }
// });

export const uploadVideoService = catchAsync(async (req, res, next) => {
  try {
    if (!req.file) return next(new AppError('No file uploaded', 400));

    const { path: tempPath, originalname } = req.file;

    const match = await findOne(Match, {
      _id: req.body.matchId,
      creator: req.user._id,
    });

    if (!match) return next(new AppError('Match not found', 404));

    if (match.video && match.players.length > 0) {
      return next(
        new AppError('Match already has a video attached to it', 400)
      );
    }

    // Upload video
    if (!match.video) {
      const result = await uploadLargeFile(tempPath, originalname);

      try {
        if (tempPath) await fs.promises.unlink(tempPath);
      } catch (e) {
        console.warn('Failed to remove temp file:', e.message || e);
      }

      match.video = result.Location;
      await matchNotificationService.notifyVideoUploaded(
        req.user._id,
        match,
        result.Location
      );
    }

    console.log('Outside the loop, just to ');

    // Set processing status
    match.playerDetectionStatus = 'processing';
    match.playerDetectionStartedAt = new Date();
    match.playerDetectionRetryCount = 0; // Reset retry count for new upload
    await match.save();

    console.log(
      `Video uploaded for match ${match._id}. Player detection will be handled by cron.`
    );

    // Respond immediately
    res.status(200).json({
      status: 'success',
      message: 'Video uploaded successfully. Player detection in progress.',
      data: {
        match,
        playerDetectionStatus: 'processing',
      },
    });
  } catch (error) {
    console.error('Upload failed:', error);
    await matchNotificationService.notifyUploadError(
      req.user._id,
      req.body.matchId,
      'There was an error uploading your video. Please try again.'
    );
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Helper function to process player results (used by cron)
async function processPlayersResult(matchId, fetchPlayerResult) {
  try {
    const match = await Match.findById(matchId);
    if (!match) {
      console.error('Match not found during player detection update');
      return;
    }

    if (match.playerDetectionStatus === 'completed') {
      console.log(`Match ${matchId} already processed, skipping`);
      return;
    }

    match.players = fetchPlayerResult.players || [];
    match.fetchedPlayerData =
      fetchPlayerResult[0] != 'not found' && match.players.length > 0;
    match.playerDetectionStatus = 'completed';
    match.playerDetectionCompletedAt = new Date();

    await match.save();

    await matchNotificationService.notifyPlayerDetectionComplete(
      match.creator,
      match,
      match.players
    );

    console.log(
      `Player detection completed for match ${matchId}: ${match.players.length} players found`
    );
  } catch (error) {
    console.error('Error processing player results:', error);
    await updatePlayerDetectionError(matchId, error.message);
  }
}

// Helper function to update error status
async function updatePlayerDetectionError(matchId, errorMessage) {
  try {
    const match = await Match.findByIdAndUpdate(
      matchId,
      {
        playerDetectionStatus: 'failed',
        playerDetectionError: errorMessage,
      },
      { new: true }
    );

    if (match) {
      await matchNotificationService.notifyPlayerDetectionFailed(
        match.creator,
        match,
        errorMessage
      );
    }
  } catch (error) {
    console.error('Failed to update error status:', error);
  }
}

// Export helper functions for use by cron
// export { processPlayersResult, updatePlayerDetectionError };

// Full async processing (for retries or when quick attempt fails badly)
// async function processPlayersAsync(matchId, videoUrl) {
//   try {
//     console.log(`Starting player detection for match ${matchId}`);

//     const fetchPlayerJSON = await VideoAnalysisService.fetchPlayers({
//       video: videoUrl,
//     });

//     const fetchPlayerResult = await fetchPlayerJSON.json();
//     await processPlayersResult(matchId, fetchPlayerResult);
//   } catch (error) {
//     console.error('Player detection failed:', error);
//     await updatePlayerDetectionError(matchId, error.message);
//   }
// }

export const analyzeVideosService = catchAsync(async (req, res, next) => {
  const { matchId } = req.params;

  if (!req.body.playersData || req.body.playersData.length === 0)
    return next(
      new AppError(
        'No player data provided, this has to be provided to continue',
        400
      )
    );

  const quotaCheck = await checkUserAnalysisQuota(req.user);

  const match = await findOne(Match, {
    _id: matchId,
    creator: req.user._id,
  });

  if (!match) return next(new AppError('Match not found', 404));

  if (!match.video)
    return next(
      new AppError('Match does not have a video attached to it', 400)
    );

  if (!quotaCheck.canAnalyze) {
    return next(
      new AppError(
        `You have reached your weekly limit of ${quotaCheck.totalAllowed} match analysis. Upgrade to Pro for more analyses.`,
        403
      )
    );
  }

  match.players = req.body.playersData;
  match.formattedPlayerData = true;

  // Set creator player index with fallback strategy:
  // 1. Use index sent by mobile (most reliable - mobile knows which player is creator)
  // 2. Try to find creator by matching player_id with match.creator
  // 3. Default to 0 (backward compatible)

  if (
    req.body.creatorPlayerIndex !== undefined &&
    req.body.creatorPlayerIndex !== null &&
    req.body.creatorPlayerIndex >= 0
  ) {
    // Mobile explicitly told us which player is the creator
    match.creatorPlayerIndex = req.body.creatorPlayerIndex;
  } else {
    // Fallback: Try to find creator by matching IDs
    const creatorId = match.creator.toString();
    const creatorIndex = req.body.playersData.findIndex(
      (player) => player.player_id && player.player_id.toString() === creatorId
    );

    if (creatorIndex !== -1) {
      match.creatorPlayerIndex = creatorIndex;
    }
    // If still not found, creatorPlayerIndex remains at default 0
  }

  await match.save();

  try {
    await startVideoAnalysis(
      match,
      req.user._id,
      req.body,
      quotaCheck.priority
    );
  } catch (analysisError) {
    console.error('Auto-analysis failed:', analysisError);
    await matchNotificationService.notifyAnalysisError(
      req.user._id,
      match,
      'There was an error analyzing your video. Please try again.'
    );
  }

  res.status(200).json({
    status: 'success',
    message: 'Analysis started successfully',
    data: {
      match,
      remainingAnalyses:
        quotaCheck.remainingAnalyses > 0 ? quotaCheck.remainingAnalyses - 1 : 0,
      // processingMessage: getProcessingMessage(quotaCheck.priority),
    },
  });
});

// Enhanced analysis function with comprehensive notifications
const startVideoAnalysis = async (
  match,
  userId,
  requestBody,
  priority = 'standard'
) => {
  try {
    // Notify that analysis is starting
    await matchNotificationService.notifyAnalysisStarting(userId, match);

    console.log('Player color:', generateColorString(match));
    console.log('Processing priority:', priority);

    const analysisResult = await VideoAnalysisService.analyzeVideo({
      video_path: match.video, // New API only needs video URL,
      players_data: requestBody.playersData
        ? requestBody.playersData
        : match.players,
    });

    if (!analysisResult || !analysisResult.job_id) {
      throw new Error('Analysis failed to start');
    }

    const analysisStatus = await createOne(AnalysisStatus, {
      match_id: match._id,
      status: 'processing', // Set initial status
      message: 'Analysis started successfully',
    });

    // Update match with analysis info - store job_id as analysisId
    match.analysisId = analysisResult.job_id;
    match.analysisStatus = 'processing';
    match.analysisStatusId = analysisStatus._id;
    await match.save();
    await match.populate('analysisStatusId');

    // Notify that analysis has started successfully
    await matchNotificationService.notifyAnalysisStarted(
      userId,
      match,
      analysisResult.job_id
    );

    return analysisResult;
  } catch (error) {
    console.error('Analysis startup error:', error);
    await matchNotificationService.notifyAnalysisError(
      userId,
      match,
      `Failed to start analysis: ${error.message}`
    );
    throw error;
  }
};

// Helper function for color generation
// function generateColorString(match) {
//   return match.playerColor || 'blue';
// }

// Additional service functions for handling analysis completion
// This would typically be called from a webhook or background job
export const handleAnalysisCompletion = catchAsync(
  async (analysisId, matchId, status) => {
    const match = await findOne(Match, { _id: matchId });
    if (!match) return;

    if (status === 'completed') {
      await matchNotificationService.notifyAnalysisCompleted(
        match.creator,
        match,
        analysisId
      );
    } else if (status === 'failed') {
      await matchNotificationService.notifyAnalysisError(
        match.creator,
        match,
        'Analysis failed to complete. Please try again.'
      );
    }
  }
);

// Function to handle analysis progress updates
export const handleAnalysisProgress = catchAsync(async (matchId, progress) => {
  const match = await findOne(Match, { _id: matchId });
  if (!match) return;

  // Only send progress notifications at certain intervals (e.g., every 25%)
  if (progress % 25 === 0 && progress > 0 && progress < 100) {
    await matchNotificationService.notifyAnalysisProgress(
      match.creator,
      match,
      progress
    );
  }
});

export const getUserProfileService = catchAsync(async (req, res, next) => {
  const userId = req.query.userId || req.user._id;

  const user = await findOne(User, { _id: userId });

  if (!user) return next(new AppError('User not found'));

  const matchCount = await Match.countDocuments({ creator: userId });
  const followers = await Follow.countDocuments({ following: userId });
  const following = await Follow.countDocuments({ follower: userId });

  const follow = await findOne(Follow, {
    follower: req.user._id,
    following: userId,
  });

  const isFollowing = follow ? true : false;

  res.status(200).json({
    status: 'success',
    data: {
      matchCount,
      followers,
      following,
      isFollowing,
      user: {
        name: user.fullName,
        image: user.image,
      },
    },
  });
});

const generateColorString = (match) => {
  // Function to extract colors from a team
  const getTeamColors = (team) => {
    if (!team || !team.players || !Array.isArray(team.players)) {
      return [];
    }

    return team.players
      .filter((player) => player.color) // Only include players with color
      .map((player) => player.color);
  };

  // Check creatorTeam first
  if (match.creatorTeam) {
    const creatorColors = getTeamColors(match.creatorTeam);
    if (creatorColors.length > 0) {
      return creatorColors.join(',');
    }
  }

  // Fall back to opponentTeam
  if (match.opponentTeam) {
    const opponentColors = getTeamColors(match.opponentTeam);
    if (opponentColors.length > 0) {
      return opponentColors.join(',');
    }
  }

  // If no colors found, return empty string or default
  return '';
};

export const checkAnalysisQuotaService = catchAsync(async (req, res, next) => {
  const quotaCheck = await checkUserAnalysisQuota(req.user);

  // const

  const analysesThisWeek = await Analysis.countDocuments({
    created_by: req.user._id,
    createdAt: { $gte: quotaCheck.startOfWeek },
  });

  res.status(200).json({
    status: 'success',
    data: {
      canAnalyze: quotaCheck.canAnalyze,
      remainingAnalyses: quotaCheck.remainingAnalyses,
      totalAllowed: quotaCheck.totalAllowed,
      unlimited: quotaCheck.remainingAnalyses === -1,
      plan: req.user.subscription?.plan || 'free',
      priority: quotaCheck.priority,
      processingMessage: getProcessingMessage(quotaCheck.priority),
      analysesThisWeek,
    },
  });
});

// import { createOne, deleteOne, findOne, getAll } from '../factory/repo.js';
// import { findOneAndUpdate } from '../factory/userRepo.js';
// import Match from '../models/Match.js';
// import AppError from '../utils/appError.js';
// import catchAsync from '../utils/catchAsync.js';
// import fs from 'fs';
// import { uploadLargeFile } from './s3UploadService.js';
// import User from '../models/User.js';
// import Follow from '../models/Follow.js';
// import FirebaseService from './firebaseService.js'; // Import Firebase service
// import { VideoAnalysisService } from './analysisService.js';
// import AnalysisStatus from '../models/AnalysisStatus.js';
// import Analysis from '../models/Analysis.js';
// import mongoose from 'mongoose';
// import webSocketService from './webSocketService.js';

// export const createMatchServiceService = catchAsync(async (req, res, next) => {
//   const match = await createOne(Match, req.body);

//   // Send notification to user about match creation
//   await FirebaseService.sendNotification(
//     req.user._id,
//     'Match Created',
//     'Your match has been created successfully!',
//     { matchId: match._id.toString(), type: 'match_created' }
//   );

//   webSocketService.handleNewPost(req.params.postId, req.user, postOwner);

//   res.status(201).json({
//     status: 'success',
//     data: {
//       match,
//     },
//   });
// });

// export const getMatchService = catchAsync(async (req, res, next) => {
//   const [match, analysisStatus] = await Promise.all([
//     findOne(
//       Match,
//       {
//         _id: req.params.matchId,
//         // creator: req.user._id,
//       },
//       [{ path: 'analysisStatusId' }]
//     ),
//     findOne(AnalysisStatus, { match_id: req.params.matchId }),
//   ]);

//   // console.log({ match });

//   if (!match)
//     return next(
//       new AppError(
//         'No match found or you are not authorized to view this match',
//         404
//       )
//     );

//   if (!match.analysisStatus) {
//     try {
//       await startVideoAnalysis(match, req.user._id, req.body);
//     } catch (analysisError) {
//       console.error('Auto-analysis failed:', analysisError);
//       // Don't fail the upload if analysis fails
//       await FirebaseService.sendNotification(
//         req.user._id,
//         'Analysis Failed to Start',
//         'Auto-analysis failed to start.',
//         {
//           matchId: match._id.toString(),
//           type: 'auto_analysis_failed',
//           error: analysisError.message,
//         }
//       );
//     }
//   }

//   if (match.analysisStatus === 'failed') {
//     try {
//       await VideoAnalysisService.restartAnalysis(match._id);

//       match.analysisStatus = 'restarting';
//       analysisStatus.status = 'restarting';

//       await Promise.all([match.save(), analysisStatus.save()]);
//     } catch (analysisError) {
//       await FirebaseService.sendNotification(
//         req.user._id,
//         'Analysis Failed to restart',
//         'Video uploaded successfully, but auto-analysis failed. You can try again manually.',
//         {
//           matchId: match._id.toString(),
//           type: 'auto_analysis_failed',
//           error: analysisError.message,
//         }
//       );
//       console.error('Error restarting analysis:', analysisError);
//     }
//   }

//   const analysis = await findOne(Analysis, { match_id: match._id });

//   console.log(req.params.matchId, req.user._id, match);

//   res.status(200).json({
//     status: 'success',
//     message:
//       match.analysisStatus === 'failed'
//         ? 'Match analysis failed, restarting now...'
//         : match.analysisStatus === 'processing' ||
//           match.analysisStatus === 'pending'
//         ? 'Match analysis is still processing...'
//         : 'Match analysis completed successfully.',
//     data: {
//       match,
//       analysis,
//     },
//   });
// });

// export const getAllMatchesService = catchAsync(async (req, res, next) => {
//   const { _id: userId } = req.user;

//   req.query.creator = userId;

//   const matches = await Match.aggregate([
//     // Stage 1: Filter matches by creator
//     {
//       $match: {
//         creator: new mongoose.Types.ObjectId(userId),
//       },
//     },
//     // Stage 2: Lookup with type conversion
//     {
//       $lookup: {
//         from: 'analyses',
//         let: {
//           matchAnalysisId: '$analysisId',
//           matchObjectId: '$_id',
//         },
//         pipeline: [
//           {
//             $match: {
//               $expr: {
//                 $or: [
//                   // Try string match first
//                   { $eq: ['$match_id', '$$matchAnalysisId'] },
//                   // Try ObjectId match as fallback
//                   { $eq: ['$match_id', { $toString: '$$matchObjectId' }] },
//                 ],
//               },
//             },
//           },
//         ],
//         as: 'analysis',
//       },
//     },
//     // Rest of your stages...
//     {
//       $addFields: {
//         firstPlayer: {
//           $let: {
//             vars: { analysisDoc: { $arrayElemAt: ['$analysis', 0] } },
//             in: {
//               $cond: {
//                 if: { $ne: ['$$analysisDoc', null] },
//                 then: {
//                   $arrayElemAt: ['$$analysisDoc.player_analytics.players', 0],
//                 },
//                 else: null,
//               },
//             },
//           },
//         },
//       },
//     },
//     { $unset: 'analysis' },
//     // {
//     //   $project: {
//     //     format: 1,
//     //     type: 1,
//     //     creator: 1,
//     //     teams: 1,
//     //     location: 1,
//     //     analysisStatus: 1,
//     //     firstPlayer: 1,
//     //     createdAt: 1,
//     //     updatedAt: 1,
//     //   },
//     // },
//   ]);

//   res.status(200).json({
//     status: 'success',
//     data: {
//       matches,
//     },
//   });
// });

// // export const getUserMatchesService = catchAsync(async (req, res, next) => {
// //   const matches = await Match.aggregate([
// //     // Stage 1: Filter matches by creator
// //     {
// //       $match: {
// //         creator: new mongoose.Types.ObjectId(req.query.userId),
// //       },
// //     },
// //     // Stage 2: Join with Analysis collection (conditionally for 'completed' status)
// //     {
// //       $lookup: {
// //         from: 'analyses',
// //         let: { matchId: '$_id', matchStatus: '$status' },
// //         // let: { matchStatus: '$status' },
// //         pipeline: [
// //           {
// //             $match: {
// //               $expr: {
// //                 $and: [
// //                   { $eq: ['$match_id', '$$matchId'] },
// //                   {
// //                     $eq: [true, { $eq: ['$$matchStatus', 'completed'] }],
// //                   },
// //                 ],
// //               },
// //             },
// //           },
// //         ],
// //         as: 'analysis',
// //       },
// //     },
// //     // Stage 3: Convert analysis array to single object or null
// //     {
// //       $addFields: {
// //         analysis: {
// //           $cond: {
// //             if: { $eq: ['$analysisStatus', 'completed'] },
// //             then: { $arrayElemAt: ['$analysis', 0] },
// //             else: null,
// //           },
// //         },
// //       },
// //     },
// //     // // Stage 4: Remove temporary status field
// //     // { $unset: 'matchStatus' },
// //   ]);

// //   res.status(200).json({
// //     status: 'success',
// //     results: matches.length,
// //     data: {
// //       matches,
// //     },
// //   });
// // });

// // export const getUserMatchesService = catchAsync(async (req, res, next) => {
// //   const matches = await Match.aggregate([
// //     // Stage 1: Filter matches by creator
// //     {
// //       $match: {
// //         creator: new mongoose.Types.ObjectId(req.query.userId),
// //         analysisStatus: 'completed', // Only get completed matches
// //       },
// //     },
// //     // Stage 2: Optimized lookup - only fetch what we need from analysis
// //     {
// //       $lookup: {
// //         from: 'analyses',
// //         let: { matchAnalysisId: '$analysisId', matchStatus: '$analysisStatus' },
// //         pipeline: [
// //           {
// //             $match: {
// //               $expr: {
// //                 $and: [
// //                   { $eq: ['$match_id', '$$matchAnalysisId'] },
// //                   { $eq: ['$$matchStatus', 'completed'] }, // Filter early
// //                 ],
// //               },
// //             },
// //           },
// //           // Project only the fields we need - reduces data transfer
// //           {
// //             $project: {
// //               'player_analytics.players': {
// //                 $slice: ['$player_analytics.players', 1],
// //               }, // Only first player
// //               'player_analytics.metadata': 1,
// //               status: 1,
// //               match_id: 1,
// //             },
// //           },
// //         ],
// //         as: 'analysis',
// //       },
// //     },
// //     // Stage 3: Simple extraction since we already have only what we need
// //     {
// //       $addFields: {
// //         firstPlayer: {
// //           $arrayElemAt: ['$analysis.player_analytics.players', 0],
// //         },
// //         analysisMetadata: {
// //           $arrayElemAt: ['$analysis.player_analytics.metadata', 0],
// //         },
// //       },
// //     },
// //     // Stage 4: Clean up - remove the analysis array
// //     {
// //       $unset: 'analysis',
// //     },
// //     // Stage 5: Only include fields you actually need in the response
// //     {
// //       $project: {
// //         format: 1,
// //         type: 1,
// //         teams: 1,
// //         location: 1,
// //         analysisStatus: 1,
// //         firstPlayer: 1,
// //         analysisMetadata: 1,
// //         createdAt: 1,
// //         updatedAt: 1,
// //         // Exclude any heavy fields you don't need
// //       },
// //     },
// //   ]);

// //   res.status(200).json({
// //     status: 'success',
// //     results: matches.length,
// //     data: {
// //       matches,
// //     },
// //   });
// // });

// export const getUserMatchesService = catchAsync(async (req, res, next) => {
//   const matches = await Match.aggregate([
//     // Stage 1: Filter matches by creator
//     {
//       $match: {
//         creator: new mongoose.Types.ObjectId(req.query.userId),
//         analysisStatus: 'completed',
//       },
//     },
//     // Stage 2: Lookup with type conversion
//     {
//       $lookup: {
//         from: 'analyses',
//         let: {
//           matchAnalysisId: '$analysisId',
//           matchObjectId: '$_id',
//         },
//         pipeline: [
//           {
//             $match: {
//               $expr: {
//                 $or: [
//                   // Try string match first
//                   { $eq: ['$match_id', '$$matchAnalysisId'] },
//                   // Try ObjectId match as fallback
//                   { $eq: ['$match_id', { $toString: '$$matchObjectId' }] },
//                 ],
//               },
//             },
//           },
//         ],
//         as: 'analysis',
//       },
//     },
//     // Rest of your stages...
//     {
//       $addFields: {
//         firstPlayer: {
//           $let: {
//             vars: { analysisDoc: { $arrayElemAt: ['$analysis', 0] } },
//             in: {
//               $cond: {
//                 if: { $ne: ['$$analysisDoc', null] },
//                 then: {
//                   $arrayElemAt: ['$$analysisDoc.player_analytics.players', 0],
//                 },
//                 else: null,
//               },
//             },
//           },
//         },
//       },
//     },
//     { $unset: 'analysis' },
//     {
//       $project: {
//         format: 1,
//         type: 1,
//         teams: 1,
//         location: 1,
//         analysisStatus: 1,
//         firstPlayer: 1,
//         createdAt: 1,
//         updatedAt: 1,
//       },
//     },
//   ]);

//   res.status(200).json({
//     status: 'success',
//     results: matches.length,
//     data: { matches },
//   });
// });

// export const updateMatchService = catchAsync(async (req, res, next) => {
//   const match = await findOneAndUpdate(
//     Match,
//     { _id: req.params.matchId, creator: req.user._id },
//     req.body
//   );

//   if (!match)
//     return next(
//       new AppError(
//         'No match found or you are not authorized to update this match',
//         404
//       )
//     );

//   // Send notification about match update
//   await FirebaseService.sendNotification(
//     req.user._id,
//     'Match Updated',
//     'Your match has been updated successfully!',
//     { matchId: match._id.toString(), type: 'match_updated' }
//   );

//   res.status(200).json({
//     status: 'success',
//     data: {
//       match,
//     },
//   });
// });

// export const deleteMatchService = catchAsync(async (req, res, next) => {
//   const match = await deleteOne(Match, {
//     _id: req.params.matchId,
//     creator: req.user._id,
//   });

//   if (!match)
//     return next(
//       new AppError(
//         'No match found or you are not authorized to delete this match',
//         404
//       )
//     );

//   // Send notification about match deletion
//   await FirebaseService.sendNotification(
//     req.user._id,
//     'Match Deleted',
//     'Your match has been deleted successfully!',
//     { type: 'match_deleted' }
//   );

//   res.status(204).json({
//     status: 'success',
//     data: null,
//   });
// });

// /**
//  * Handles the upload of a video file for a match.
//  */
// export const uploadVideoService = catchAsync(async (req, res, next) => {
//   try {
//     const { path: tempPath, originalname } = req.file;

//     const match = await findOne(Match, {
//       _id: req.body.matchId,
//       creator: req.user._id,
//     });

//     if (!match) return next(new AppError('Match not found', 404));

//     if (match.video)
//       return next(
//         new AppError('Match already has a video attached to it', 400)
//       );

//     // Core Upload Execution
//     const result = await uploadLargeFile(tempPath, originalname);

//     // Cleanup temporary file
//     fs.unlinkSync(tempPath);

//     match.video = result.Location;
//     await match.save();

//     // Send notification about video upload
//     await FirebaseService.sendNotification(
//       req.user._id,
//       'Video Uploaded',
//       'Your match video has been uploaded successfully!',
//       {
//         matchId: match._id.toString(),
//         type: 'video_uploaded',
//         videoUrl: result.Location,
//       }
//     );

//     // Auto-trigger video analysis after successful upload
//     try {
//       const analysisResponse = await startVideoAnalysis(
//         match,
//         req.user._id,
//         req.body
//       );
//     } catch (analysisError) {
//       console.error('Auto-analysis failed:', analysisError);
//       // Don't fail the upload if analysis fails
//       await FirebaseService.sendNotification(
//         req.user._id,
//         'Analysis Failed to Start',
//         'Video uploaded successfully, but auto-analysis failed. You can try again manually.',
//         {
//           matchId: match._id.toString(),
//           type: 'auto_analysis_failed',
//           error: analysisError.message,
//         }
//       );
//     }

//     res.status(200).json({
//       status: 'success',
//       message: 'Uploaded successfully and analysis started',
//       data: {
//         match,
//       },
//     });
//   } catch (error) {
//     console.error('Upload failed:', error);

//     // Send notification about upload failure
//     await FirebaseService.sendNotification(
//       req.user._id,
//       'Upload Failed',
//       'There was an error uploading your video. Please try again.',
//       { type: 'video_upload_failed' }
//     );

//     res.status(500).json({ error: 'Upload failed' });
//   }
// });

// // Extract analysis logic into a separate function
// const startVideoAnalysis = async (match, userId, requestBody) => {
//   // const options = {
//   //   confidence: parseFloat(requestBody.confidence) || 0.5,
//   //   skip_frames: parseInt(requestBody.skip_frames) || 5,
//   //   court_detection: requestBody.court_detection === 'true',
//   // };

//   // Send notification that analysis is starting
//   await FirebaseService.sendNotification(
//     userId,
//     'Analysis Starting',
//     'Your video analysis is now starting...',
//     {
//       matchId: match._id.toString(),
//       type: 'analysis_starting',
//       status: 'processing',
//     }
//   );

//   console.log('Player color:', generateColorString(match));

//   const analysisResult = await VideoAnalysisService.analyzeVideo({
//     match_id: match._id.toString(),
//     video_link: match.video,
//     player_color: generateColorString(match),
//     generate_highlights: true,
//   });

//   if (!analysisResult) {
//     throw new Error('Analysis failed to start');
//   }

//   const analysisStatus = await createOne(AnalysisStatus, {
//     match_id: match._id,
//     status: analysisResult.status,
//     message: analysisResult.message,
//   });

//   // Update match with analysis info
//   match.analysisStatus = analysisResult.status;
//   match.analysisStatusId = analysisStatus._id;
//   await match.save();

//   await match.populate('analysisStatusId');

//   // Send notification that analysis has started successfully
//   await FirebaseService.sendNotification(
//     userId,
//     'Analysis Started',
//     'Your video analysis has started successfully! You will be notified when it completes.',
//     {
//       matchId: match._id.toString(),
//       analysisId: analysisResult.analysis_id,
//       type: 'analysis_started',
//       status: 'processing',
//     }
//   );

//   return analysisResult;
// };

// export const uploadVideoService = catchAsync(async (req, res, next) => {
//   try {
//     const { path: tempPath, originalname } = req.file;

//     const match = await findOne(Match, {
//       _id: req.body.matchId,
//       creator: req.user._id,
//     });

//     if (!match) return next(new AppError('Match not found', 404));

//     if (match.video)
//       return next(
//         new AppError('Match already has a video attached to it', 400)
//       );

//     // Core Upload Execution
//     const result = await uploadLargeFile(tempPath, originalname);

//     // Cleanup temporary file
//     fs.unlinkSync(tempPath);

//     match.video = result.Location;
//     await match.save();

//     // Send notification about video upload
//     await FirebaseService.sendNotification(
//       req.user._id,
//       'Video Uploaded',
//       'Your match video has been uploaded successfully!',
//       {
//         matchId: match._id.toString(),
//         type: 'video_uploaded',
//         videoUrl: result.Location,
//       }
//     );

//     res.status(200).json({
//       status: 'success',
//       message: 'Uploaded successfully',
//       data: {
//         match,
//       },
//     });
//   } catch (error) {
//     console.error('Upload failed:', error);

//     // Send notification about upload failure
//     await FirebaseService.sendNotification(
//       req.user._id,
//       'Upload Failed',
//       'There was an error uploading your video. Please try again.',
//       { type: 'video_upload_failed' }
//     );

//     res.status(500).json({ error: 'Upload failed' });
//   }
// });

// import { createOne, deleteOne, findOne, getAll } from '../factory/repo.js';
// import { findOneAndUpdate } from '../factory/userRepo.js';
// import Match from '../models/Match.js';
// import AppError from '../utils/appError.js';
// import catchAsync from '../utils/catchAsync.js';
// import fs from 'fs';
// import { uploadLargeFile } from './s3UploadService.js';
// import User from '../models/User.js';
// import Follow from '../models/Follow.js';

// export const createMatchServiceService = catchAsync(async (req, res, next) => {
//   const match = await createOne(Match, req.body);

//   res.status(201).json({
//     status: 'success',
//     data: {
//       match,
//     },
//   });
// });

// export const getMatchService = catchAsync(async (req, res, next) => {
//   const match = await findOne(Match, {
//     _id: req.params.matchId,
//     creator: req.user._id,
//   });

//   console.log(req.params.matchId, req.user._id, match);

//   if (!match)
//     return next(
//       new AppError(
//         'No match found or you are not authorized to view this match',
//         404
//       )
//     );

//   res.status(200).json({
//     status: 'success',
//     data: {
//       match,
//     },
//   });
// });

// export const getAllMatchesService = catchAsync(async (req, res, next) => {
//   const { _id: userId } = req.user;

//   req.query.creator = userId;

//   const matches = await getAll(Match, req.query);

//   res.status(200).json({
//     status: 'success',
//     data: {
//       matches,
//     },
//   });
// });

// export const updateMatchService = catchAsync(async (req, res, next) => {
//   const match = await findOneAndUpdate(
//     Match,
//     { _id: req.params.matchId, creator: req.user._id },
//     req.body
//   );

//   if (!match)
//     return next(
//       new AppError(
//         'No match found or you are not authorized to update this match',
//         404
//       )
//     );

//   res.status(200).json({
//     status: 'success',
//     data: {
//       match,
//     },
//   });
// });

// export const deleteMatchService = catchAsync(async (req, res, next) => {
//   const match = await deleteOne(Match, {
//     _id: req.params.matchId,
//     creator: req.user._id,
//   });

//   if (!match)
//     return next(
//       new AppError(
//         'No match found or you are not authorized to delete this match',
//         404
//       )
//     );

//   res.status(204).json({
//     status: 'success',
//     data: null,
//   });
// });

// /**
//  * Handles the upload of a video file for a match.
//  *
//  * This service checks if the match exists and belongs to the authenticated user,
//  * ensures that a video is not already attached to the match, uploads the video
//  * to a storage service, and updates the match with the video URL.
//  *
//  * @async
//  * @function uploadVideoService
//  * @param {Object} req - The request object.
//  * @param {Object} req.file - The uploaded file object.
//  * @param {string} req.file.path - The temporary file path of the uploaded video.
//  * @param {string} req.file.originalname - The original name of the uploaded video file.
//  * @param {Object} req.body - The request body.
//  * @param {string} req.body.matchId - The ID of the match to attach the video to.
//  * @param {Object} req.user - The authenticated user object.
//  * @param {string} req.user._id - The ID of the authenticated user.
//  * @param {Object} res - The response object.
//  * @param {Function} next - The next middleware function.
//  * @throws {AppError} If the match is not found or does not belong to the user.
//  * @throws {AppError} If the match already has a video attached.
//  * @returns {void}
//  */
// export const uploadVideoService = catchAsync(async (req, res, next) => {
//   try {
//     const { path: tempPath, originalname } = req.file;

//     const match = await findOne(Match, {
//       _id: req.body.matchId,
//       creator: req.user._id,
//     });

//     if (!match) return next(new AppError('Match not found', 404));

//     if (match.video)
//       return next(
//         new AppError('Match already has a video attached to it', 400)
//       );

//     // Core Upload Execution
//     const result = await uploadLargeFile(tempPath, originalname);

//     // Cleanup temporary file
//     fs.unlinkSync(tempPath);

//     match.video = result.Location;

//     await match.save();

//     res.status(200).json({
//       status: 'success',
//       message: 'Uploaded successfully',
//       data: {
//         match,
//       },
//     });
//   } catch (error) {
//     console.error('Upload failed:', error);
//     res.status(500).json({ error: 'Upload failed' });
//   }
// });

// export const getUserProfileService = catchAsync(async (req, res, next) => {
//   const userId = req.query.userId || req.user._id;

//   const user = await findOne(User, { _id: userId });

//   if (!user) return next(new AppError('User not found'));

//   const matchCount = await Match.countDocuments({ creator: userId });
//   const followers = await Follow.countDocuments({ following: userId });
//   const following = await Follow.countDocuments({ follower: userId });

//   const follow = await findOne(Follow, {
//     follower: req.user._id,
//     following: userId,
//   });

//   const isFollowing = follow ? true : false;

//   res.status(200).json({
//     status: 'success',
//     data: {
//       matchCount,
//       followers,
//       following,
//       isFollowing,
//       user: {
//         name: user.fullName,
//         image: user.image,
//       },
//     },
//   });
// });

// // export const getPresignedUrl = catchAsync(async (req, res, next) => {
// //   const command = new GetObjectCommand({
// //     Bucket: process.env.S3_BUCKET_NAME,
// //     Key: fileName,
// //   });

// //   const signedUrl = await getSign;
// // });
