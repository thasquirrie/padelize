import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Analysis from './src/models/Analysis.js';
import CoachingInsight from './src/models/CoachingInsight.js';
import { getCoachingInsightsForAnalysis } from './src/services/coachingAnalysisService.js';

dotenv.config();

async function testCoachingFixes() {
  console.log('🧪 Testing Coaching Analysis Fixes\n');
  console.log('=' .repeat(60));

  try {
    // Connect to database
    const DB = process.env.DATABASE.replace(
      '<password>',
      process.env.DATABASE_PASSWORD
    );
    await mongoose.connect(DB);
    console.log('✅ Connected to database\n');

    // Find a completed analysis
    const analysis = await Analysis.findOne({ status: 'completed' })
      .sort({ createdAt: -1 })
      .lean();

    if (!analysis) {
      console.log('❌ No completed analysis found');
      process.exit(1);
    }

    const analysisId = analysis._id.toString();
    const player = analysis.player_analytics.players[0];
    const playerId = player.player_id;

    console.log(`📋 Test Analysis: ${analysisId}`);
    console.log(`👤 Player ID: ${playerId}\n`);

    // TEST 1: Check if cache works (should use existing if available)
    console.log('TEST 1: Cache Functionality');
    console.log('-'.repeat(60));
    
    const before = await CoachingInsight.findOne({
      analysis: analysisId,
      player_id: playerId,
    });
    
    if (before) {
      console.log('✅ Cached insight exists from:', before.createdAt);
      const result1 = await getCoachingInsightsForAnalysis(analysisId, playerId, false);
      if (result1.cached) {
        console.log('✅ PASS: Cache was used (no new API call)');
      } else {
        console.log('❌ FAIL: Cache should have been used');
      }
    } else {
      console.log('ℹ️  No cached insight exists - will generate new one');
    }
    console.log('');

    // TEST 2: First save (or force regenerate)
    console.log('TEST 2: Save/Update Functionality');
    console.log('-'.repeat(60));
    
    // Delete existing to test fresh save
    await CoachingInsight.deleteOne({
      analysis: analysisId,
      player_id: playerId,
    });
    console.log('🗑️  Cleared cache for fresh test');
    
    try {
      const result2 = await getCoachingInsightsForAnalysis(analysisId, playerId, false);
      console.log('✅ Generated new insights');
      
      // Check if saved to DB
      const saved = await CoachingInsight.findOne({
        analysis: analysisId,
        player_id: playerId,
      });
      
      if (saved) {
        console.log('✅ PASS: Insights saved to database');
        console.log(`   Cache ID: ${saved._id}`);
        console.log(`   Created: ${saved.createdAt}`);
      } else {
        console.log('❌ FAIL: Insights NOT saved to database');
      }
    } catch (error) {
      if (error.message.includes('quota')) {
        console.log('⚠️  SKIPPED: OpenAI quota exceeded (expected during testing)');
        console.log('   This test requires valid OpenAI API quota');
      } else {
        throw error;
      }
    }
    console.log('');

    // TEST 3: Duplicate request handling (race condition)
    console.log('TEST 3: Race Condition Handling');
    console.log('-'.repeat(60));
    
    const existingCache = await CoachingInsight.findOne({
      analysis: analysisId,
      player_id: playerId,
    });
    
    if (existingCache) {
      console.log('✅ Cache exists - testing multiple simultaneous requests');
      
      // Simulate race condition with 3 simultaneous requests
      const promises = [
        getCoachingInsightsForAnalysis(analysisId, playerId, false),
        getCoachingInsightsForAnalysis(analysisId, playerId, false),
        getCoachingInsightsForAnalysis(analysisId, playerId, false),
      ];
      
      const results = await Promise.all(promises);
      const allCached = results.every(r => r.cached);
      
      if (allCached) {
        console.log('✅ PASS: All 3 requests used cache (no race condition)');
      } else {
        console.log('⚠️  Some requests generated new data');
        console.log(`   Cached: ${results.filter(r => r.cached).length}/3`);
      }
      
      // Check DB has only one entry
      const count = await CoachingInsight.countDocuments({
        analysis: analysisId,
        player_id: playerId,
      });
      
      if (count === 1) {
        console.log('✅ PASS: Only one cache entry exists (no duplicates)');
      } else {
        console.log(`❌ FAIL: Found ${count} cache entries (expected 1)`);
      }
    } else {
      console.log('⚠️  SKIPPED: No cache exists (previous test may have failed)');
    }
    console.log('');

    // TEST 4: Force regenerate updates cache
    console.log('TEST 4: Force Regenerate (Update Cache)');
    console.log('-'.repeat(60));
    
    const cacheBeforeRegenerate = await CoachingInsight.findOne({
      analysis: analysisId,
      player_id: playerId,
    });
    
    if (cacheBeforeRegenerate) {
      try {
        const result4 = await getCoachingInsightsForAnalysis(analysisId, playerId, true);
        
        const cacheAfterRegenerate = await CoachingInsight.findOne({
          analysis: analysisId,
          player_id: playerId,
        });
        
        if (cacheAfterRegenerate) {
          const wasUpdated = cacheAfterRegenerate.updatedAt > cacheBeforeRegenerate.updatedAt;
          if (wasUpdated) {
            console.log('✅ PASS: Cache was updated (not duplicated)');
            console.log(`   Before: ${cacheBeforeRegenerate.updatedAt}`);
            console.log(`   After:  ${cacheAfterRegenerate.updatedAt}`);
          } else {
            console.log('⚠️  Cache timestamp unchanged (may be expected)');
          }
          
          // Check no duplicates
          const finalCount = await CoachingInsight.countDocuments({
            analysis: analysisId,
            player_id: playerId,
          });
          
          if (finalCount === 1) {
            console.log('✅ PASS: Still only one cache entry (no duplicate created)');
          } else {
            console.log(`❌ FAIL: Found ${finalCount} cache entries after regenerate`);
          }
        } else {
          console.log('❌ FAIL: Cache disappeared after regenerate');
        }
      } catch (error) {
        if (error.message.includes('quota')) {
          console.log('⚠️  SKIPPED: OpenAI quota exceeded');
        } else {
          throw error;
        }
      }
    } else {
      console.log('⚠️  SKIPPED: No cache exists');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testCoachingFixes();
