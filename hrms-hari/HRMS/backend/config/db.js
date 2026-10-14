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

  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production' && (!process.env.DB_NAME || process.env.DB_NAME === 'hrms_db')) {
    console.warn('Local runs must use DB_NAME=hrms_dev.');
    throw new Error('Local runs must use DB_NAME=hrms_dev.');
  }

  try {
    const options = {
      dbName: process.env.DB_NAME || 'hrms_db',
      serverSelectionTimeoutMS: 5000, // Fail fast on Vercel serverless (10s limit)
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 2000,
    };

    if (process.env.DNS_SERVERS && !process.env.VERCEL) {
        require('dns').setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()));
    }

    console.log(`Connecting to MongoDB Atlas (${options.dbName})...`);
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
