/**
 * Match Video Processing Status Helper
 * 
 * This utility computes a unified status for video processing across all stages:
 * - Upload Path: Direct multipart upload OR external link streaming
 * - Player Detection: AI identifies players in the video
 * - Analysis: Full AI analysis of gameplay
 */

/**
 * Compute unified processing status for a match
 * @param {Object} match - Match document from database
 * @returns {Object} Unified status information
 */
export function computeMatchProcessingStatus(match) {
  // Determine the upload path
  const uploadPath = determineUploadPath(match);
  
  // Compute current stage
  const currentStage = determineCurrentStage(match, uploadPath);
  
  // Compute overall progress percentage
  const progressPercentage = calculateProgressPercentage(match, uploadPath, currentStage);
  
  // Generate user-friendly message
  const statusMessage = generateStatusMessage(match, uploadPath, currentStage);
  
  return {
    // Overall status
    overall: {
      stage: currentStage.name,
      progress: progressPercentage,
      message: statusMessage,
      isComplete: currentStage.name === 'completed',
      hasFailed: currentStage.hasFailed,
    },
    
    // Upload path information
    uploadPath: {
      type: uploadPath.type, // 'direct_upload', 'link_upload', or 'unknown'
      status: uploadPath.status,
    },
    
    // Individual stage statuses (existing format preserved)
    stages: {
      // Stage 1a: Direct Upload (if applicable)
      directUpload: match.videoUpload?.status ? {
        status: match.videoUpload.status,
        uploadId: match.videoUpload.uploadId,
        progress: match.videoUpload.uploadedParts && match.videoUpload.totalParts
          ? Math.round((match.videoUpload.uploadedParts / match.videoUpload.totalParts) * 100)
          : 0,
        startedAt: match.videoUpload.startedAt,
        completedAt: match.videoUpload.completedAt,
      } : null,
      
      // Stage 1b: Link Streaming (if applicable)
      linkStreaming: match.streamingJobId ? {
        status: match.streamingStatus,
        jobId: match.streamingJobId,
        startedAt: match.streamingStartedAt,
        completedAt: match.streamingCompletedAt,
        error: match.streamingError,
      } : null,
      
      // Stage 2: Player Detection
      playerDetection: {
        status: match.playerDetectionStatus || 'not_started',
        jobId: match.playerDetectionJobId,
        playersFound: match.players?.length || 0,
        hasPlayers: (match.players?.length || 0) > 0,
        startedAt: match.playerDetectionStartedAt,
        completedAt: match.playerDetectionCompletedAt,
        error: match.playerDetectionError,
        retryCount: match.playerDetectionRetryCount || 0,
      },
      
      // Stage 3: Video Analysis
      analysis: {
        status: match.analysisStatus || 'not_started',
        analysisId: match.analysisId,
        startedAt: match.createdAt, // Approximation
        hasResults: !!match.analysisId,
      },
    },
    
    // Video availability
    video: {
      available: !!match.video,
      url: match.video || null,
    },
  };
}

/**
 * Determine which upload path was used
 */
function determineUploadPath(match) {
  // Check for direct upload
  if (match.videoUpload?.uploadId) {
    return {
      type: 'direct_upload',
      status: match.videoUpload.status,
      method: 'Multipart Upload',
    };
  }
  
  // Check for link streaming
  if (match.streamingJobId) {
    return {
      type: 'link_upload',
      status: match.streamingStatus,
      method: 'External Link',
    };
  }
  
  // Check if video exists but no tracking (legacy or other method)
  if (match.video) {
    return {
      type: 'unknown',
      status: 'completed',
      method: 'Legacy Upload',
    };
  }
  
  return {
    type: 'none',
    status: 'not_started',
    method: 'No Upload',
  };
}

/**
 * Determine the current processing stage
 */
