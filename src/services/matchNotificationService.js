// src/services/matchNotificationService.js
import notificationService from './notificationService.js';
import FirebaseService from './firebaseService.js';
import webSocketService from './webSocketService.js';

class MatchNotificationService {
  /**
   * Notify user when player detection is complete
   * @param {string} userId - User ID to notify
   * @param {Object} match - Match object
   * @param {Array} players - Detected players
   */
  async notifyPlayerDetectionComplete(userId, match, players) {
    return this.sendMatchNotification({
      userId,
      type: 'player_detection_complete',
      title: 'Player Detection Complete',
      message: `Players have been detected in your match: ${players.length} players found`,
      priority: 'medium',
      data: { matchId: match._id, playerCount: players.length },
      match,
    });
  }

  /**
   * Notify user when player detection fails
   * @param {string} userId - User ID to notify
   * @param {Object} match - Match object
   * @param {string} errorMessage - Error message
   */
  async notifyPlayerDetectionFailed(userId, match, errorMessage) {
    return this.sendMatchNotification({
      userId,
      type: 'player_detection_failed',
      title: 'Player Detection Failed',
      message: 'There was an error detecting players in your match',
      priority: 'high',
      data: { matchId: match._id, error: errorMessage },
      match,
    });
  }

  /**
   * Notify user when player detection has started
   * @param {string} userId - User ID to notify
   * @param {Object} match - Match object
   */
  async notifyPlayerDetectionStarted(userId, match) {
    return this.sendMatchNotification({
      userId,
      type: 'player_detection_started',
      title: 'Player Detection Started',
      message: 'Player detection has started for your match video',
      priority: 'medium',
      data: { matchId: match._id },
      match,
    });
  }

  /**
   * Notify user when video download starts
   * @param {string} userId - User ID to notify
   * @param {Object} match - Match object
   */
  async notifyVideoDownloadStarted(userId, match) {
    return this.sendMatchNotification({
      userId,
      type: 'video_download_started',
      title: 'Video Download Started',
      message: 'Your video is being downloaded from the shared link',
      priority: 'medium',
      data: { matchId: match._id },
      match,
    });
  }

  /**
   * Notify user when video is ready after download
   * @param {string} userId - User ID to notify
   * @param {Object} match - Match object
   */
  async notifyMatchVideoReady(userId, match) {
    return this.sendMatchNotification({
      userId,
      type: 'video_download_complete',
      title: 'Video Download Complete',
      message:
        'Your video has been downloaded successfully! Player detection is now starting.',
      priority: 'high',
      data: { matchId: match._id, videoUrl: match.video },
      match,
    });
  }

  /**
   * Notify user when video download fails
   * @param {string} userId - User ID to notify
   * @param {Object} match - Match object
   * @param {string} error - Error message
   */
  async notifyMatchVideoFailed(userId, match, error) {
    return this.sendMatchNotification({
      userId,
      type: 'video_download_failed',
      title: 'Video Download Failed',
      message:
        error || 'There was an error downloading your video. Please try again.',
      priority: 'high',
      data: { matchId: match._id, error },
      match,
    });
  }

  /**
   * Send comprehensive notification for match events
   * @param {Object} options - Notification options
   * @param {string} options.userId - User ID to send notification to
   * @param {string} options.type - Type of notification
   * @param {string} options.title - Notification title
   * @param {string} options.message - Notification message
   * @param {string} options.priority - Priority level (low, medium, high)
   * @param {Object} options.data - Additional data for the notification
   * @param {Object} options.match - Match object (optional)
   */
  async sendMatchNotification(options) {
    const {
      userId,
      type,
      title,
      message,
      priority = 'medium',
      data = {},
      match = null,
    } = options;

    try {
      // 1. Create in-app notification
      const notification = await notificationService.createNotification({
        recipient: userId,
        sender: userId, // System notifications from self
        type: type,
        relatedMatch: match?._id || data?.matchId, // Link to match
        customTitle: title,
        customMessage: message,
        priority: priority,
      });

      // 2. Send push notification via Firebase
      await FirebaseService.sendNotification(userId, title, message, {
        type,
        ...data,
      });

      // 3. Send real-time notification via WebSocket
      webSocketService.sendToUser(userId.toString(), type, {
        title,
        message,
        match,
        data,
        timestamp: new Date(),
      });

      console.log(
        `Match notification sent successfully: ${type} to user ${userId}`,
        notification
      );
    } catch (error) {
      console.error('Error sending match notification:', error);
      throw error;
    }
  }

  // Match Creation Notifications
  async notifyMatchCreated(userId, match) {
    console.log('Creation!!!', { userId });
    return this.sendMatchNotification({
      userId,
      type: 'matchCreated',
      title: 'Match Created',
      message: 'Your match has been created successfully!',
      priority: 'medium',
      data: { matchId: match._id.toString() },
      match,
    });
  }

  // Match Update Notifications
  async notifyMatchUpdated(userId, match) {
    return this.sendMatchNotification({
      userId,
      type: 'matchUpdated',
      title: 'Match Updated',
      message: 'Your match has been updated successfully!',
      priority: 'low',
      data: { matchId: match._id.toString() },
      match,
    });
  }

  // Match Deletion Notifications
  async notifyMatchDeleted(userId, matchId) {
    return this.sendMatchNotification({
      userId,
      type: 'matchDeleted',
      title: 'Match Deleted',
      message: 'Your match has been deleted successfully!',
      priority: 'low',
      data: { matchId: matchId.toString() },
    });
  }

