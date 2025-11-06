import mongoose from 'mongoose';

import { PlayerAnalyticsAggregator } from './analysisService.js';
import Follow from '../models/Follow.js';
import Analysis from '../models/Analysis.js';
import catchAsync from '../utils/catchAsync.js';

class TennisLeaderboard extends PlayerAnalyticsAggregator {
  /**
   * Get platform-wide leaderboard for all users
   * @param {Object} options - Query options
   * @param {String} options.metric - Metric to rank by ('distance', 'speed', 'success_rate', 'calories')
   * @param {Number} options.limit - Number of top users to return (default: 50)
   * @param {Date} options.startDate - Start date for the period
   * @param {Date} options.endDate - End date for the period
   * @param {Number} options.minMatches - Minimum matches played to qualify (default: 1)
   */
  static async getPlatformLeaderboard(options = {}) {
    const {
      metric = 'distance',
      limit = 50,
      startDate,
      endDate,
      minMatches = 1,
    } = options;

    // Build match criteria
    const matchCriteria = { status: 'completed' };

    if (startDate || endDate) {
      matchCriteria.createdAt = {};
      if (startDate) matchCriteria.createdAt.$gte = new Date(startDate);
      if (endDate) matchCriteria.createdAt.$lte = new Date(endDate);
    }

    const pipeline = [
      { $match: matchCriteria },

      // Get first player from each analysis
      {
        $addFields: {
          first_player: { $arrayElemAt: ['$player_analytics.players', 0] },
        },
      },

      // Group by user (created_by)
      {
        $group: {
          _id: '$created_by',
          total_matches: { $sum: 1 },

          // Distance metrics
          total_distance_km: { $sum: '$first_player.total_distance_km' },
          avg_distance_per_match: { $avg: '$first_player.total_distance_km' },

          // Speed metrics
          avg_speed_kmh: { $avg: '$first_player.average_speed_kmh' },
          max_speed_kmh: { $max: '$first_player.average_speed_kmh' },
          avg_peak_speed_kmh: { $avg: '$first_player.peak_speed_kmh' },
          max_peak_speed_kmh: { $max: '$first_player.peak_speed_kmh' },

          // Court positioning metrics
          avg_net_dominance: { $avg: '$first_player.net_dominance_percentage' },
          avg_baseline_play: { $avg: '$first_player.baseline_play_percentage' },
          avg_dead_zone_presence: {
            $avg: '$first_player.dead_zone_presence_percentage',
          },

          // Shot success metrics
          total_shots: { $sum: '$first_player.shots.total_shots' },
          total_successful_shots: { $sum: '$first_player.shots.success' },
          avg_success_rate: { $avg: '$first_player.shots.success_rate' },

          // Calories metrics
          total_calories: { $sum: '$first_player.calories_burned' },
          avg_calories_per_match: { $avg: '$first_player.calories_burned' },

          // Additional stats
          total_forehand: { $sum: '$first_player.shots.forehand' },
          total_backhand: { $sum: '$first_player.shots.backhand' },
          total_volleys: { $sum: '$first_player.shots.volley' },
          total_smashes: { $sum: '$first_player.shots.smash' },

          // Sprint bursts
          total_sprint_bursts: { $sum: '$first_player.total_sprint_bursts' },
          avg_sprint_bursts_per_match: {
            $avg: '$first_player.total_sprint_bursts',
          },

          // Time range
          first_match: { $min: '$createdAt' },
          last_match: { $max: '$createdAt' },
        },
      },

      // Filter by minimum matches
      { $match: { total_matches: { $gte: minMatches } } },

      // Calculate overall success rate
      {
        $addFields: {
          overall_success_rate: {
            $cond: {
              if: { $gt: ['$total_shots', 0] },
              then: {
                $multiply: [
                  { $divide: ['$total_successful_shots', '$total_shots'] },
                  100,
                ],
              },
              else: 0,
            },
          },
        },
      },

      // Populate user details
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },

      { $unwind: '$user' },

      // Project final structure
      {
        $project: {
          user_id: '$_id',
          name: '$user.fullName',
          username: '$user.username',
          email: '$user.email',
          profile_image: '$user.profile_image',
          total_matches: 1,

          // Main metrics for ranking
          total_distance_km: { $round: ['$total_distance_km', 4] },
          avg_distance_per_match: { $round: ['$avg_distance_per_match', 4] },
          avg_speed_kmh: { $round: ['$avg_speed_kmh', 2] },
          max_speed_kmh: { $round: ['$max_speed_kmh', 2] },
          avg_peak_speed_kmh: { $round: ['$avg_peak_speed_kmh', 2] },
          max_peak_speed_kmh: { $round: ['$max_peak_speed_kmh', 2] },
          overall_success_rate: { $round: ['$overall_success_rate', 2] },
          avg_success_rate: { $round: ['$avg_success_rate', 2] },
          total_calories: { $round: ['$total_calories', 2] },
          avg_calories_per_match: { $round: ['$avg_calories_per_match', 2] },

          // Court positioning stats
          avg_net_dominance: { $round: ['$avg_net_dominance', 2] },
          avg_baseline_play: { $round: ['$avg_baseline_play', 2] },
          avg_dead_zone_presence: { $round: ['$avg_dead_zone_presence', 2] },

          // Additional stats
          total_shots: 1,
          total_successful_shots: 1,
          shot_breakdown: {
            forehand: '$total_forehand',
            backhand: '$total_backhand',
            volley: '$total_volleys',
            smash: '$total_smashes',
          },

          // Sprint bursts
          total_sprint_bursts: { $round: ['$total_sprint_bursts', 0] },
          avg_sprint_bursts_per_match: {
            $round: ['$avg_sprint_bursts_per_match', 2],
          },

          period: {
            from: '$first_match',
            to: '$last_match',
          },
        },
      },
    ];

