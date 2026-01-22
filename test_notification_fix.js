import notificationService from './src/services/notificationService.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Notification from './src/models/Notification.js';

dotenv.config();

// Connect to database
const connectDB = async () => {
  try {
    const DB = process.env.DATABASE.replace('<password>', process.env.DATABASE_PASSWORD);
    await mongoose.connect(DB);
    console.log('✅ Database connected\n');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

const testNotifications = async () => {
  try {
    await connectDB();

    // Use a test user ID (replace with actual user ID from your database)
    const testUserId = '6970e4eb63c8829acca99216'; // Replace with real user ID
    
    console.log('🧪 Testing Notification Fix...\n');
    console.log('================================================\n');

    // Get initial count
    const initialCount = await Notification.countDocuments({ recipient: testUserId });
    console.log(`📊 Initial notification count: ${initialCount}\n`);

    // Test 1: video_download_started (the one that was failing)
    console.log('Test 1: video_download_started notification');
    console.log('---------------------------------------------');
    try {
      const notification1 = await notificationService.createNotification({
        recipient: testUserId,
        sender: testUserId,
        type: 'video_download_started',
        customTitle: 'Video Download Started',
        customMessage: 'Your video is being downloaded from the shared link',
        priority: 'medium',
      });
      console.log('✅ SUCCESS - Notification created:', notification1?._id);
    } catch (error) {
      console.log('❌ FAILED:', error.message);
    }
    console.log('');

    // Test 2: player_detection_complete
    console.log('Test 2: player_detection_complete notification');
    console.log('---------------------------------------------');
    try {
      const notification2 = await notificationService.createNotification({
        recipient: testUserId,
        sender: testUserId,
        type: 'player_detection_complete',
        customTitle: 'Player Detection Complete',
        customMessage: 'Players have been detected in your video',
        priority: 'high',
      });
      console.log('✅ SUCCESS - Notification created:', notification2?._id);
    } catch (error) {
      console.log('❌ FAILED:', error.message);
    }
    console.log('');

    // Test 3: analysisStarted
    console.log('Test 3: analysisStarted notification');
    console.log('---------------------------------------------');
    try {
      const notification3 = await notificationService.createNotification({
        recipient: testUserId,
        sender: testUserId,
        type: 'analysisStarted',
        customTitle: 'Analysis Started',
        customMessage: 'Your video analysis has started',
        priority: 'medium',
      });
      console.log('✅ SUCCESS - Notification created:', notification3?._id);
    } catch (error) {
      console.log('❌ FAILED:', error.message);
    }
    console.log('');

    // Test 4: matchCreated (this one was already working)
    console.log('Test 4: matchCreated notification');
    console.log('---------------------------------------------');
    try {
      const notification4 = await notificationService.createNotification({
        recipient: testUserId,
        sender: testUserId,
        type: 'matchCreated',
        customTitle: 'Match Created',
        customMessage: 'Your match has been created successfully',
        priority: 'medium',
      });
      console.log('✅ SUCCESS - Notification created:', notification4?._id);
    } catch (error) {
      console.log('❌ FAILED:', error.message);
    }
    console.log('');

    // Get final count
    const finalCount = await Notification.countDocuments({ recipient: testUserId });
    const newNotifications = finalCount - initialCount;
    
    console.log('================================================');
    console.log(`📊 Final notification count: ${finalCount}`);
    console.log(`📈 New notifications created: ${newNotifications}`);
    console.log('');
    
    if (newNotifications >= 4) {
      console.log('🎉 ALL TESTS PASSED! All 4 notifications were saved.');
    } else if (newNotifications > 0) {
      console.log(`⚠️  PARTIAL SUCCESS: Only ${newNotifications} notifications saved.`);
    } else {
      console.log('❌ ALL TESTS FAILED: No notifications were saved.');
    }
    
    console.log('');
    console.log('💡 Check your notifications with:');
    console.log(`   GET /api/v1/notifications`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  }
};

testNotifications();
