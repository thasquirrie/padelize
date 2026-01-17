import OpenAI from 'openai';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/appError.js';
import Analysis from '../models/Analysis.js';
import CoachingInsight from '../models/CoachingInsight.js';

// Lazy-initialize OpenAI client to avoid errors during imports
let openai = null;
const getOpenAIClient = () => {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
};

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

⚠️ CRITICAL INSTRUCTION: You MUST use ONLY the exact metric values provided below. DO NOT invent, estimate, or fabricate ANY numbers. If you reference a metric in your analysis, use the EXACT value shown below.

PLAYER METRICS:
- Distance Covered: ${distance_km} km
- Average Speed: ${avg_speed_kmh} km/h
- Peak Speed: ${peak_speed_kmh} km/h
- Net Dominance: ${net_percentage}%
- Baseline Play: ${baseline_percentage}%
- Dead Zone Presence: ${deadzone_percentage}%
- Total Sprint Bursts: ${total_sprints}
${duration ? `- Match Duration: ${duration} minutes` : ''}

⚠️ VERIFICATION CHECKPOINT: Before generating your response, verify that:
1. If you mention Net Dominance %, you use: ${net_percentage}%
2. If you mention Baseline Play %, you use: ${baseline_percentage}%
3. If you mention Dead Zone %, you use: ${deadzone_percentage}%
4. If you mention Peak Speed, you use: ${peak_speed_kmh} km/h
5. If you mention Sprint Bursts, you use: ${total_sprints}
6. DO NOT calculate or derive any percentages - use only what is provided above

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
  "player_profile": {
    "playing_style": "One word: Aggressive/Defensive/Balanced",
    "intensity_level": "One word: High/Moderate/Low",
    "court_coverage": "One word: Excellent/Good/Limited"
  },

  "strengths": [
    {
      "title": "Best Metric Name",
      "description": "Specific observation with exact metric value (e.g., 'Your 42% net dominance shows strong attacking play')"
    },
    {
      "title": "Second Best Metric",
      "description": "Specific observation with exact metric value"
    }
  ],

  "weaknesses": [
    {
      "title": "Primary Issue",
      "description": "Specific problem with exact metric value (e.g., 'Your 35% dead zone indicates poor positioning')"
    },
    {
      "title": "Secondary Issue",
      "description": "Specific problem with exact metric value"
    }
  ],

  "actionable_tips": [
    "TIP 1 (PRIMARY): Address main weakness - With your {exact metric}%, you should {specific action}. {Why it matters for padel.}",
    "TIP 2: Address secondary weakness - {Specific metric observation}. {Concrete drill or tactical adjustment.}",
    "TIP 3: Improve strength or address tertiary issue - {Metric context}. {Actionable improvement.}"
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
- Prioritize positioning issues over fitness issues
- ⚠️ NEVER INVENT NUMBERS - Use ONLY the exact values provided in PLAYER METRICS section above
- ⚠️ If you reference Net Dominance, it MUST be ${net_percentage}%, not any other number
- ⚠️ If you reference Baseline Play, it MUST be ${baseline_percentage}%, not any other number
- ⚠️ If you reference Dead Zone, it MUST be ${deadzone_percentage}%, not any other number
- ⚠️ Double-check every number in your response matches the input metrics exactly`;

  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert PADEL coach providing metric-driven performance analysis. Always return valid JSON. CRITICAL: You must use ONLY the exact metric values provided in the user prompt - never invent, estimate, or fabricate numbers. Every percentage and statistic in your response must match the input data exactly.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent, factual responses
      max_tokens: 800,
    });

    const insights = JSON.parse(response.choices[0].message.content);

    // Validate that AI used correct numbers (basic sanity check)
    const insightsStr = JSON.stringify(insights);
    const containsMetrics = 
      insightsStr.includes(net_percentage.toString()) ||
      insightsStr.includes(baseline_percentage.toString()) ||
      insightsStr.includes(deadzone_percentage.toString());
    
    if (!containsMetrics) {
      console.warn('⚠️  WARNING: AI response may not contain expected metric values');
      console.warn('Expected metrics:', { net_percentage, baseline_percentage, deadzone_percentage });
    }

    // Calculate cost (gpt-4o-mini pricing as of 2024)
    // Input: $0.150 per 1M tokens, Output: $0.600 per 1M tokens
    const cost_usd =
      (response.usage.prompt_tokens * 0.15) / 1_000_000 +
      (response.usage.completion_tokens * 0.6) / 1_000_000;

    // Log token usage for monitoring
    console.log('OpenAI Coaching Analysis - Token Usage:', {
      prompt: response.usage.prompt_tokens,
      completion: response.usage.completion_tokens,
      total: response.usage.total_tokens,
      cost_usd: cost_usd.toFixed(6),
    });

    return {
      insights,
      usage: {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      },
      cost_usd,
    };
  } catch (error) {
    console.error('Error generating coaching insights:', error);
    throw new AppError('Failed to generate coaching insights', 500);
  }
};

/**
 * Generate coaching insights for a specific analysis
 * @param {String} analysisId - MongoDB Analysis ID
 * @param {String} playerId - Player ID (optional, defaults to creator)
 * @param {Boolean} forceRegenerate - Force regeneration even if cached (default: false)
 * @returns {Object} - Coaching insights
 */
export const getCoachingInsightsForAnalysis = async (
  analysisId,
  playerId = null,
  forceRegenerate = false
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

  const actualPlayerId = playerData.player_id;

  // Check if insights already exist in database (unless force regenerate)
  if (!forceRegenerate) {
    const existingInsight = await CoachingInsight.findOne({
      analysis: analysisId,
      player_id: actualPlayerId,
    });

    if (existingInsight) {
      console.log(
        `✅ Using cached coaching insights for analysis ${analysisId}, player ${actualPlayerId} (cached at: ${existingInsight.createdAt})`
      );
      return {
        analysis_id: analysisId,
        player_id: actualPlayerId,
        metrics: existingInsight.metrics,
        insights: existingInsight.insights,
        generated_at: existingInsight.createdAt,
        cached: true,
        tokens_used: existingInsight.tokens_used,
        cost_usd: existingInsight.cost_usd,
      };
    } else {
      console.log(
        `🔍 No cached insights found for analysis ${analysisId}, player ${actualPlayerId} - will generate new`
      );
    }
  } else {
    console.log(
      `🔄 Force regenerate requested for analysis ${analysisId}, player ${actualPlayerId} - will overwrite cache`
    );
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

  console.log(
    `🔄 Generating new coaching insights for analysis ${analysisId}, player ${actualPlayerId}`
  );
  console.log('📊 RAW PLAYER DATA FROM DATABASE:', {
    player_id: actualPlayerId,
    total_distance_km: playerData.total_distance_km,
    average_speed_kmh: playerData.average_speed_kmh,
    peak_speed_kmh: playerData.peak_speed_kmh,
    net_dominance_percentage: playerData.net_dominance_percentage,
    baseline_play_percentage: playerData.baseline_play_percentage,
    dead_zone_presence_percentage: playerData.dead_zone_presence_percentage,
    total_sprint_bursts: playerData.total_sprint_bursts,
  });
  console.log('📤 METRICS BEING SENT TO AI:', playerMetrics);

  // Generate insights using OpenAI
  const result = await generateCoachingInsights(playerMetrics);

  // Save or update insights to database for future use
  try {
    // Use findOneAndUpdate with upsert to handle race conditions and force regenerate
    const coachingInsight = await CoachingInsight.findOneAndUpdate(
      {
        analysis: analysisId,
        player_id: actualPlayerId,
      },
      {
        $set: {
          metrics: playerMetrics,
          insights: result.insights,
          model_used: 'gpt-4o-mini',
          tokens_used: result.usage || {},
          cost_usd: result.cost_usd || 0,
        },
      },
      {
        upsert: true, // Create if doesn't exist
        new: true, // Return updated document
        setDefaultsOnInsert: true,
      }
    );

    console.log(
      `💾 Saved coaching insights to database (ID: ${coachingInsight._id})`
    );
  } catch (saveError) {
    console.error('❌ Failed to save coaching insights:', saveError);
    console.error('Save error details:', {
      message: saveError.message,
      code: saveError.code,
      name: saveError.name,
    });
    // Still return the generated insights even if save fails
    console.warn(
      '⚠️  Returning generated insights without caching due to save error'
    );
  }

  return {
    analysis_id: analysisId,
    player_id: actualPlayerId,
    metrics: playerMetrics,
    insights: result.insights,
    generated_at: new Date(),
    cached: false,
    tokens_used: result.usage || {},
    cost_usd: result.cost_usd || 0,
  };
};

/**
 * Service function to generate coaching insights - for controller use
 */
export const generateCoachingInsightsService = catchAsync(
  async (req, res, next) => {
    const { analysisId } = req.params;
    const { playerId, forceRegenerate } = req.query;

    // Convert forceRegenerate to boolean
    const shouldRegenerate = forceRegenerate === 'true';

    const result = await getCoachingInsightsForAnalysis(
      analysisId,
      playerId,
      shouldRegenerate
    );

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
