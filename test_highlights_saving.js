import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Analysis from './src/models/Analysis.js';

dotenv.config();

const testHighlightsSaving = async () => {
  try {
    const DB = process.env.DATABASE.replace(
      '<password>',
      process.env.DATABASE_PASSWORD
    );
    await mongoose.connect(DB);
    console.log('✅ Connected to database\n');

    // Create a test analysis with highlights Map
    const highlightsMap = new Map();
    highlightsMap.set('all', [
      'https://example.com/clip1.mp4',
      'https://example.com/clip2.mp4',
      'https://example.com/clip3.mp4',
    ]);

    const testData = {
      match_id: new mongoose.Types.ObjectId(),
      status: 'completed',
      player_analytics: {
        metadata: {
          duration_minutes: 75,
          date_analysed: new Date(),
          frame_shape: [1080, 1920],
          fps: 30,
          num_players: 2,
        },
        players: [
          {
            player_id: 'a',
            color: [255, 0, 0],
            total_distance_km: 2.5,
            average_speed_kmh: 8.5,
            peak_speed_kmh: 15.2,
            net_dominance_percentage: 35,
            dead_zone_presence_percentage: 20,
            baseline_play_percentage: 45,
            total_sprint_bursts: 12,
            average_distance_from_center_km: 0,
            calories_burned: 450,
            shots: {
              total_shots: 50,
              forehand: 20,
              backhand: 15,
              volley: 10,
              smash: 5,
              success: 40,
              success_rate: 80,
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
        highlights: highlightsMap, // Map with highlights
      },
      metadata: {
        created_at: new Date(),
        completed_at: new Date(),
        storage: 's3',
      },
      created_by: new mongoose.Types.ObjectId(),
    };

    console.log('=== Creating Test Analysis ===');
    console.log('Highlights Map before save:');
    console.log('- Type:', testData.files.highlights.constructor.name);
    console.log('- Size:', testData.files.highlights.size);
    console.log('- Content:', [...testData.files.highlights.entries()]);
    console.log();

    const analysis = await Analysis.create(testData);
    console.log('✅ Analysis created with ID:', analysis._id);
    console.log();

    console.log('=== Fetching from Database ===');
    const fetchedAnalysis = await Analysis.findById(analysis._id);
    
    console.log('Highlights after save:');
    console.log('- Type:', fetchedAnalysis.files.highlights.constructor.name);
    console.log('- Size:', fetchedAnalysis.files.highlights.size);
    console.log('- Content:', [...fetchedAnalysis.files.highlights.entries()]);
    console.log();

    const allClips = fetchedAnalysis.files.highlights.get('all');
    console.log('✅ Retrieved clips under "all" key:', allClips);
    console.log('✅ Number of clips:', allClips?.length || 0);

    if (allClips && allClips.length === 3) {
      console.log('\n✅ SUCCESS: Highlights Map saved and retrieved correctly!');
    } else {
      console.log('\n❌ FAILURE: Highlights not saved properly');
    }

    // Cleanup
    await Analysis.deleteOne({ _id: analysis._id });
    console.log('\n🗑️  Test document deleted');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from database');
  }
};

testHighlightsSaving();
