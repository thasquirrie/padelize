import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Notification from './src/models/Notification.js';

dotenv.config();

const testNotifications = async () => {
  try {
    const DB = process.env.DATABASE.replace('<password>', process.env.DATABASE_PASSWORD);
    await mongoose.connect(DB);
    console.log('✅ Database connected\n');

    const testUserId = new mongoose.Types.ObjectId('6970e4eb63c8829acca99216');
    
    console.log('🧪 Testing Notification Enum Values...\n');
    console.log('================================================\n');

    const tests = [
      {
        name: 'video_download_started',
        data: {
          recipient: testUserId,
          sender: testUserId,
          type: 'video_download_started',
          title: 'Video Download Started',
          message: 'Your video is being downloaded',
          priority: 'medium',
        }
      },
      {
        name: 'player_detection_complete',
        data: {
          recipient: testUserId,
          sender: testUserId,
          type: 'player_detection_complete',
          title: 'Player Detection Complete',
          message: 'Players detected successfully',
          priority: 'high',
        }
      },
      {
        name: 'analysisStarted',
        data: {
          recipient: testUserId,
          sender: testUserId,
          type: 'analysisStarted',
          title: 'Analysis Started',
          message: 'Analysis has started',
          priority: 'medium',
        }
      },
      {
        name: 'analysisCompleted',
        data: {
          recipient: testUserId,
          sender: testUserId,
          type: 'analysisCompleted',
          title: 'Analysis Complete',
          message: 'Analysis completed successfully',
          priority: 'high',
        }
      },
    ];

    let successCount = 0;
    let failCount = 0;

    for (const test of tests) {
      try {
        const notification = await Notification.create(test.data);
        console.log(`✅ ${test.name}: SUCCESS (ID: ${notification._id})`);
        successCount++;
        
        // Clean up
        await Notification.deleteOne({ _id: notification._id });
      } catch (error) {
        console.log(`❌ ${test.name}: FAILED - ${error.message}`);
        failCount++;
      }
    }

    console.log('\n================================================');
    console.log(`✅ Passed: ${successCount}/${tests.length}`);
    console.log(`❌ Failed: ${failCount}/${tests.length}`);
    
    if (successCount === tests.length) {
      console.log('\n🎉 ALL TESTS PASSED!');
      console.log('✅ All notification types are now valid enum values');
      console.log('✅ Video link upload notifications will work');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  }
};

testNotifications();
