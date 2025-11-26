import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Analysis from './src/models/Analysis.js';
import Match from './src/models/Match.js';

dotenv.config();

const testCompleteHighlightsFlow = async () => {
  try {
    const DB = process.env.DATABASE.replace(
      '<password>',
      process.env.DATABASE_PASSWORD
    );
    await mongoose.connect(DB);
    console.log('✅ Connected to database\n');

    // Mock API response matching your actual structure
    const mockApiResponse = {
      status: 'success',
      job_id: 'test-job-123',
      analysis_status: 'completed',
      results: {
        a: {
          'Distance Covered': '88.84 Meters',
          'Average Speed': '2.67 Kilometers per Hour',
          'Peak Speed': '5.57 Kilometers per Hour',
          'Net Dominance': '3.0 %',
          'Dead Zone Presence': '30.69 %',
          'Baseline Play': '66.31%',
          'Total Sprint Bursts': '0',
          'Player Heatmap': 'https://padelizeresources.s3.amazonaws.com/a.jpg',
        },
        b: {
          'Distance Covered': '89.03 Meters',
          'Average Speed': '8.60 Kilometers per Hour',
          'Peak Speed': '16.43 Kilometers per Hour',
          'Net Dominance': '22.17 %',
          'Dead Zone Presence': '56.47 %',
          'Baseline Play': '21.36%',
          'Total Sprint Bursts': '1',
          'Player Heatmap': 'https://padelizeresources.s3.amazonaws.com/b.jpg',
        },
        all_clips: [
          'https://padelizeresources.s3.amazonaws.com/clip_1.mp4',
          'https://padelizeresources.s3.amazonaws.com/clip_2.mp4',
          'https://padelizeresources.s3.amazonaws.com/clip_3.mp4',
        ],
      },
    };

    console.log('=== Step 1: Extract all_clips from results ===');
    const all_clips = mockApiResponse.results.all_clips;
    console.log('✅ Found', all_clips.length, 'clips in results.all_clips');
    console.log('Clips:', all_clips);
    console.log();

    console.log('=== Step 2: Create highlights Map ===');
    const highlightsMap = new Map();
    if (all_clips && Array.isArray(all_clips) && all_clips.length > 0) {
      highlightsMap.set('all', all_clips);
    }
    console.log('✅ Highlights Map created');
    console.log('- Size:', highlightsMap.size);
    console.log('- Keys:', [...highlightsMap.keys()]);
    console.log('- Values:', [...highlightsMap.values()]);
    console.log();

    // Create a test match first
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

    console.log('=== Step 3: Create Analysis with highlights ===');
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
            player_heatmap: 'https://padelizeresources.s3.amazonaws.com/a.jpg',
          },
          {
            player_id: 'b',
            color: [0, 0, 255],
            total_distance_km: 0.08903,
            average_speed_kmh: 8.6,
            peak_speed_kmh: 16.43,
            net_dominance_percentage: 22.17,
            dead_zone_presence_percentage: 56.47,
            baseline_play_percentage: 21.36,
            total_sprint_bursts: 1,
            average_distance_from_center_km: 0,
            calories_burned: 19.1,
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
            player_heatmap: 'https://padelizeresources.s3.amazonaws.com/b.jpg',
          },
        ],
        court_info: {
          length: 20,
          width: 10,
          corners: [[0, 0], [20, 0], [20, 10], [0, 10]],
        },
      },
      files: {
        highlights: highlightsMap, // The Map we created
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

    console.log('=== Step 4: Verify highlights in database ===');
    const savedAnalysis = await Analysis.findById(analysis._id);
    
    console.log('Saved highlights:');
    console.log('- Type:', savedAnalysis.files.highlights.constructor.name);
    console.log('- Size:', savedAnalysis.files.highlights.size);
    console.log('- Has "all" key:', savedAnalysis.files.highlights.has('all'));
    
    const savedClips = savedAnalysis.files.highlights.get('all');
    console.log('- Clips count:', savedClips?.length || 0);
    console.log('- Clips:', savedClips);
    console.log();

    if (savedClips && savedClips.length === 3) {
      console.log('✅ SUCCESS: All 3 highlight clips saved correctly!');
      console.log('✅ Clips are accessible via files.highlights.get("all")');
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

testCompleteHighlightsFlow();
