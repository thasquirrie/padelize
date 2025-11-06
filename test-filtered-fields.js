import { transformNewAnalysisResults, formatAnalysisResponse } from './src/utils/analysisFormatter.js';
import { filterAnalysisResultsBySubscription } from './src/utils/subscriptionUtils.js';

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
    }
  }
};

console.log('=== Testing Field Preservation Through Filtering ===\n');

// Step 1: Transform
const transformed = transformNewAnalysisResults(newApiResponse);
transformed.match_id = 'test-match-id';

// Step 2: Format
const formatted = formatAnalysisResponse(transformed, 'test-user-id');

// Step 3: Filter with Free User (correct structure)
const freeUser = {
  subscription: {
    plan: 'free',
    status: 'active'
  }
};

const filteredFree = filterAnalysisResultsBySubscription(formatted, freeUser);
const freePlayerA = filteredFree.player_analytics.players[0];

console.log('FREE USER - Player "a":');
console.log('- Has total_sprint_bursts:', 'total_sprint_bursts' in freePlayerA, '=', freePlayerA.total_sprint_bursts);
console.log('- Has player_heatmap:', 'player_heatmap' in freePlayerA, '=', freePlayerA.player_heatmap);

// Step 4: Filter with Pro User (correct structure)
const proUser = {
  subscription: {
    plan: 'pro',
    status: 'active'
  }
};

const filteredPro = filterAnalysisResultsBySubscription(formatted, proUser);
const proPlayerA = filteredPro.player_analytics.players[0];

console.log('\nPRO USER - Player "a":');
console.log('- Has total_sprint_bursts:', 'total_sprint_bursts' in proPlayerA, '=', proPlayerA.total_sprint_bursts);
console.log('- Has player_heatmap:', 'player_heatmap' in proPlayerA, '=', proPlayerA.player_heatmap);

console.log('\n=== Full Filtered Player Object (Free User) ===\n');
console.log(JSON.stringify(freePlayerA, null, 2));

console.log('\n=== Verification ===\n');

const freeHasFields = 
  'total_sprint_bursts' in freePlayerA &&
  'player_heatmap' in freePlayerA &&
  freePlayerA.total_sprint_bursts === 4 &&
  freePlayerA.player_heatmap === 'https://padelizeresources.s3.amazonaws.com/a.jpg';

const proHasFields = 
  'total_sprint_bursts' in proPlayerA &&
  'player_heatmap' in proPlayerA &&
  proPlayerA.total_sprint_bursts === 4 &&
  proPlayerA.player_heatmap === 'https://padelizeresources.s3.amazonaws.com/a.jpg';

if (freeHasFields && proHasFields) {
  console.log('✅ SUCCESS: Fields preserved for both Free and Pro users!');
} else {
  console.log('❌ FAILURE: Fields missing after filtering');
  console.log('  Free user has fields:', freeHasFields);
  console.log('  Pro user has fields:', proHasFields);
  process.exit(1);
}