    // Add sorting based on metric
    const sortField = this.getSortField(metric);
    pipeline.push({ $sort: { [sortField]: -1 } });
    pipeline.push({ $limit: limit });

    // Add ranking
    pipeline.push({
      $group: {
        _id: null,
        leaderboard: { $push: '$$ROOT' },
      },
    });

    pipeline.push({
      $unwind: { path: '$leaderboard', includeArrayIndex: 'rank' },
    });

    pipeline.push({
      $replaceRoot: {
        newRoot: {
          $mergeObjects: ['$leaderboard', { rank: { $add: ['$rank', 1] } }],
        },
      },
    });

    const results = await Analysis.aggregate(pipeline);

    return {
      metric,
      period: { startDate, endDate },
      total_users: results.length,
      leaderboard: results,
    };
  }

  /**
   * Get leaderboard for followers/following network
   * @param {String} userId - User ID to get network leaderboard for
   * @param {Object} options - Same options as platform leaderboard
   */
  static async getNetworkLeaderboard(userId, options = {}) {
    // Get user's network (followers + following + self)
    const network = await this.getUserNetwork(userId);

    if (network.length === 0) {
      return {
        metric: options.metric || 'distance',
        network_size: 0,
        leaderboard: [],
      };
    }

    // Add network filter to match criteria
    const networkOptions = {
      ...options,
      userIds: network,
    };

    return await this.getLeaderboardForUsers(networkOptions);
  }

  /**
   * Get leaderboard for specific set of users
   */
  static async getLeaderboardForUsers(options = {}) {
    const {
      userIds,
      metric = 'distance',
      limit = 50,
      minMatches = 1,
      ...baseOptions
    } = options;

    if (!userIds || userIds.length === 0) {
      return {
        metric,
        total_users: 0,
        leaderboard: [],
      };
    }

    // Build match criteria with user filter
    const matchCriteria = {
      status: 'completed',
      created_by: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
    };

    if (baseOptions.startDate || baseOptions.endDate) {
      matchCriteria.createdAt = {};
      if (baseOptions.startDate)
        matchCriteria.createdAt.$gte = new Date(baseOptions.startDate);
      if (baseOptions.endDate)
        matchCriteria.createdAt.$lte = new Date(baseOptions.endDate);
    }

    // Use the same pipeline structure as getPlatformLeaderboard
    const pipeline = [
      { $match: matchCriteria },

      // Get first player from each analysis
      {
        $addFields: {
          first_player: { $arrayElemAt: ['$player_analytics.players', 0] },
        },
      },

      // Group by user (created_by)
      {
        $group: {
          _id: '$created_by',
          total_matches: { $sum: 1 },

          // Distance metrics
          total_distance_km: { $sum: '$first_player.total_distance_km' },
          avg_distance_per_match: { $avg: '$first_player.total_distance_km' },

          // Speed metrics
          avg_speed_kmh: { $avg: '$first_player.average_speed_kmh' },
          max_speed_kmh: { $max: '$first_player.average_speed_kmh' },
          avg_peak_speed_kmh: { $avg: '$first_player.peak_speed_kmh' },
          max_peak_speed_kmh: { $max: '$first_player.peak_speed_kmh' },

          // Court positioning metrics
          avg_net_dominance: { $avg: '$first_player.net_dominance_percentage' },
          avg_baseline_play: { $avg: '$first_player.baseline_play_percentage' },
          avg_dead_zone_presence: {
            $avg: '$first_player.dead_zone_presence_percentage',
          },

          // Shot success metrics
          total_shots: { $sum: '$first_player.shots.total_shots' },
          total_successful_shots: { $sum: '$first_player.shots.success' },
          avg_success_rate: { $avg: '$first_player.shots.success_rate' },

          // Calories metrics
          total_calories: { $sum: '$first_player.calories_burned' },
          avg_calories_per_match: { $avg: '$first_player.calories_burned' },

          // Additional stats
          total_forehand: { $sum: '$first_player.shots.forehand' },
          total_backhand: { $sum: '$first_player.shots.backhand' },
          total_volleys: { $sum: '$first_player.shots.volley' },
          total_smashes: { $sum: '$first_player.shots.smash' },

          // Sprint bursts
          total_sprint_bursts: { $sum: '$first_player.total_sprint_bursts' },
          avg_sprint_bursts_per_match: {
            $avg: '$first_player.total_sprint_bursts',
          },

          // Time range
          first_match: { $min: '$createdAt' },
          last_match: { $max: '$createdAt' },
        },
      },

      // Filter by minimum matches
      { $match: { total_matches: { $gte: minMatches } } },

      // Calculate overall success rate
      {
        $addFields: {
          overall_success_rate: {
            $cond: {
              if: { $gt: ['$total_shots', 0] },
              then: {
                $multiply: [
                  { $divide: ['$total_successful_shots', '$total_shots'] },
                  100,
                ],
              },
              else: 0,
            },
          },
        },
      },

      // Populate user details
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },

      { $unwind: '$user' },

      // Project final structure
      {
        $project: {
          user_id: '$_id',
          name: '$user.fullName',
          username: '$user.username',
          email: '$user.email',
          profile_image: '$user.profile_image',
          total_matches: 1,

          // Main metrics for ranking
          total_distance_km: { $round: ['$total_distance_km', 4] },
          avg_distance_per_match: { $round: ['$avg_distance_per_match', 4] },
          avg_speed_kmh: { $round: ['$avg_speed_kmh', 2] },
          max_speed_kmh: { $round: ['$max_speed_kmh', 2] },
          avg_peak_speed_kmh: { $round: ['$avg_peak_speed_kmh', 2] },
          max_peak_speed_kmh: { $round: ['$max_peak_speed_kmh', 2] },
          avg_net_dominance: { $round: ['$avg_net_dominance', 2] },
          avg_baseline_play: { $round: ['$avg_baseline_play', 2] },
          avg_dead_zone_presence: { $round: ['$avg_dead_zone_presence', 2] },
          overall_success_rate: { $round: ['$overall_success_rate', 2] },
          avg_success_rate: { $round: ['$avg_success_rate', 2] },
          total_calories: { $round: ['$total_calories', 2] },
          avg_calories_per_match: { $round: ['$avg_calories_per_match', 2] },

          // Additional stats
          total_shots: 1,
          total_successful_shots: 1,
          shot_breakdown: {
            forehand: '$total_forehand',
            backhand: '$total_backhand',
            volley: '$total_volleys',
            smash: '$total_smashes',
          },

          // Sprint bursts
          total_sprint_bursts: { $round: ['$total_sprint_bursts', 0] },
          avg_sprint_bursts_per_match: {
            $round: ['$avg_sprint_bursts_per_match', 2],
          },

          period: {
            from: '$first_match',
            to: '$last_match',
          },
        },
      },
    ];

    // Add sorting based on metric
    const sortField = this.getSortField(metric);
    pipeline.push({ $sort: { [sortField]: -1 } });
    pipeline.push({ $limit: limit });

    // Add ranking
    pipeline.push({
      $group: {
        _id: null,
        leaderboard: { $push: '$$ROOT' },
      },
    });

    pipeline.push({
      $unwind: { path: '$leaderboard', includeArrayIndex: 'rank' },
    });

    pipeline.push({
      $replaceRoot: {
        newRoot: {
          $mergeObjects: ['$leaderboard', { rank: { $add: ['$rank', 1] } }],
        },
      },
    });

    const results = await Analysis.aggregate(pipeline);

    return {
      metric,
      period: {
        startDate: baseOptions.startDate,
        endDate: baseOptions.endDate,
      },
      total_users: results.length,
      leaderboard: results,
    };
  }

  /**
   * Get user's network (followers + following + self)
   */
  static async getUserNetwork(userId) {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [followers, following] = await Promise.all([
      Follow.find({ following: userObjectId }).select('follower'),
      Follow.find({ follower: userObjectId }).select('following'),
    ]);

    const network = new Set([userId]); // Include self

    followers.forEach((f) => network.add(f.follower.toString()));
    following.forEach((f) => network.add(f.following.toString()));

    return Array.from(network);
  }

  /**
   * Get user's position in various leaderboards
   */
  static async getUserLeaderboardPosition(userId, options = {}) {
    const metrics = [
      'total_distance_km',
      'avg_speed_kmh',
      'overall_success_rate',
      'total_calories',
      'total_shots', // Added total shots metric
    ];
    const positions = {};

    for (const metric of metrics) {
      // Convert metric name to the format expected by getPlatformLeaderboard
      let metricParam = metric
        .replace('total_', '')
        .replace('overall_', '')
        .replace('avg_', '');

      // Handle special case for shots
      if (metric === 'total_shots') {
        metricParam = 'shots';
      }

      const leaderboard = await this.getPlatformLeaderboard({
        ...options,
        metric: metricParam,
        limit: 1000, // Get enough to find user position
      });

      const userPosition = leaderboard.leaderboard.findIndex(
        (entry) => entry.user_id.toString() === userId
      );

      positions[metric] = {
        rank: userPosition >= 0 ? userPosition + 1 : null,
        total_users: leaderboard.total_users,
        percentile:
          userPosition >= 0
            ? Math.round(
                ((leaderboard.total_users - userPosition) /
                  leaderboard.total_users) *
                  100
              )
            : null,
      };
    }

    return positions;
  }

  static async getUserNetworkPosition(userId, options = {}) {
    const network = await this.getUserNetwork(userId);

    const leaderboard = await this.getNetworkLeaderboard(userId, {
      ...options,
      userIds: network,
      limit: 1000,
    });

    const userPosition = leaderboard.leaderboard.findIndex(
      (entry) => entry.user_id.toString() === userId
    );
  }

  /**
   * Get multiple leaderboard types at once
   */
  static async getMultipleLeaderboards(userId, options = {}) {
    const [platform, network, userPositions] = await Promise.all([
      this.getPlatformLeaderboard(options),
      userId ? this.getNetworkLeaderboard(userId, options) : null,
      userId ? this.getUserLeaderboardPosition(userId, options) : null,
    ]);

    return {
      platform_leaderboard: platform,
      network_leaderboard: network,
      user_positions: userPositions,
      generated_at: new Date(),
    };
  }

  /**
   * Get leaderboard for specific time periods (weekly, monthly, all-time)
   */
  static async getPeriodicLeaderboards(userId, metric = 'distance') {
    const now = new Date();

    // Define periods
    const periods = {
      weekly: {
        startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        endDate: now,
      },
      monthly: {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate: now,
      },
      all_time: {},
    };

    const results = {};

    for (const [period, dates] of Object.entries(periods)) {
      results[period] = await this.getMultipleLeaderboards(userId, {
        metric,
        ...dates,
        limit: 10,
      });
    }

    return results;
  }

  /**
   * Helper method to get sort field based on metric
   */
  static getSortField(metric) {
    const sortFields = {
      distance: 'total_distance_km',
      speed: 'avg_speed_kmh',
      success_rate: 'overall_success_rate',
      calories: 'total_calories',
      shots: 'total_shots', // Added total shots metric
      total_shots: 'total_shots', // Alternative naming
      sprint_bursts: 'total_sprint_bursts', // Sprint bursts metric
      total_sprint_bursts: 'total_sprint_bursts', // Alternative naming
      peak_speed: 'max_peak_speed_kmh', // Peak speed metric
      net_dominance: 'avg_net_dominance', // Net dominance metric
      baseline_play: 'avg_baseline_play', // Baseline play metric
      matches: 'total_matches', // Total matches played metric
    };

    return sortFields[metric] || 'total_distance_km';
  }

  /**
   * Get all available metrics for leaderboards
   */
  static getAvailableMetrics() {
    return {
      distance: {
        field: 'total_distance_km',
        name: 'Total Distance',
        unit: 'km',
        description: 'Total distance covered across all matches',
      },
      speed: {
        field: 'avg_speed_kmh',
        name: 'Average Speed',
        unit: 'km/h',
        description: 'Average speed across all matches',
      },
      success_rate: {
        field: 'overall_success_rate',
        name: 'Success Rate',
        unit: '%',
        description: 'Overall shot success rate',
      },
      calories: {
        field: 'total_calories',
        name: 'Total Calories',
        unit: 'cal',
        description: 'Total calories burned across all matches',
      },
      shots: {
        field: 'total_shots',
        name: 'Total Shots',
        unit: 'shots',
        description: 'Total number of shots played across all matches',
      },
      sprint_bursts: {
        field: 'total_sprint_bursts',
        name: 'Total Sprint Bursts',
        unit: 'bursts',
        description: 'Total number of sprint bursts across all matches',
      },
      peak_speed: {
        field: 'max_peak_speed_kmh',
        name: 'Peak Speed',
        unit: 'km/h',
        description: 'Maximum peak speed achieved across all matches',
      },
      net_dominance: {
        field: 'avg_net_dominance',
        name: 'Net Dominance',
        unit: '%',
        description: 'Average percentage of time spent near the net',
      },
      baseline_play: {
        field: 'avg_baseline_play',
        name: 'Baseline Play',
        unit: '%',
        description: 'Average percentage of time spent at the baseline',
      },
      matches: {
        field: 'total_matches',
        name: 'Total Matches',
        unit: 'matches',
        description: 'Total number of matches played',
      },
    };
  }

  /**
   * Async wrapper that inspects the database to determine which metrics
   * actually have data available today. This lets the frontend only
   * request metrics that are supported by the current dataset.
   *
   * Returns an object mapping metric keys to the metric definition plus
   * an `available` boolean.
   */
  static async getAvailableMetricsWithAvailability() {
    const metrics = this.getAvailableMetrics();

    // Build existence checks for each metric using the Analysis collection
    const checks = {
      distance: Analysis.exists({
        status: 'completed',
        'player_analytics.players.total_distance_km': { $exists: true },
      }),
      speed: Analysis.exists({
        status: 'completed',
        'player_analytics.players.average_speed_kmh': { $exists: true },
      }),
      calories: Analysis.exists({
        status: 'completed',
        'player_analytics.players.calories_burned': { $exists: true },
      }),

      // shots: either old `shots` summary or new `shot_analytics` or non-empty shot_events
      shots: Analysis.exists({
        status: 'completed',
        $or: [
          { 'player_analytics.players.shots.total_shots': { $exists: true } },
          {
            'player_analytics.players.shot_analytics.total_shots': {
              $exists: true,
            },
          },
          { 'player_analytics.players.shot_events.0': { $exists: true } },
          { 'player_analytics.shot_events.0': { $exists: true } },
        ],
      }),

      // success_rate: either stored in shots, or derivable from shot_events.success
      success_rate: Analysis.exists({
        status: 'completed',
        $or: [
          { 'player_analytics.players.shots.success_rate': { $exists: true } },
          { 'player_analytics.players.shots.success': { $exists: true } },
          { 'player_analytics.players.shot_events.0': { $exists: true } },
          { 'player_analytics.shot_events.0': { $exists: true } },
        ],
      }),

      // sprint_bursts: check for total_sprint_bursts field
      sprint_bursts: Analysis.exists({
        status: 'completed',
        'player_analytics.players.total_sprint_bursts': { $exists: true },
      }),

      // peak_speed: check for peak_speed_kmh field
      peak_speed: Analysis.exists({
        status: 'completed',
        'player_analytics.players.peak_speed_kmh': { $exists: true },
      }),

      // net_dominance: check for net_dominance_percentage field
      net_dominance: Analysis.exists({
        status: 'completed',
        'player_analytics.players.net_dominance_percentage': { $exists: true },
      }),

      // baseline_play: check for baseline_play_percentage field
      baseline_play: Analysis.exists({
        status: 'completed',
        'player_analytics.players.baseline_play_percentage': { $exists: true },
      }),

      // matches: always available if there's any analysis data
      matches: Analysis.exists({
        status: 'completed',
      }),
    };

    const results = await Promise.all(Object.values(checks));

    const keys = Object.keys(checks);
    const metricsWithAvailability = {};
    keys.forEach((k, i) => {
      const base = metrics[k] || {};
      metricsWithAvailability[k] = {
        ...base,
        available: Boolean(results[i]),
      };
    });

    // Include any metrics that exist in the base map but weren't checked above
    Object.keys(metrics).forEach((k) => {
      if (!metricsWithAvailability[k]) {
        metricsWithAvailability[k] = { ...metrics[k], available: true };
      }
    });

    return metricsWithAvailability;
  }

  /**
   * Validate if a metric is supported
   */
  static isValidMetric(metric) {
    const availableMetrics = this.getAvailableMetrics();
    return metric in availableMetrics;
  }

  /**
   * Get trending players (most improved over period)
   */
  static async getTrendingPlayers(options = {}) {
    const { metric = 'distance', days = 30, limit = 20 } = options;

    const endDate = new Date();
    const midDate = new Date(
      endDate.getTime() - (days / 2) * 24 * 60 * 60 * 1000
    );
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Get performance for first half and second half of period
    const [firstHalf, secondHalf] = await Promise.all([
      this.getPlatformLeaderboard({
        metric,
        startDate,
        endDate: midDate,
        limit: 1000,
      }),
      this.getPlatformLeaderboard({
        metric,
        startDate: midDate,
        endDate,
        limit: 1000,
      }),
    ]);

    console.log(
      'First Half Leaderboard:',
      firstHalf,
      'Second Half Leaderboard:',
      secondHalf
    );

    // Calculate improvements
    const improvements = [];
    const sortField = this.getSortField(metric);

    secondHalf.leaderboard.forEach((current) => {
      const previous = firstHalf.leaderboard.find(
        (p) => p.user_id.toString() === current.user_id.toString()
      );

      if (previous && previous[sortField] > 0) {
        const improvement =
          ((current[sortField] - previous[sortField]) / previous[sortField]) *
          100;

        improvements.push({
          ...current,
          previous_value: previous[sortField],
          current_value: current[sortField],
          improvement_percent: Math.round(improvement * 100) / 100,
          matches_played: current.total_matches,
          metric_name: sortField, // Added to show which metric is being tracked
        });
      }
    });

    // Sort by improvement and return top performers
    improvements.sort((a, b) => b.improvement_percent - a.improvement_percent);

    return {
      metric,
      sort_field: sortField, // Added for clarity
      period_days: days,
      trending_players: improvements.slice(0, limit),
    };
  }
}

