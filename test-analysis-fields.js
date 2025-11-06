import { transformNewAnalysisResults, formatAnalysisResponse } from './src/utils/analysisFormatter.js';

// Sample response from the new AI API format
const newApiResponse = {
  "status": "success",
  "job_id": "66ba603e-2aab-4143-a60d-0bc24ad6ab3c",
  "analysis_status": "completed",
  "results": {
    "a": {
      "Distance Covered": "25.586 Meters",
      "Average Speed": "14.47575 Kilometers per Hour",
      "Peak Speed": "16.344 Kilometers per Hour",
      "Net Dominance": "35.0 %",
      "Dead Zone Presence": "31.08 %",
      "Baseline Play": "33.92%",
      "Total Sprint Bursts": "4",
      "Player Heatmap": "https://padelizeresources.s3.amazonaws.com/a.jpg"
    },
    "b": {
      "Distance Covered": "30.125 Meters",
      "Average Speed": "16.25 Kilometers per Hour",
      "Peak Speed": "18.5 Kilometers per Hour",
      "Net Dominance": "42.5 %",
      "Dead Zone Presence": "28.0 %",
      "Baseline Play": "29.5%",
      "Total Sprint Bursts": "6",
      "Player Heatmap": "https://padelizeresources.s3.amazonaws.com/b.jpg"
    }
  }
};

console.log('=== Step 1: Transform API Response ===\n');

const transformed = transformNewAnalysisResults(newApiResponse);

console.log('Checking player "a" after transformation:');
const playerA = transformed.player_analytics.players[0];
console.log('- Has total_sprint_bursts:', 'total_sprint_bursts' in playerA, '=', playerA.total_sprint_bursts);
console.log('- Has player_heatmap:', 'player_heatmap' in playerA, '=', playerA.player_heatmap);

console.log('\n=== Step 2: Format Analysis Response ===\n');

// Add match_id as would be done in the actual flow
transformed.match_id = 'test-match-id-123';

const formatted = formatAnalysisResponse(transformed, 'test-user-id');

console.log('Checking player "a" after formatting:');
const formattedPlayerA = formatted.player_analytics.players[0];
console.log('- Has total_sprint_bursts:', 'total_sprint_bursts' in formattedPlayerA, '=', formattedPlayerA.total_sprint_bursts);
console.log('- Has player_heatmap:', 'player_heatmap' in formattedPlayerA, '=', formattedPlayerA.player_heatmap);

console.log('\n=== Full Player Object ===\n');
console.log(JSON.stringify(formattedPlayerA, null, 2));

console.log('\n=== Verification ===\n');
const hasAllFields = 
  'total_sprint_bursts' in formattedPlayerA &&
  'player_heatmap' in formattedPlayerA &&
  formattedPlayerA.total_sprint_bursts === 4 &&
  formattedPlayerA.player_heatmap === 'https://padelizeresources.s3.amazonaws.com/a.jpg';

if (hasAllFields) {
  console.log('✅ SUCCESS: Both fields are present in the analysis object!');
} else {
  console.log('❌ FAILURE: Fields are missing or have incorrect values');
  process.exit(1);
}
