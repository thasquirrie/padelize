import { getUserPlanFeatures } from '../middleware/subscriptionMiddleware.js';
import Analysis from '../models/Analysis.js';
import AppError from '../utils/appError.js';
import { calculateCaloriesBurned } from './calorieCalculator.js';

/**
 * Check if user can perform a new match analysis based on their subscription
 * @param {Object} user - User object with populated subscription
 * @returns {Object} - { canAnalyze: boolean, remainingAnalyses: number, features: Object }
 */
export const checkUserAnalysisQuota = async (user) => {
  const features = getUserPlanFeatures(user);

  // // If unlimited analyses (max plan), always allow
  // if (features.matchAnalysesPerWeek === -1) {
  //   return {
  //     canAnalyze: true,
  //     remainingAnalyses: -1,
  //     features,
  //     priority: features.processingSpeed,
  //   };
  // }

  // Get start of current week (Monday)
  const now = new Date();
  const startOfWeek = new Date(now);
  const dayOfWeek = now.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(now.getDate() - daysToSubtract);
  startOfWeek.setHours(0, 0, 0, 0);

  console.log({ startOfWeek });

  // Count analyses this week
  const analysesThisWeek = await Analysis.countDocuments({
    created_by: user._id,
    createdAt: { $gte: startOfWeek },
  });

  const remaining = Math.max(
    0,
    features.matchAnalysesPerWeek - analysesThisWeek
  );

  console.log({ analysesThisWeek, remaining });

  return {
    startOfWeek,
    canAnalyze: remaining > 0,
    remainingAnalyses: remaining,
    totalAllowed: features.matchAnalysesPerWeek,
    features,
    priority: features.processingSpeed,
  };
};

/**
 * Filter analysis results based on subscription features
 * @param {Object} analysis - Analysis data (plain object, not Mongoose document)
 * @param {Object} creator - Match creator user object (the one who paid for the analysis)
 * @returns {Object} - Filtered analysis data
 */
