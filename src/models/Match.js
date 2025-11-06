import { Schema, model } from 'mongoose';

const matchSchema = new Schema(
  {
    format: {
      type: String,
      enum: ['single', 'double'],
      default: 'single',
      required: true,
    },
    video: {
      type: String,
    },
    type: {
      type: String,
      enum: ['friendly', 'ranked', 'tournament'],
      required: true,
    },
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teams: [
      {
        players: [
          {
            player: {
              type: Schema.Types.ObjectId,
              ref: 'User',
            },
            name: String, // For display purposes or non-registered players,
            color: String,
          },
        ],
        score: {
          type: Number,
          default: 0,
        },
      },
    ],
    location: {
      type: String,
      required: true,
    },
    analysisId: {
      type: String,
      unique: true,
    },
    public: {
      type: Boolean,
      default: false,
    },
    analysisStatus: {
      type: String,
      enum: [
        'restarting',
        'pending',
        'processing',
        'progressing',
        'completed',
        'failed',
        'not_found',
      ],
    },
    analysisStatusId: {
      type: Schema.Types.ObjectId,
      ref: 'AnalysisStatus',
    },
    fetchedPlayerData: {
      type: Boolean,
      default: false,
    },
    formattedPlayerData: {
      type: Boolean,
      default: false,
    },
    players: {
      type: Schema.Types.Mixed, // Array of player details { id, name, position, team }
      default: [],
    },
    playerDetectionStatus: {
      type: String,
      enum: ['not_started', 'processing', 'completed', 'failed'],
      default: 'not_started',
    },
    playerDetectionStartedAt: Date,
    playerDetectionCompletedAt: Date,
    playerDetectionError: String,
    playerDetectionRetryCount: {
      type: Number,
      default: 0,
    },
    // startTime: {
    //   type: Date,
    //   required: true,
    // },
    // status: {
    //   type: String,
    //   enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    //   default: 'pending',
    // },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: { virtuals: true },
  }
);

// Index to quickly find matches by creator and type
matchSchema.index({ creator: 1, type: 1 });
// Index to quickly find matches by analysisId
// matchSchema.index({ analysisId: 1 });

// Middleware to validate team structure based on match format
matchSchema.pre('save', function (next) {
  // Ensure we have exactly 2 teams
  if (this.teams.length !== 2) {
    const error = new Error('A match must have exactly 2 teams');
    return next(error);
  }

  // For singles: each team should have exactly 1 player
  // For doubles: each team should have exactly 2 players
  const expectedPlayersPerTeam = this.format === 'single' ? 1 : 2;

  for (const team of this.teams) {
    if (team.players.length !== expectedPlayersPerTeam) {
      const error = new Error(
        `${this.format} matches must have exactly ${expectedPlayersPerTeam} player(s) per team`
      );
      return next(error);
    }
  }

  next();
});

// Virtual to easily find the creator's team
matchSchema.virtual('creatorTeam').get(function () {
  return this.teams.find((team) =>
    team.players.some(
      (playerObj) =>
        playerObj.player &&
        playerObj.player.toString() === this.creator.toString()
    )
  );
});

// Virtual to easily find the opponent team
matchSchema.virtual('opponentTeam').get(function () {
  return this.teams.find(
    (team) =>
      !team.players.some(
        (playerObj) =>
          playerObj.player &&
          playerObj.player.toString() === this.creator.toString()
      )
  );
});

const Match = model('Match', matchSchema);

export default Match;
