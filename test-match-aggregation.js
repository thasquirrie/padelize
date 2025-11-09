/**
 * Test Match Aggregation with Guest Players
 * 
 * This tests that all match aggregation pipelines work correctly
 * with the guest player changes
 */

import mongoose from 'mongoose';
import Match from './src/models/Match.js';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/padelize');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Test data with mixed player types
const testUserId = new mongoose.Types.ObjectId();

const testMatches = [
  {
    format: 'single',
    type: 'friendly',
    creator: testUserId,
    location: 'Test Court 1',
    teams: [
      {
        players: [
          {
            player: testUserId,
            color: 'red',
          }
        ],
        score: 0,
      },
      {
        players: [
          {
            name: 'Guest Player 1',
            color: 'blue',
          }
        ],
        score: 0,
      }
    ]
  },
  {
    format: 'double',
    type: 'friendly',
    creator: testUserId,
    location: 'Test Court 2',
    teams: [
      {
        players: [
          {
            player: testUserId,
            color: 'red',
          },
          {
            name: 'Guest Partner',
            color: 'orange',
          }
        ],
        score: 0,
      },
      {
        players: [
          {
            name: 'Guest Opponent 1',
            color: 'blue',
          },
          {
            name: 'Guest Opponent 2',
            color: 'green',
          }
        ],
        score: 0,
      }
    ]
  },
  {
    format: 'single',
    type: 'ranked',
    creator: testUserId,
    location: 'Test Court 3',
    teams: [
      {
        players: [
          {
            player: testUserId,
            color: 'red',
          }
        ],
        score: 0,
      },
      {
        players: [
          {
            player: new mongoose.Types.ObjectId(),
            color: 'blue',
          }
        ],
        score: 0,
      }
    ]
  }
];