export const filterAnalysisResultsBySubscription = (analysis, creator) => {
  const features = getUserPlanFeatures(creator);

  console.log({ features });

  if (!analysis) return null;

  const result = {
    _id: analysis._id,
    match_id: analysis.match_id,
    status: analysis.status,
    // Handle both timestamp formats (created_at vs createdAt)
    created_at: analysis.created_at || analysis.createdAt,
    updated_at: analysis.updated_at || analysis.updatedAt,
  };

  // Add created_by if present
  if (analysis.created_by) {
    result.created_by = analysis.created_by;
  }

  // Basic features (available to all)
  if (analysis.basic_statistics) {
    result.basic_statistics = analysis.basic_statistics;
  }

  if (analysis.player_analytics) {
    result.player_analytics = {
      metadata: analysis.player_analytics.metadata,
    };

    // Include court_info if available (basic feature)
    if (analysis.player_analytics.court_info) {
      result.player_analytics.court_info = analysis.player_analytics.court_info;
    }

    if (analysis.player_analytics.players) {
      result.player_analytics.players = analysis.player_analytics.players.map(
        (player) => {
          // Recalculate calories on-the-fly if missing/zero but we have valid data
          let calories_burned = player.calories_burned;
          if (
            (!calories_burned || calories_burned === 0) &&
            player.total_distance_km > 0 &&
            player.average_speed_kmh > 0
          ) {
            calories_burned = calculateCaloriesBurned({
              distance_km: player.total_distance_km,
              avg_speed_kmh: player.average_speed_kmh,
              total_sprints: player.total_sprint_bursts || 0,
              weight_kg: 80,
            });
          }

          const filteredPlayer = {
            player_id: player.player_id, // Include player_id for correlation with AI server results
            color: player.color,
            average_speed_kmh: player.average_speed_kmh,
            total_distance_km: player.total_distance_km,
            average_distance_from_center_km:
              player.average_distance_from_center_km,
            calories_burned: calories_burned,
          };

          // Only include shots if user has shot classification features
          if (features.basicShotClassification) {
            // Handle both old 'shots' and new 'shot_analytics' formats
            const shotData = player.shots || player.shot_analytics || {};

            if (features.fullShotBreakdown) {
              // Pro plan: Include all shot types
              // Handle both formats
              if (player.shots) {
                filteredPlayer.shots = player.shots;
              }
              if (player.shot_analytics) {
                filteredPlayer.shot_analytics = player.shot_analytics;
              }
            } else {
              // Free plan: Only forehand/backhand, completely exclude volley/smash
              if (player.shots) {
                filteredPlayer.shots = {
                  total_shots:
                    (shotData.forehand || 0) + (shotData.backhand || 0),
                  forehand: shotData.forehand || 0,
                  backhand: shotData.backhand || 0,
                  // volley and smash fields completely excluded for free users
                  success: shotData.success || 0,
                  success_rate: shotData.success_rate || 0,
                };
              }
              if (player.shot_analytics) {
                filteredPlayer.shot_analytics = {
                  total_shots:
                    (shotData.forehand || 0) + (shotData.backhand || 0),
                  forehand: shotData.forehand || 0,
                  backhand: shotData.backhand || 0,
                  // volley and smash fields completely excluded for free users
                };
              }
            }

            // Include shot events and highlights if available
            if (player.shot_events) {
              if (features.fullShotBreakdown) {
                // Pro plan: Include all shot events
                filteredPlayer.shot_events = player.shot_events;
              } else {
                // Free plan: Only include forehand/backhand shot events
                filteredPlayer.shot_events = player.shot_events.filter(
                  (event) =>
                    ['forehand', 'backhand'].includes(event.type?.toLowerCase())
                );
              }
            }

            if (player.highlight_urls) {
              filteredPlayer.highlight_urls = player.highlight_urls;
            }

            if (player.peak_speed_kmh !== undefined) {
              filteredPlayer.peak_speed_kmh = player.peak_speed_kmh;
            }
            if (player.net_dominance_percentage !== undefined) {
              filteredPlayer.net_dominance_percentage =
                player.net_dominance_percentage;
            }
            if (player.baseline_play_percentage !== undefined) {
              filteredPlayer.baseline_play_percentage =
                player.baseline_play_percentage;
            }
            if (player.dead_zone_presence_percentage !== undefined) {
              filteredPlayer.dead_zone_presence_percentage =
                player.dead_zone_presence_percentage;
            }

            // Include new API fields
            if (player.total_sprint_bursts !== undefined) {
              filteredPlayer.total_sprint_bursts = player.total_sprint_bursts;
            }
            if (player.player_heatmap !== undefined) {
              filteredPlayer.player_heatmap = player.player_heatmap;
            }
          }
          // If no shot classification access, completely exclude shot-related data

          return filteredPlayer;
        }
      );
    }

    // Add premium features based on subscription
    if (
      features.fullShotBreakdown &&
      analysis.player_analytics.advanced_shots
    ) {
      result.player_analytics.advanced_shots =
        analysis.player_analytics.advanced_shots;
    }

    if (
      features.movementHeatmaps &&
      analysis.player_analytics.movement_heatmap
    ) {
      result.player_analytics.movement_heatmap =
        analysis.player_analytics.movement_heatmap;
    }

    if (features.averageSpeed && analysis.player_analytics.speed_metrics) {
      result.player_analytics.speed_metrics =
        analysis.player_analytics.speed_metrics;
    }

    // Handle top-level shot_events if they exist
    if (
      analysis.player_analytics.shot_events &&
      features.basicShotClassification
    ) {
      if (features.fullShotBreakdown) {
        // Pro plan: Include all shot events
        result.player_analytics.shot_events =
          analysis.player_analytics.shot_events;
      } else {
        // Free plan: Only include forehand/backhand shot events
        result.player_analytics.shot_events =
          analysis.player_analytics.shot_events.filter((event) =>
            ['forehand', 'backhand'].includes(event.type?.toLowerCase())
          );
      }
    }
  }

  // Add highlights if available (basic feature)
  if (analysis.highlights) {
    result.highlights = analysis.highlights;
  }

  // Add files if available, but filter based on subscription
  if (analysis.files) {
    result.files = {};

    // Basic files available to all users
    if (analysis.files.player_analytics) {
      result.files.player_analytics = analysis.files.player_analytics;
    }

    if (analysis.files.highlights) {
      result.files.highlights = analysis.files.highlights;
    }

    // Heatmap overlay only for users with heatmap access
    if (features.movementHeatmaps && analysis.files.player_heatmap_overlay) {
      result.files.player_heatmap_overlay =
        analysis.files.player_heatmap_overlay;
    }

    // Performance analysis for premium users
    if (features.fullShotBreakdown && analysis.files.performance_analysis) {
      result.files.performance_analysis = analysis.files.performance_analysis;
    }

    // Heatmap analysis for premium users
    if (features.movementHeatmaps && analysis.files.heatmap_analysis) {
      result.files.heatmap_analysis = analysis.files.heatmap_analysis;
    }

    // Other files can be included if they exist
    if (analysis.files.processed_video) {
      result.files.processed_video = analysis.files.processed_video;
    }

    if (analysis.files.raw_data) {
      result.files.raw_data = analysis.files.raw_data;
    }
  }

  // Add metadata if available
  if (analysis.metadata) {
    result.metadata = analysis.metadata;
  }

  return result;
};

/**
 * Get processing priority message for user
 * @param {string} priority - Processing priority level
 * @returns {string} - User-friendly message
 */
export const getProcessingMessage = (priority) => {
  switch (priority) {
    case 'fastest':
      return 'Your match is being processed with priority (MAX plan) - expect results in 15-30 minutes';
    case 'fast':
      return 'Your match is being processed with fast priority (PRO plan) - expect results within 1 hour';
    case 'standard':
    default:
      return 'Your match is being processed - expect results in 2-4 hours';
  }
};

/**
 * Validate if user can access specific analysis features
 * @param {Object} user - User object
 * @param {string} featureName - Feature to check
 * @returns {boolean} - Whether user has access
 */
export const hasFeatureAccess = (user, featureName) => {
  const features = getUserPlanFeatures(user);
  return features[featureName] === true;
};

export default {
  checkUserAnalysisQuota,
  filterAnalysisResultsBySubscription,
  getProcessingMessage,
  hasFeatureAccess,
};
