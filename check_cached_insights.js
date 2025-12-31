import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CoachingInsight from './src/models/CoachingInsight.js';
import Analysis from './src/models/Analysis.js';

dotenv.config();

async function checkCachedInsights() {
  try {
    const DB = process.env.DATABASE.replace('<password>', process.env.DATABASE_PASSWORD);
    await mongoose.connect(DB);
    console.log('✅ Connected\n');

    // Find all cached insights
    const insights = await CoachingInsight.find().lean();
    console.log(`📊 Total cached insights: ${insights.length}\n`);

    for (const insight of insights) {
      console.log('='.repeat(60));
      console.log(`Analysis ID: ${insight.analysis}`);
      console.log(`Player ID: ${insight.player_id}`);
      console.log(`Created: ${insight.createdAt}`);
      console.log('\nMETRICS STORED IN CACHE:');
      console.log(JSON.stringify(insight.metrics, null, 2));
      
      // Fetch actual analysis to compare
      const analysis = await Analysis.findById(insight.analysis).lean();
      if (analysis && analysis.player_analytics) {
        const player = analysis.player_analytics.players.find(p => p.player_id === insight.player_id);
        if (player) {
          console.log('\nACTUAL METRICS FROM ANALYSIS:');
          console.log(JSON.stringify({
            net_dominance_percentage: player.net_dominance_percentage,
            baseline_play_percentage: player.baseline_play_percentage,
            dead_zone_presence_percentage: player.dead_zone_presence_percentage,
            total_sprint_bursts: player.total_sprint_bursts,
          }, null, 2));
          
          // Check for mismatches
          const mismatch = 
            Math.abs((insight.metrics.net_percentage || 0) - (player.net_dominance_percentage || 0)) > 0.1 ||
            Math.abs((insight.metrics.baseline_percentage || 0) - (player.baseline_play_percentage || 0)) > 0.1 ||
            Math.abs((insight.metrics.deadzone_percentage || 0) - (player.dead_zone_presence_percentage || 0)) > 0.1;
          
          if (mismatch) {
            console.log('\n⚠️  MISMATCH DETECTED! Cached metrics don\'t match analysis!');
          }
        }
      }
      console.log('\n');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCachedInsights();