  // Video Upload Notifications
  async notifyVideoUploaded(userId, match, videoUrl) {
    return this.sendMatchNotification({
      userId,
      type: 'videoUploaded',
      title: 'Video Uploaded',
      message: 'Your match video has been uploaded successfully!',
      priority: 'medium',
      data: {
        matchId: match._id.toString(),
        videoUrl,
      },
      match,
    });
  }

  // Analysis Starting Notifications
  async notifyAnalysisStarting(userId, match) {
    return this.sendMatchNotification({
      userId,
      type: 'analysisStarting',
      title: 'Analysis Starting',
      message: 'Your video analysis is now starting...',
      priority: 'medium',
      data: {
        matchId: match._id.toString(),
        status: 'processing',
      },
      match,
    });
  }

  // Analysis Started Notifications
  async notifyAnalysisStarted(userId, match, analysisId) {
    return this.sendMatchNotification({
      userId,
      type: 'analysisStarted',
      title: 'Analysis Started',
      message:
        'Your video analysis has started successfully! You will be notified when it completes.',
      priority: 'medium',
      data: {
        matchId: match._id.toString(),
        analysisId,
        status: 'processing',
      },
      match,
    });
  }

  // Analysis Completed Notifications
  async notifyAnalysisCompleted(userId, match, analysisId) {
    return this.sendMatchNotification({
      userId,
      type: 'analysisCompleted',
      title: 'Analysis Completed',
      message:
        'Your video analysis has been completed successfully! View your results now.',
      priority: 'high',
      data: {
        matchId: match._id.toString(),
        analysisId,
        status: 'completed',
      },
      match,
    });
  }

  // Analysis Error Notifications
  async notifyAnalysisError(userId, match, error) {
    return this.sendMatchNotification({
      userId,
      type: 'analysisError',
      title: 'Analysis Failed',
      message:
        error ||
        'There was an error with your video analysis. Please try again.',
      priority: 'high',
      data: {
        matchId: match._id.toString(),
        status: 'failed',
        error,
      },
      match,
    });
  }

  // Analysis Restart Notifications
  async notifyAnalysisRestart(userId, match) {
    return this.sendMatchNotification({
      userId,
      type: 'analysisRestart',
      title: 'Analysis Restarting',
      message: 'Your match analysis is being restarted.',
      priority: 'medium',
      data: {
        matchId: match._id.toString(),
        status: 'restarting',
      },
      match,
    });
  }

  // Upload Error Notifications
  async notifyUploadError(userId, matchId, error) {
    return this.sendMatchNotification({
      userId,
      type: 'uploadError',
      title: 'Upload Failed',
      message:
        error || 'There was an error uploading your video. Please try again.',
      priority: 'high',
      data: {
        matchId: matchId?.toString(),
        error,
      },
    });
  }

  // Analysis Progress Notifications (for long-running analyses)
  async notifyAnalysisProgress(userId, match, progress) {
    return this.sendMatchNotification({
      userId,
      type: 'analysisProgress',
      title: 'Analysis Progress',
      message: `Your video analysis is ${progress}% complete.`,
      priority: 'low',
      data: {
        matchId: match._id.toString(),
        progress,
        status: 'processing',
      },
      match,
    });
  }

  // Match Shared Notifications (if you have sharing features)
  async notifyMatchShared(userId, match, sharedBy) {
    return this.sendMatchNotification({
      userId,
      type: 'matchShared',
      title: 'Match Shared',
      message: `${sharedBy.fullName} shared a match with you.`,
      priority: 'medium',
      data: {
        matchId: match._id.toString(),
        sharedBy: sharedBy._id.toString(),
      },
      match,
    });
  }

  // Batch notifications for multiple matches
  async notifyBulkAnalysisCompleted(userId, completedMatches) {
    const matchCount = completedMatches.length;
    const message =
      matchCount === 1
        ? 'Your match analysis has been completed!'
        : `${matchCount} match analyses have been completed!`;

    return this.sendMatchNotification({
      userId,
      type: 'bulkAnalysisCompleted',
      title: 'Analyses Completed',
      message,
      priority: 'high',
      data: {
        matchIds: completedMatches.map((m) => m._id.toString()),
        count: matchCount,
        status: 'completed',
      },
    });
  }

  // System maintenance notifications
  async notifySystemMaintenance(userId, maintenanceInfo) {
    return this.sendMatchNotification({
      userId,
      type: 'systemMaintenance',
      title: 'System Maintenance',
      message:
        maintenanceInfo.message ||
        'System maintenance is scheduled. Some features may be temporarily unavailable.',
      priority: 'medium',
      data: maintenanceInfo,
    });
  }

  // Weekly/Monthly summary notifications
  async notifyMatchSummary(userId, summaryData) {
    const { period, matchCount, analysisCount, highlights } = summaryData;

    return this.sendMatchNotification({
      userId,
      type: 'matchSummary',
      title: `${period} Match Summary`,
      message: `You've created ${matchCount} matches and completed ${analysisCount} analyses this ${period.toLowerCase()}.`,
      priority: 'low',
      data: {
        period,
        matchCount,
        analysisCount,
        highlights,
      },
    });
  }

  // Achievement/milestone notifications
  async notifyMatchMilestone(userId, milestone) {
    const { type, count, achievement } = milestone;

    return this.sendMatchNotification({
      userId,
      type: 'matchMilestone',
      title: 'Achievement Unlocked!',
      message:
        achievement || `Congratulations! You've reached ${count} ${type}.`,
      priority: 'medium',
      data: milestone,
    });
  }
}

export default new MatchNotificationService();
