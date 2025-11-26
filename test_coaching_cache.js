import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CoachingInsight from './src/models/CoachingInsight.js';
import { getCoachingInsightsForAnalysis } from './src/services/coachingAnalysisService.js';

dotenv.config();

const testCoachingCache = async () => {
  try {
    // Connect to database
    const DB = process.env.DATABASE.replace(
      '<password>',
      process.env.DATABASE_PASSWORD
    );
    await mongoose.connect(DB);
    console.log('✅ Connected to database\n');

    const analysisId = '6925b0c07b810ef550fb2af7'; // Your test analysis

    console.log('=== Test 1: First Request (Should Generate New) ===');
    const result1 = await getCoachingInsightsForAnalysis(analysisId);
    console.log('Result 1:');
    console.log('- Cached:', result1.cached);
    console.log('- Tokens Used:', result1.tokens_used);
    console.log('- Cost (USD):', result1.cost_usd);
    console.log('- Generated At:', result1.generated_at);
    console.log(
      '- Player Profile:',
      result1.insights.player_profile.playing_style
    );
    console.log('- Strengths:', result1.insights.strengths.length);
    console.log('- Weaknesses:', result1.insights.weaknesses.length);
    console.log('- Tips:', result1.insights.actionable_tips.length);
    console.log();

    console.log('=== Test 2: Second Request (Should Use Cache) ===');
    const result2 = await getCoachingInsightsForAnalysis(analysisId);
    console.log('Result 2:');
    console.log('- Cached:', result2.cached);
    console.log('- Tokens Used:', result2.tokens_used);
    console.log('- Cost (USD):', result2.cost_usd);
    console.log('- Generated At:', result2.generated_at);
    console.log(
      '- Player Profile:',
      result2.insights.player_profile.playing_style
    );
    console.log();

    console.log('=== Test 3: Force Regenerate ===');
    const result3 = await getCoachingInsightsForAnalysis(
      analysisId,
      null,
      true
    );
    console.log('Result 3:');
    console.log('- Cached:', result3.cached);
    console.log('- Tokens Used:', result3.tokens_used);
    console.log('- Cost (USD):', result3.cost_usd);
    console.log('- Generated At:', result3.generated_at);
    console.log();

    console.log('=== Check Database ===');
    const cachedInsights = await CoachingInsight.find({ analysis: analysisId });
    console.log(
      `Found ${cachedInsights.length} cached insight(s) for this analysis`
    );

    if (cachedInsights.length > 0) {
      console.log('\nCached Insight Details:');
      console.log('- ID:', cachedInsights[0]._id);
      console.log('- Player ID:', cachedInsights[0].player_id);
      console.log('- Model Used:', cachedInsights[0].model_used);
      console.log('- Created At:', cachedInsights[0].createdAt);
      console.log('- Updated At:', cachedInsights[0].updatedAt);
      console.log('- Total Tokens:', cachedInsights[0].tokens_used?.total);
      console.log('- Cost (USD):', cachedInsights[0].cost_usd);
    }

    console.log('\n✅ All tests completed!');
    console.log('\n💰 Cost Savings Summary:');
    console.log(
      `- Request 1: $${result1.cost_usd?.toFixed(6) || '0.000000'} (generated)`
    );
    console.log(
      `- Request 2: $0.000000 (cached - saved $${
        result1.cost_usd?.toFixed(6) || '0.000000'
      })`
    );
    console.log(
      `- Request 3: $${
        result3.cost_usd?.toFixed(6) || '0.000000'
      } (forced regenerate)`
    );
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from database');
  }
};

testCoachingCache();
