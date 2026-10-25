/*
CLOUDINARY: not active yet. When the team sets up Cloudinary:
1. npm install cloudinary   (inside server)
2. Add to .env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
3. Validate them in config/env.js like BACKEND_PORT and uncomment the code below.
4. Follow the "CLOUDINARY:" notes in middleware/uploadLenderDocument.js and controllers/lenderRequestController.js. and adminLenderRequestController.js

Lender documents are ID cards and proof of address, so they are uploaded as "authenticated" (private):
they can only be opened through a signed link created by the server, never by a public URL.
In the Cloudinary dashboard, "Allow delivery of PDF and ZIP files" must be enabled for PDFs to open.
*/

// import { v2 as cloudinary } from 'cloudinary';
// import { env } from './env.js';
//
// cloudinary.config({
//     cloud_name: env.cloudinaryCloudName,
//     api_key: env.cloudinaryApiKey,
//     api_secret: env.cloudinaryApiSecret
// });
//
// const DOCUMENT_OPTIONS = { folder: 'lender-documents', type: 'authenticated', resource_type: 'image' };
//
// // Uploads a file kept in memory by multer (req.file.buffer). Resolves with Cloudinary's result (result.public_id is the id we store).
// export function uploadToCloudinary(buffer) {
//     return new Promise((resolve, reject) => {
//         const stream = cloudinary.uploader.upload_stream(DOCUMENT_OPTIONS, (error, result) => {
//             if (error) return reject(error);
//             resolve(result);
//         });
//         stream.end(buffer);
//     });
// }
//
// export function deleteFromCloudinary(publicId) {
//     return cloudinary.uploader.destroy(publicId, { type: 'authenticated', resource_type: 'image' });
// }
//
// // A signed link the admin can open (S8). Only the server can create it, because it needs the API secret.
// export function getSignedDocumentUrl(publicId, format) {
//     return cloudinary.url(publicId, { type: 'authenticated', resource_type: 'image', sign_url: true, secure: true, format });
// }
