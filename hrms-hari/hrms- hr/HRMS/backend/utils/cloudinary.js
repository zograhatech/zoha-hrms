const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer to Cloudinary using streams
 * @param {Buffer} buffer - File buffer from Multer
 * @param {String} folder - Cloudinary folder name
 * @param {String} resourceType - 'image', 'video', or 'auto' (for documents/raw)
 * @returns {Promise} - Cloudinary upload response
 */
const uploadFromBuffer = (buffer, folder = 'chat_attachments', resourceType = 'auto', originalName = '') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        public_id: originalName ? `${originalName.split('.')[0].replace(/\s+/g, '_')}_${Date.now()}` : undefined,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

module.exports = {
  cloudinary,
  uploadFromBuffer,
};
