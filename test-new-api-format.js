import { transformNewAnalysisResults } from './src/utils/analysisFormatter.js';

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

console.log('=== Testing New API Format Transformation ===\n');
console.log('Input (new API format):');
console.log(JSON.stringify(newApiResponse, null, 2));
console.log('\n' + '='.repeat(50) + '\n');

try {
  const transformed = transformNewAnalysisResults(newApiResponse);
  
  console.log('Output (transformed to internal format):');
  console.log(JSON.stringify(transformed, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Transformation successful!\n');
  
  // Verify key fields
  console.log('Verification:');
  console.log(`- Job ID: ${transformed.job_id}`);
  console.log(`- Status: ${transformed.analysis_status}`);
  console.log(`- Number of players: ${transformed.player_analytics.players.length}`);
  
  transformed.player_analytics.players.forEach((player, idx) => {
    console.log(`\nPlayer ${player.player_id}:`);
    console.log(`  - Distance: ${player.total_distance_km.toFixed(3)} km`);
    console.log(`  - Avg Speed: ${player.average_speed_kmh.toFixed(2)} km/h`);
    console.log(`  - Peak Speed: ${player.peak_speed_kmh.toFixed(2)} km/h`);
    console.log(`  - Net Dominance: ${player.net_dominance_percentage}%`);
    console.log(`  - Dead Zone: ${player.dead_zone_presence_percentage}%`);
    console.log(`  - Baseline Play: ${player.baseline_play_percentage}%`);
    console.log(`  - Sprint Bursts: ${player.total_sprint_bursts}`);
    console.log(`  - Heatmap: ${player.player_heatmap}`);
  });
  
} catch (error) {
  console.error('❌ Transformation failed:', error);
  process.exit(1);
}
