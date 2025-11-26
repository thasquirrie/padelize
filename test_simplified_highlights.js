import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Analysis from './src/models/Analysis.js';
import Match from './src/models/Match.js';

dotenv.config();

const testSimplifiedHighlights = async () => {
  try {
    const DB = process.env.DATABASE.replace(
      '<password>',
      process.env.DATABASE_PASSWORD
    );
    await mongoose.connect(DB);
    console.log('✅ Connected to database\n');

    // Create a test match
    const testMatch = await Match.create({
      format: 'double',
      type: 'friendly',
      location: 'Test Court',
      creator: new mongoose.Types.ObjectId(),
      teams: [
        { 
          players: [
            { name: 'Player A' },
            { name: 'Player B' }
          ], 
          score: 0 
        },
        { 
          players: [
            { name: 'Player C' },
            { name: 'Player D' }
          ], 
          score: 0 
        },
      ],
      analysisStatus: 'completed',
    });

    console.log('=== Testing Simplified Highlights Array ===\n');

    // Simple array of highlight URLs
    const highlightsArray = [
      'https://padelizeresources.s3.amazonaws.com/clip_1.mp4',
      'https://padelizeresources.s3.amazonaws.com/clip_2.mp4',
      'https://padelizeresources.s3.amazonaws.com/clip_3.mp4',
    ];

    console.log('Highlights before save (Array):');
    console.log('- Type:', Array.isArray(highlightsArray) ? 'Array' : typeof highlightsArray);
    console.log('- Length:', highlightsArray.length);
    console.log('- Values:', highlightsArray);
    console.log();

    const analysisData = {
      match_id: testMatch._id,
      status: 'completed',
      player_analytics: {
        metadata: {
          duration_minutes: 0,
          date_analysed: new Date(),
          frame_shape: [1080, 1920],
          fps: 30,
          num_players: 2,
        },
        players: [
          {
            player_id: 'a',
            color: [255, 0, 0],
            total_distance_km: 0.08884,
            average_speed_kmh: 2.67,
            peak_speed_kmh: 5.57,
            net_dominance_percentage: 3.0,
            dead_zone_presence_percentage: 30.69,
            baseline_play_percentage: 66.31,
            total_sprint_bursts: 0,
            average_distance_from_center_km: 0,
            calories_burned: 7.68,
            shots: {
              total_shots: 0,
              forehand: 0,
              backhand: 0,
              volley: 0,
              smash: 0,
              success: 0,
              success_rate: 0,
            },
            shot_events: [],
            highlight_urls: [],
          },
        ],
        court_info: {
          length: 20,
          width: 10,
          corners: [[0, 0], [20, 0], [20, 10], [0, 10]],
        },
      },
      files: {
        highlights: highlightsArray, // Simple array!
      },
      metadata: {
        created_at: new Date(),
        completed_at: new Date(),
        storage: 's3',
      },
      created_by: new mongoose.Types.ObjectId(),
    };

    const analysis = await Analysis.create(analysisData);
    console.log('✅ Analysis created with ID:', analysis._id);
    console.log();

    console.log('=== Verifying Database Storage ===');
    const savedAnalysis = await Analysis.findById(analysis._id);
    
    console.log('Highlights after save:');
    console.log('- Type:', Array.isArray(savedAnalysis.files.highlights) ? 'Array' : typeof savedAnalysis.files.highlights);
    console.log('- Length:', savedAnalysis.files.highlights.length);
    console.log('- Values:', savedAnalysis.files.highlights);
    console.log();

    // Test helper method
    const allHighlights = savedAnalysis.getAllHighlights();
    console.log('✅ getAllHighlights() method returns:', allHighlights);
    console.log();

    if (savedAnalysis.files.highlights.length === 3) {
      console.log('✅ SUCCESS: All 3 highlight clips saved correctly as array!');
      console.log('✅ No more Map complexity - just a simple array!');
    } else {
      console.log('❌ FAILURE: Highlights not saved properly');
    }

    // Cleanup
    await Analysis.deleteOne({ _id: analysis._id });
    await Match.deleteOne({ _id: testMatch._id });
    console.log('\n🗑️  Test documents deleted');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from database');
  }
};

testSimplifiedHighlights();