export const platformLeaderboardService = catchAsync(async (req, res, next) => {
  const { limit, startDate, endDate, minMatches, metric } = req.query;

  // Validate metric
  const requestedMetric = metric || 'distance';
  if (!TennisLeaderboard.isValidMetric(requestedMetric)) {
    return res.status(400).json({
      status: 'error',
      message: `Invalid metric: ${requestedMetric}. Available metrics: ${Object.keys(
        TennisLeaderboard.getAvailableMetrics()
      ).join(', ')}`,
    });
  }

  const leaderboard = await TennisLeaderboard.getPlatformLeaderboard({
    metric: requestedMetric,
    limit: parseInt(limit) || 50,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    minMatches: parseInt(minMatches) || 1,
  });
  const availableMetrics =
    await TennisLeaderboard.getAvailableMetricsWithAvailability();

  res.status(200).json({
    status: 'success',
    data: {
      leaderboard,
      available_metrics: availableMetrics,
    },
  });
});

export const networkLeaderboardService = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { limit, startDate, endDate, minMatches, metric } = req.query;

  // Validate metric
  const requestedMetric = metric || 'distance';
  if (!TennisLeaderboard.isValidMetric(requestedMetric)) {
    return res.status(400).json({
      status: 'error',
      message: `Invalid metric: ${requestedMetric}. Available metrics: ${Object.keys(
        TennisLeaderboard.getAvailableMetrics()
      ).join(', ')}`,
    });
  }

  const leaderboard = await TennisLeaderboard.getNetworkLeaderboard(userId, {
    metric: requestedMetric,
    limit: parseInt(limit) || 50,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    minMatches: parseInt(minMatches) || 1,
  });
  const availableMetrics =
    await TennisLeaderboard.getAvailableMetricsWithAvailability();

  res.status(200).json({
    status: 'success',
    data: {
      leaderboard,
      available_metrics: availableMetrics,
    },
  });
});

