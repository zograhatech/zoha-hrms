const mongoose = require('mongoose');

// Verbose logging for connection states
mongoose.connection.on('connecting', () => console.log('... Mongoose is connecting to MongoDB'));
mongoose.connection.on('connected', () => console.log('✅ Mongoose connected to MongoDB'));
mongoose.connection.on('open', () => console.log('🚀 Mongoose connection is open and ready'));
mongoose.connection.on('error', (err) => console.error('❌ Mongoose connection error event:', err));
mongoose.connection.on('disconnected', () => console.warn('⚠️ Mongoose disconnected'));

const connectDB = async () => {
  const defaultUri = 'mongodb://ravisachin797_db_user:4cSByKokFTWvYHpV@ac-jiwfilh-shard-00-00.7agpkl6.mongodb.net:27017/hrms_db?ssl=true&authSource=admin&retryWrites=true&w=majority';
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || defaultUri;

  if (!uri) {
    throw new Error('MONGO_URI is not defined in environment variables');
  }

  try {
    const options = {
      serverSelectionTimeoutMS: 5000, // Fail fast on Vercel (10s limit)
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 2000,
    };

    console.log('Using Connection Target:', uri.replace(/\/\/(.*):(.*)@/, '//****:****@'));
    await mongoose.connect(uri, options);

    // Soft check
    const state = mongoose.connection.readyState;
    console.log(`Connection State: ${state} (1=connected, 2=connecting)`);

  } catch (err) {
    console.error('❌ MongoDB connectDB failed:', err.message);
    throw err;
  }
};

module.exports = connectDB;
