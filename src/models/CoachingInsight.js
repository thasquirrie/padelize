import mongoose from 'mongoose';

const coachingInsightSchema = new mongoose.Schema(
  {
    analysis: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Analysis',
      required: true,
    },
    player_id: {
      type: String,
      required: true,
    },
    // Player metrics used for generation
    metrics: {
      distance_km: Number,
      avg_speed_kmh: Number,
      peak_speed_kmh: Number,
      net_percentage: Number,
      baseline_percentage: Number,
      deadzone_percentage: Number,
      total_sprints: Number,
      duration: Number,
    },
    // AI-generated insights
    insights: {
      player_profile: {
        playing_style: String,
        intensity_level: String,
        court_coverage: String,
      },
      strengths: [
        {
          title: String,
          description: String,
        },
      ],
      weaknesses: [
        {
          title: String,
          description: String,
        },
      ],
      actionable_tips: [String],
      tactical_summary: String,
    },
    // Metadata
    model_used: {
      type: String,
      default: 'gpt-4o-mini',
    },
    tokens_used: {
      prompt: Number,
      completion: Number,
      total: Number,
    },
    cost_usd: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Compound index to ensure one insight per analysis-player combination
coachingInsightSchema.index({ analysis: 1, player_id: 1 }, { unique: true });

// Index for querying by analysis
coachingInsightSchema.index({ analysis: 1 });

const CoachingInsight = mongoose.model(
  'CoachingInsight',
  coachingInsightSchema
);

export default CoachingInsight;