export const trendingPlayersService = catchAsync(async (req, res, next) => {
  const { limit, metric, days } = req.query;

  // Validate metric
  const requestedMetric = metric || 'success_rate';
  if (!TennisLeaderboard.isValidMetric(requestedMetric)) {
    return res.status(400).json({
      status: 'error',
      message: `Invalid metric: ${requestedMetric}. Available metrics: ${Object.keys(
        TennisLeaderboard.getAvailableMetrics()
      ).join(', ')}`,
    });
  }

  const players = await TennisLeaderboard.getTrendingPlayers({
    metric: requestedMetric,
    days: parseInt(days) || 30,
    limit: parseInt(limit) || 15,
  });
  const availableMetrics =
    await TennisLeaderboard.getAvailableMetricsWithAvailability();

  res.status(200).json({
    status: 'success',
    data: {
      players,
      available_metrics: availableMetrics,
    },
  });
});

// Add a new endpoint to get available metrics
export const getAvailableMetricsService = catchAsync(async (req, res, next) => {
  const metrics = await TennisLeaderboard.getAvailableMetricsWithAvailability();

  res.status(200).json({
    status: 'success',
    data: {
      metrics,
    },
  });
});

export const userLeaderboardPositionService = catchAsync(
  async (req, res, next) => {
    const { userId } = req.params;
    const { metric } = req.query;

    // Validate metric
    const requestedMetric = metric || 'distance';
    if (!TennisLeaderboard.isValidMetric(requestedMetric)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid metric: ${requestedMetric}. Available metrics: ${Object.keys(
          TennisLeaderboard.getAvailableMetrics()
        ).join(', ')}`,
      });
    }

    const position = await TennisLeaderboard.getUserLeaderboardPosition(
      userId,
      {
        metric: requestedMetric,
      }
    );
    const availableMetrics =
      await TennisLeaderboard.getAvailableMetricsWithAvailability();

    res.status(200).json({
      status: 'success',
      data: {
        position,
        available_metrics: availableMetrics,
      },
    });
  }
);

export const multipleLeaderboardsService = catchAsync(
  async (req, res, next) => {
    const { userId } = req.params;
    const { metric, limit, startDate, endDate } = req.query;

    // Validate metric
    const requestedMetric = metric || 'distance';
    if (!TennisLeaderboard.isValidMetric(requestedMetric)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid metric: ${requestedMetric}. Available metrics: ${Object.keys(
          TennisLeaderboard.getAvailableMetrics()
        ).join(', ')}`,
      });
    }

    const leaderboards = await TennisLeaderboard.getMultipleLeaderboards(
      userId,
      {
        metric: requestedMetric,
        limit: parseInt(limit) || 50,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      }
    );
    const availableMetrics =
      await TennisLeaderboard.getAvailableMetricsWithAvailability();

    res.status(200).json({
      status: 'success',
      data: {
        leaderboards,
        available_metrics: availableMetrics,
      },
    });
  }
);

export default TennisLeaderboard;
