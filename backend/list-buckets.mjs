import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

const storage = new Storage({
  projectId: serviceAccount.project_id,
  credentials: {
    client_email: serviceAccount.client_email,
    private_key: serviceAccount.private_key,
  },
});

async function listBuckets() {
  try {
    const [buckets] = await storage.getBuckets();
    console.log('🪣 Available buckets:', buckets.map(b => b.name).join(', '));
  } catch (err) {
    console.error('❌ Failed to list buckets:', err.message);
  }
}

listBuckets();
