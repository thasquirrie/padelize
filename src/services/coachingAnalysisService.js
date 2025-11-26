import OpenAI from 'openai';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/appError.js';
import Analysis from '../models/Analysis.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate coaching insights from player metrics
 * @param {Object} playerMetrics - Player performance metrics
 * @returns {Object} - Coaching insights with tips, strengths, weaknesses
 */
export const generateCoachingInsights = async (playerMetrics) => {
  const {
    distance_km,
    avg_speed_kmh,
    peak_speed_kmh,
    net_percentage,
    baseline_percentage,
    deadzone_percentage,
    total_sprints,
    duration,
  } = playerMetrics;

  const prompt = `You are an expert PADEL coach analyzing a player's match performance data. Based on the metrics below, provide exactly 3-4 specific, actionable coaching tips focused on improving their padel game.

PLAYER METRICS:
- Distance Covered: ${distance_km} km
- Average Speed: ${avg_speed_kmh} km/h
- Peak Speed: ${peak_speed_kmh} km/h
- Net Dominance: ${net_percentage}%
- Baseline Play: ${baseline_percentage}%
- Dead Zone Presence: ${deadzone_percentage}%
- Total Sprint Bursts: ${total_sprints}
${duration ? `- Match Duration: ${duration} minutes` : ''}

PADEL-SPECIFIC CONTEXT:
- Court positioning matters: Net (aggressive), Baseline (defensive), Dead Zone (poor positioning)
- Dead Zone (mid-court) = vulnerable positioning in padel
- Sprint bursts indicate explosiveness and court coverage ability
- Padel requires balance between net aggression and baseline defense
- In padel, walls are part of play - positioning relative to walls matters

COACHING GUIDELINES:
1. Identify 2-3 strengths and 2-3 weaknesses from metrics
2. Each strength/weakness MUST reference specific metric values
3. Focus on PADEL tactics (wall play, positioning, court coverage)
4. Prioritize tips by impact: positioning > movement > speed
5. Keep each tip actionable and specific (1-2 sentences max)
6. If dead zone > 30%: MUST address positioning
7. If sprint bursts < 5 for a full match: address explosiveness
8. If net dominance < 25%: encourage more aggressive play
9. If baseline > 50%: may be too defensive

METRIC INTERPRETATION RULES:
Dead Zone:
  - Excellent: <20%
  - Good: 20-25%
  - Acceptable: 25-30%
  - Problem: >30% (MUST be addressed in weaknesses)

Net Dominance:
  - Excellent: >40%
  - Good: 30-40%
  - Acceptable: 25-30%
  - Too Defensive: <25%

Baseline Play:
  - Balanced: 40-50%
  - Too Defensive: >50%
  - Too Aggressive: <30%

Sprint Bursts (per match):
  - Excellent: >8
  - Good: 6-8
  - Acceptable: 4-6
  - Low Explosiveness: <4

Peak Speed:
  - Fast: >18 km/h
  - Average: 14-18 km/h
  - Slow: <14 km/h

OUTPUT FORMAT (JSON):
{
  "player_profile": "One sentence summarizing playstyle based on metrics (e.g., 'Defensive baseline player with limited court coverage')",

  "strengths": [
    "Strength 1: [Best metric/pattern] - {specific metric value with context}",
    "Strength 2: [Second best aspect] - {specific metric value with context}",
    "Strength 3: [Third positive if exists] - {specific metric value with context}"
  ],

  "weaknesses": [
    "Weakness 1 (PRIMARY): [Biggest issue] - {specific metric value with context}",
    "Weakness 2: [Second issue] - {specific metric value with context}",
    "Weakness 3: [Third issue if exists] - {specific metric value with context}"
  ],

  "actionable_tips": [
    "TIP 1 (PRIMARY): [Address main weakness] - With your {metric}%, you should {specific action}. {Why it matters for padel.}",
    "TIP 2: [Address secondary weakness] - {Specific metric observation}. {Concrete drill or tactical adjustment.}",
    "TIP 3: [Improve strength or address tertiary issue] - {Metric context}. {Actionable improvement.}",
    "TIP 4 (optional): [Additional improvement] - {Context}. {Specific action.}"
  ],

  "tactical_summary": "One sentence on overall game improvement direction"
}

STRENGTH/WEAKNESS GUIDELINES:
- Strengths: Identify 2-3 positive metrics with values (minimum 2)
- Weaknesses: Identify 2-3 issues in priority order (most impactful first)
- ALWAYS include actual metric values in each item
- Primary weakness MUST be addressed in first tip
- If only 2 clear strengths/weaknesses exist, don't force a third
- Each weakness should map to a tip (Weakness 1 → Tip 1, etc.)

CRITICAL RULES:
- ALWAYS reference specific metric values (e.g., "Your 42% dead zone...")
- NEVER give generic advice like "work on fitness" without metric context
- Each tip must be padel-specific (not tennis tactics)
- Maximum 4 tips, minimum 3 tips
- Be direct and coaching-focused, not motivational fluff
- Prioritize positioning issues over fitness issues`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert PADEL coach providing metric-driven performance analysis. Always return valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 800,
    });

    const insights = JSON.parse(response.choices[0].message.content);

    // Log token usage for monitoring
    console.log('OpenAI Coaching Analysis - Token Usage:', {
      prompt: response.usage.prompt_tokens,
      completion: response.usage.completion_tokens,
      total: response.usage.total_tokens,
    });

    return insights;
  } catch (error) {
    console.error('Error generating coaching insights:', error);
    throw new AppError('Failed to generate coaching insights', 500);
  }
};