function determineCurrentStage(match, uploadPath) {
  // Check for failures first
  const failures = [];
  
  if (uploadPath.status === 'failed' || uploadPath.status === 'aborted') {
    failures.push('upload');
  }
  
  if (match.playerDetectionStatus === 'failed') {
    failures.push('player_detection');
  }
  
  if (match.analysisStatus === 'failed') {
    failures.push('analysis');
  }
  
  if (failures.length > 0) {
    return {
      name: 'failed',
      hasFailed: true,
      failedStages: failures,
    };
  }
  
  // Check completion status
  if (match.analysisStatus === 'completed') {
    return { name: 'completed', hasFailed: false };
  }
  
  // Check current stage
  if (match.analysisStatus === 'processing' || match.analysisStatus === 'pending') {
    return { name: 'analyzing', hasFailed: false };
  }
  
  if (match.playerDetectionStatus === 'processing') {
    return { name: 'detecting_players', hasFailed: false };
  }
  
  if (match.playerDetectionStatus === 'completed' && !match.analysisStatus) {
    return { name: 'awaiting_analysis', hasFailed: false };
  }
  
  // Check upload stage
  if (uploadPath.type === 'direct_upload') {
    if (uploadPath.status === 'initializing' || uploadPath.status === 'uploading') {
      return { name: 'uploading', hasFailed: false };
    }
    if (uploadPath.status === 'completed' && match.playerDetectionStatus === 'not_started') {
      return { name: 'upload_complete', hasFailed: false };
    }
  }
  
  if (uploadPath.type === 'link_upload') {
    if (uploadPath.status === 'pending') {
      return { name: 'downloading', hasFailed: false };
    }
    if (uploadPath.status === 'completed' && match.playerDetectionStatus === 'not_started') {
      return { name: 'download_complete', hasFailed: false };
    }
  }
  
  // Default: waiting for upload
  return { name: 'awaiting_video', hasFailed: false };
}

/**
 * Calculate overall progress percentage
 */
function calculateProgressPercentage(match, uploadPath, currentStage) {
  if (currentStage.name === 'completed') return 100;
  if (currentStage.name === 'failed') {
    // Return partial progress based on what completed
    if (match.analysisStatus === 'failed') return 66;
    if (match.playerDetectionStatus === 'failed') return 33;
    return 10;
  }
  
  // Stage weights: Upload(25%) -> Player Detection(25%) -> Analysis(50%)
  let progress = 0;
  
  // Upload stage (0-25%)
  if (uploadPath.type === 'direct_upload' && uploadPath.status === 'completed') {
    progress += 25;
  } else if (uploadPath.type === 'link_upload' && uploadPath.status === 'completed') {
    progress += 25;
  } else if (uploadPath.type === 'unknown') {
    progress += 25; // Legacy upload assumed complete
  } else if (uploadPath.status === 'uploading' || uploadPath.status === 'pending') {
    // Partial upload progress
    if (match.videoUpload?.uploadedParts && match.videoUpload?.totalParts) {
      progress += Math.round((match.videoUpload.uploadedParts / match.videoUpload.totalParts) * 25);
    } else {
      progress += 10; // In progress but no specific progress
    }
  }
  
  // Player Detection stage (25-50%)
  if (match.playerDetectionStatus === 'completed') {
    progress += 25;
  } else if (match.playerDetectionStatus === 'processing') {
    progress += 12; // Half of this stage
  }
  
  // Analysis stage (50-100%)
  if (match.analysisStatus === 'completed') {
    progress += 50;
  } else if (match.analysisStatus === 'processing' || match.analysisStatus === 'pending') {
    progress += 25; // Half of this stage
  }
  
  return Math.min(progress, 99); // Never show 100% unless actually complete
}

/**
 * Generate user-friendly status message
 */
function generateStatusMessage(match, uploadPath, currentStage) {
  const messages = {
    'awaiting_video': 'Waiting for video upload',
    'uploading': 'Uploading video...',
    'downloading': 'Downloading video from link...',
    'upload_complete': 'Video uploaded successfully',
    'download_complete': 'Video downloaded successfully',
    'detecting_players': 'Detecting players in video...',
    'awaiting_analysis': 'Ready for analysis',
    'analyzing': 'Analyzing gameplay...',
    'completed': 'Analysis complete!',
    'failed': `Processing failed at ${currentStage.failedStages?.join(', ') || 'unknown stage'}`,
  };
  
  return messages[currentStage.name] || 'Processing...';
}

/**
 * Batch compute status for multiple matches
 * @param {Array} matches - Array of match documents
 * @returns {Array} Matches with computed status
 */
export function computeMatchesProcessingStatus(matches) {
  return matches.map(match => ({
    ...match,
    processingStatus: computeMatchProcessingStatus(match),
  }));
}
