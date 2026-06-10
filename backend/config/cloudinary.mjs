/**
 * CLOUDINARY CONFIGURATION (v2.6.620 — Phase 2 Modularization)
 * Extracted from server.mjs
 */
import { v2 as cloudinary } from 'cloudinary';

export const initCloudinary = () => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('☁️ Cloudinary initialized');
};

export { cloudinary };
