import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function run() {
  try {
    const result = await cloudinary.search
      .expression('folder:acetrack/diagnostics/*')
      .sort_by('created_at', 'desc')
      .max_results(500)
      .execute();

    const userMap = {};
    for (const file of result.resources) {
      const fName = file.public_id.split('/').pop().toLowerCase();
      // Extract username (assuming format: username_... or admin_requested_username_...)
      let username = '';
      if (fName.startsWith('admin_requested_')) {
        username = fName.split('_')[2];
      } else {
        username = fName.split('_')[0];
      }
      if (!userMap[username]) userMap[username] = [];
      userMap[username].push(file);
    }

    for (const [username, files] of Object.entries(userMap)) {
      if (files.length > 3) {
        const filesToDelete = files.slice(3).map(f => f.public_id);
        console.log(`Deleting ${filesToDelete.length} files for user ${username}`);
        await cloudinary.api.delete_resources(filesToDelete, { resource_type: 'raw' });
      }
    }
    console.log("Cleanup complete!");
  } catch (e) {
    console.error(e);
  }
}

run();
