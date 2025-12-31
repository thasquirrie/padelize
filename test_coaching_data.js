import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Analysis from './src/models/Analysis.js';
import CoachingInsight from './src/models/CoachingInsight.js';
import { getCoachingInsightsForAnalysis } from './src/services/coachingAnalysisService.js';

dotenv.config();

async function testCoachingData() {
  console.log('🔍 Testing Coaching Data Integrity...\n');

  try {
    // Connect to database
    const DB = process.env.DATABASE.replace(
      '<password>',
      process.env.DATABASE_PASSWORD
    );
    await mongoose.connect(DB);
    console.log('✅ Connected to database\n');

    // Find most recent completed analysis
    const analysis = await Analysis.findOne({ status: 'completed' })
      .sort({ createdAt: -1 })
      .lean();

    if (!analysis) {
      console.log('❌ No completed analysis found');
      process.exit(1);
    }

    console.log(`📋 Analysis ID: ${analysis._id}`);
    console.log(`📅 Created: ${analysis.createdAt}\n`);

    // Show player data structure
    if (analysis.player_analytics && analysis.player_analytics.players) {
      const player = analysis.player_analytics.players[0];
      console.log('=== ACTUAL DATABASE PLAYER DATA ===');
      console.log(JSON.stringify({
        player_id: player.player_id,
        total_distance_km: player.total_distance_km,
        average_speed_kmh: player.average_speed_kmh,
        peak_speed_kmh: player.peak_speed_kmh,
        net_dominance_percentage: player.net_dominance_percentage,
        baseline_play_percentage: player.baseline_play_percentage,
        dead_zone_presence_percentage: player.dead_zone_presence_percentage,
        total_sprint_bursts: player.total_sprint_bursts,
      }, null, 2));
      console.log('\n');

      // Clear any cached insights for this test
      await CoachingInsight.deleteMany({ analysis: analysis._id });
      console.log('🗑️  Cleared cached insights for fresh test\n');

      // Generate fresh insights
      console.log('🤖 Generating AI Coaching Insights...\n');
      const result = await getCoachingInsightsForAnalysis(
        analysis._id.toString(),
        player.player_id,
        true // force regenerate
      );

      console.log('\n=== AI RESPONSE ===');
      console.log(JSON.stringify(result.insights, null, 2));

      console.log('\n=== VERIFICATION ===');
      const actualNet = player.net_dominance_percentage || 0;
      const actualBaseline = player.baseline_play_percentage || 0;
      const actualDeadZone = player.dead_zone_presence_percentage || 0;

      // Check if AI used wrong numbers
      const aiResponse = JSON.stringify(result.insights);
      let hasWrongNumbers = false;

      // Look for any percentage numbers in the AI response
      const percentageMatches = aiResponse.match(/\d+\.?\d*%/g);
      if (percentageMatches) {
        console.log('📊 Percentages found in AI response:');
        percentageMatches.forEach(match => {
          const value = parseFloat(match);
          console.log(`  - ${match}`);
          
          // Check if this matches any of our actual values (within 0.1% tolerance)
          const isNet = Math.abs(value - actualNet) < 0.1;
          const isBaseline = Math.abs(value - actualBaseline) < 0.1;
          const isDeadZone = Math.abs(value - actualDeadZone) < 0.1;
          
          if (!isNet && !isBaseline && !isDeadZone) {
            console.log(`    ⚠️  WARNING: ${match} doesn't match any actual metric!`);
            hasWrongNumbers = true;
          }
        });
      }

      if (hasWrongNumbers) {
        console.log('\n❌ AI IS HALLUCINATING NUMBERS!');
      } else {
        console.log('\n✅ All numbers match actual metrics');
      }

      console.log('\n💰 Cost:', `$${result.cost_usd.toFixed(6)}`);
      console.log('🎯 Tokens:', result.tokens_used.total);
    } else {
      console.log('❌ No player analytics found in analysis');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testCoachingData();