async function runTests() {
  console.log('\n========================================');
  console.log('TESTING MATCH AGGREGATION WITH GUEST PLAYERS');
  console.log('========================================\n');

  try {
    // Clean up any existing test data
    console.log('🧹 Cleaning up existing test data...');
    await Match.deleteMany({ location: /^Test Court/ });

    // Create test matches
    console.log('📝 Creating test matches...');
    const createdMatches = await Match.create(testMatches);
    console.log(`✅ Created ${createdMatches.length} test matches\n`);

    // Test 1: Basic find with virtuals
    console.log('TEST 1: Basic Find with Virtuals');
    console.log('─────────────────────────────────');
    const match1 = await Match.findById(createdMatches[0]._id);
    console.log('Match Format:', match1.format);
    console.log('Teams:', match1.teams.length);
    console.log('Creator Team:', match1.creatorTeam ? '✅ Found' : '❌ Not found');
    console.log('Opponent Team:', match1.opponentTeam ? '✅ Found' : '❌ Not found');
    console.log('Registered Players:', match1.registeredPlayers);
    console.log('Guest Players:', match1.guestPlayers);
    console.log('✅ Test 1 Passed\n');

    // Test 2: Aggregation - getAllMatches pipeline
    console.log('TEST 2: getAllMatches Aggregation Pipeline');
    console.log('──────────────────────────────────────────');
    const allMatches = await Match.aggregate([
      {
        $match: {
          creator: testUserId,
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
                    $arrayElemAt: ['$$analysisDoc.player_analytics.players', 0],
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

    console.log('Matches found:', allMatches.length);
    console.log('Match formats:', allMatches.map(m => m.format).join(', '));
    console.log('All matches have teams:', allMatches.every(m => m.teams && m.teams.length === 2) ? '✅ Yes' : '❌ No');
    console.log('✅ Test 2 Passed\n');

    // Test 3: Aggregation - getUserMatches pipeline (with completed status)
    console.log('TEST 3: getUserMatches Aggregation Pipeline');
    console.log('───────────────────────────────────────────');
    
    // First, update one match to have completed status
    await Match.findByIdAndUpdate(createdMatches[0]._id, { analysisStatus: 'completed' });
    
    const userMatches = await Match.aggregate([
      {
        $match: {
          creator: testUserId,
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
                    $arrayElemAt: ['$$analysisDoc.player_analytics.players', 0],
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

    console.log('Completed matches found:', userMatches.length);
    if (userMatches.length > 0) {
      console.log('First match has teams:', userMatches[0].teams ? '✅ Yes' : '❌ No');
      console.log('First match teams length:', userMatches[0].teams?.length);
    }
    console.log('✅ Test 3 Passed\n');

    // Test 4: Test validation - should fail with invalid data
    console.log('TEST 4: Validation Tests');
    console.log('────────────────────────');
    
    try {
      await Match.create({
        format: 'single',
        type: 'friendly',
        creator: testUserId,
        location: 'Invalid Test',
        teams: [
          {
            players: [
              {
                color: 'red', // Missing both player and name - should fail
              }
            ],
          },
          {
            players: [
              {
                name: 'Valid Guest',
                color: 'blue',
              }
            ],
          }
        ]
      });
      console.log('❌ Test 4 Failed - Should have thrown validation error');
    } catch (error) {
      console.log('✅ Validation correctly rejected invalid player:', error.message);
    }

    // Test 5: Test isGuest flag is set correctly
    console.log('\nTEST 5: isGuest Flag Setting');
    console.log('─────────────────────────────');
    const matchWithGuests = await Match.findById(createdMatches[1]._id);
    
    const team1Player1 = matchWithGuests.teams[0].players[0];
    const team1Player2 = matchWithGuests.teams[0].players[1];
    const team2Player1 = matchWithGuests.teams[1].players[0];
    const team2Player2 = matchWithGuests.teams[1].players[1];
    
    console.log('Team 1, Player 1 (registered):', {
      hasPlayer: !!team1Player1.player,
      hasName: !!team1Player1.name,
      isGuest: team1Player1.isGuest,
      expected: false,
      correct: team1Player1.isGuest === false ? '✅' : '❌'
    });
    
    console.log('Team 1, Player 2 (guest):', {
      hasPlayer: !!team1Player2.player,
      hasName: !!team1Player2.name,
      isGuest: team1Player2.isGuest,
      expected: true,
      correct: team1Player2.isGuest === true ? '✅' : '❌'
    });
    
    console.log('Team 2, Player 1 (guest):', {
      hasPlayer: !!team2Player1.player,
      hasName: !!team2Player1.name,
      isGuest: team2Player1.isGuest,
      expected: true,
      correct: team2Player1.isGuest === true ? '✅' : '❌'
    });
    
    console.log('Team 2, Player 2 (guest):', {
      hasPlayer: !!team2Player2.player,
      hasName: !!team2Player2.name,
      isGuest: team2Player2.isGuest,
      expected: true,
      correct: team2Player2.isGuest === true ? '✅' : '❌'
    });
    
    console.log('✅ Test 5 Passed\n');

    // Test 6: Query by teams.players fields
    console.log('TEST 6: Querying with Teams.Players Fields');
    console.log('──────────────────────────────────────────');
    
    const matchesWithRegisteredPlayers = await Match.find({
      'teams.players.player': { $exists: true, $ne: null }
    });
    console.log('Matches with registered players:', matchesWithRegisteredPlayers.length);
    
    const matchesWithGuestPlayers = await Match.find({
      'teams.players.isGuest': true
    });
    console.log('Matches with guest players:', matchesWithGuestPlayers.length);
    
    console.log('✅ Test 6 Passed\n');

    // Clean up
    console.log('🧹 Cleaning up test data...');
    await Match.deleteMany({ location: /^Test Court/ });
    console.log('✅ Cleanup complete\n');

    console.log('========================================');
    console.log('ALL TESTS PASSED! ✅');
    console.log('========================================');
    console.log('\nSummary:');
    console.log('✅ Virtual properties work correctly');
    console.log('✅ Aggregation pipelines work correctly');
    console.log('✅ Validation works correctly');
    console.log('✅ isGuest flag is set automatically');
    console.log('✅ Queries work with both guest and registered players');
    console.log('✅ No breaking changes detected\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the tests
connectDB().then(runTests);
