import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Notification from './src/models/Notification.js';

dotenv.config();

const test = async () => {
  try {
    const DB = process.env.DATABASE.replace('<password>', process.env.DATABASE_PASSWORD);
    await mongoose.connect(DB);
    console.log('✅ Database connected\n');

    const testUserId = new mongoose.Types.ObjectId('6970e4eb63c8829acca99216');
    const testMatchId = new mongoose.Types.ObjectId('6970e4eb63c8829acca99999');
    
    console.log('🧪 Testing Match Notification with relatedMatch field...\n');

    const notification = await Notification.create({
      recipient: testUserId,
      sender: testUserId,
      type: 'video_download_started',
      title: 'Video Download Started',
      message: 'Your video is being downloaded',
      relatedMatch: testMatchId,
      priority: 'medium',
    });

    console.log('✅ Notification created successfully!');
    console.log('📋 Notification details:');
    console.log('   ID:', notification._id);
    console.log('   Type:', notification.type);
    console.log('   Related Match:', notification.relatedMatch);
    console.log('   Title:', notification.title);
    
    const retrieved = await Notification.findById(notification._id).lean();
    console.log('\n✅ Retrieved from DB:');
    console.log('   relatedMatch:', retrieved.relatedMatch);
    console.log('   relatedPost:', retrieved.relatedPost);
    console.log('   relatedReply:', retrieved.relatedReply);
    
    if (retrieved.relatedMatch?.toString() === testMatchId.toString()) {
      console.log('\n🎉 SUCCESS! Match is now linked to notification');
    } else {
      console.log('\n❌ FAILED: relatedMatch not saved properly');
    }

    await Notification.deleteOne({ _id: notification._id });
    console.log('\n🗑️  Test notification cleaned up');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  }
};

test();
