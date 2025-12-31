import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CoachingInsight from './src/models/CoachingInsight.js';

dotenv.config();

async function clearCache() {
  try {
    const DB = process.env.DATABASE.replace('<password>', process.env.DATABASE_PASSWORD);
    await mongoose.connect(DB);
    console.log('✅ Connected to database\n');

    const result = await CoachingInsight.deleteMany({});
    console.log(`🗑️  Deleted ${result.deletedCount} cached coaching insights`);
    console.log('✅ Cache cleared! All coaching insights will be regenerated fresh.\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

clearCache();