/**
 * Generate coaching insights for a specific analysis
 * @param {String} analysisId - MongoDB Analysis ID
 * @param {String} playerId - Player ID (optional, defaults to creator)
 * @returns {Object} - Coaching insights
 */
export const getCoachingInsightsForAnalysis = async (
  analysisId,
  playerId = null
) => {
  // Fetch the analysis
  const analysis = await Analysis.findById(analysisId);

  if (!analysis) {
    throw new AppError('Analysis not found', 404);
  }

  if (analysis.status !== 'completed') {
    throw new AppError('Analysis is not completed yet', 400);
  }

  // Find the player data
  let playerData;
  if (playerId) {
    playerData = analysis.player_analytics.players.find(
      (p) => p.player_id === playerId
    );
  } else {
    // Default to first player (usually creator)
    playerData = analysis.player_analytics.players[0];
  }

  if (!playerData) {
    throw new AppError('Player data not found', 404);
  }

  // Extract metrics
  const playerMetrics = {
    distance_km: playerData.total_distance_km || 0,
    avg_speed_kmh: playerData.average_speed_kmh || 0,
    peak_speed_kmh: playerData.peak_speed_kmh || 0,
    net_percentage: playerData.net_dominance_percentage || 0,
    baseline_percentage: playerData.baseline_play_percentage || 0,
    deadzone_percentage: playerData.dead_zone_presence_percentage || 0,
    total_sprints: playerData.total_sprint_bursts || 0,
    duration: analysis.player_analytics.metadata?.duration_minutes || null,
  };

  // Generate insights
  const insights = await generateCoachingInsights(playerMetrics);

  return {
    analysis_id: analysisId,
    player_id: playerData.player_id,
    metrics: playerMetrics,
    insights: insights,
    generated_at: new Date(),
  };
};

/**
 * Service function to generate coaching insights - for controller use
 */
export const generateCoachingInsightsService = catchAsync(
  async (req, res, next) => {
    const { analysisId } = req.params;
    const { playerId } = req.query;

    const result = await getCoachingInsightsForAnalysis(analysisId, playerId);

    res.status(200).json({
      status: 'success',
      data: result,
    });
  }
);

export default {
  generateCoachingInsights,
  getCoachingInsightsForAnalysis,
  generateCoachingInsightsService,
};
