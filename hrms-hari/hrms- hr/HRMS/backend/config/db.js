const mongoose = require('mongoose');

// Verbose logging for connection states (without logging credentials)
mongoose.connection.on('connecting', () => console.log('... Mongoose is connecting to MongoDB Atlas'));
mongoose.connection.on('connected', () => console.log('✅ Mongoose connected to MongoDB Atlas (hrms_db)'));
mongoose.connection.on('open', () => console.log('🚀 Mongoose connection is open and ready'));
mongoose.connection.on('error', (err) => console.error('❌ Mongoose connection error event:', err.message));
mongoose.connection.on('disconnected', () => console.warn('⚠️ Mongoose disconnected from MongoDB Atlas'));

let cachedConnectionPromise = null;

const connectDB = async () => {
  // If already connected, reuse existing connection
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If currently connecting and promise exists, reuse the in-flight connection promise
  if (cachedConnectionPromise && mongoose.connection.readyState === 2) {
    return cachedConnectionPromise;
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error('Database configuration error: Neither MONGODB_URI nor MONGO_URI is defined in environment variables.');
  }

  try {
    const options = {
      dbName: 'hrms_db',
      serverSelectionTimeoutMS: 5000, // Fail fast on Vercel serverless (10s limit)
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 2000,
    };

    console.log('Connecting to MongoDB Atlas (hrms_db)...');
    cachedConnectionPromise = mongoose.connect(uri, options);
    await cachedConnectionPromise;

    return mongoose.connection;
  } catch (err) {
    cachedConnectionPromise = null; // Reset to allow retry on next request
    console.error('❌ MongoDB connectDB failed:', err.message);
    throw err;
  }
};

module.exports = connectDB;
