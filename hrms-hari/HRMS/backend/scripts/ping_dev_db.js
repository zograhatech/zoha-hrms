const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });
if (!process.env.VERCEL) {
  dotenv.config({ path: path.join(__dirname, '../.env.local-dns') });
}

const mongoose = require('mongoose');

async function ping() {
  const dbName = process.env.DB_NAME;
  if (dbName !== 'hrms_dev') {
    console.error(`Refusing to run: DB_NAME must be exactly "hrms_dev" (got: ${dbName})`);
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('Neither MONGODB_URI nor MONGO_URI is set.');
    process.exit(1);
  }

  if (process.env.DNS_SERVERS && !process.env.VERCEL) {
    require('dns').setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()));
  }

  const options = {
    dbName: 'hrms_dev',
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    heartbeatFrequencyMS: 2000,
  };

  try {
    const conn = await mongoose.connect(uri, options);
    await conn.connection.db.admin().ping();
    console.log('connected');
  } catch (err) {
    const firstLine = (err.message || '').split('\n')[0];
    console.error(`${err.name}: ${firstLine}`);
  } finally {
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(0);
  }
}

ping();

