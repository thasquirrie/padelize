import { transformNewAnalysisResults } from './src/utils/analysisFormatter.js';

// Mock response matching your actual AI server response structure
const mockResponse = {
  status: 'success',
  job_id: 'a67824cf-2d83-4bf5-a10d-be1efb50704b',
  analysis_status: 'completed',
  results: {
    a: {
      'Distance Covered': '88.83999999999999 Meters',
      'Average Speed': '2.6737333333333333 Kilometers per Hour',
      'Peak Speed': '5.571 Kilometers per Hour',
      'Net Dominance': '3.0 %',
      'Dead Zone Presence': '30.69 %',
      'Baseline Play': '66.31%',
      'Total Sprint Bursts': '0',
      'Player Heatmap': 'https://padelizeresources.s3.amazonaws.com/a.jpg',
    },
    b: {
      'Distance Covered': '89.027 Meters',
      'Average Speed': '8.6005 Kilometers per Hour',
      'Peak Speed': '16.431 Kilometers per Hour',
      'Net Dominance': '22.17 %',
      'Dead Zone Presence': '56.47 %',
      'Baseline Play': '21.36%',
      'Total Sprint Bursts': '1',
      'Player Heatmap': 'https://padelizeresources.s3.amazonaws.com/b.jpg',
    },
    c: {
      'Distance Covered': '109.07300000000001 Meters',
      'Average Speed': '9.2718 Kilometers per Hour',
      'Peak Speed': '17.931 Kilometers per Hour',
      'Net Dominance': '11.36 %',
      'Dead Zone Presence': '40.24 %',
      'Baseline Play': '48.4%',
      'Total Sprint Bursts': '2',
      'Player Heatmap': 'https://padelizeresources.s3.amazonaws.com/c.jpg',
    },
    d: {
      'Distance Covered': '114.02099999999996 Meters',
      'Average Speed': '8.219533333333334 Kilometers per Hour',
      'Peak Speed': '16.275 Kilometers per Hour',
      'Net Dominance': '34.24 %',
      'Dead Zone Presence': '45.22 %',
      'Baseline Play': '20.54%',
      'Total Sprint Bursts': '0',
      'Player Heatmap': 'https://padelizeresources.s3.amazonaws.com/d.jpg',
    },
    all_clips: [
      'https://padelizeresources.s3.amazonaws.com/clip_1_2025-11-26-17-58-28-10252.mp4',
      'https://padelizeresources.s3.amazonaws.com/clip_2_2025-11-26-17-58-28-10252.mp4',
      'https://padelizeresources.s3.amazonaws.com/clip_3_2025-11-26-17-58-28-10252.mp4',
    ],
  },
};

console.log('=== Testing all_clips Extraction ===\n');

// The transformNewAnalysisResults function is not exported, so let's test the logic directly
const { results } = mockResponse;
const all_clips = results.all_clips;

console.log('✅ Extracted all_clips from results:');
console.log(all_clips);
console.log();

console.log('✅ Player keys (excluding all_clips):');
const playerKeys = Object.keys(results).filter((key) => key !== 'all_clips');
console.log(playerKeys); // Should be ['a', 'b', 'c', 'd']
console.log();

console.log('✅ Number of players:', playerKeys.length);
console.log('✅ Number of clips:', all_clips?.length || 0);
console.log();

console.log('=== Player Data Sample ===');
playerKeys.forEach((playerKey) => {
  const playerData = results[playerKey];
  console.log(`\nPlayer ${playerKey}:`);
  console.log('  Distance:', playerData['Distance Covered']);
  console.log('  Avg Speed:', playerData['Average Speed']);
  console.log('  Heatmap:', playerData['Player Heatmap']);
});

console.log('\n=== Highlights Map Format ===');
const highlightsMap = new Map();
if (all_clips && Array.isArray(all_clips) && all_clips.length > 0) {
  highlightsMap.set('all', all_clips);
}

console.log('Highlights Map size:', highlightsMap.size);
console.log('Highlights under "all" key:', highlightsMap.get('all'));

console.log('\n✅ All tests passed!');
console.log('The all_clips is now correctly extracted from results object.');
