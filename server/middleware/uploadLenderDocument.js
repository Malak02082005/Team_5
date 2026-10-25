import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


export const UPLOAD_DIR = fileURLToPath(new URL('../uploads/lender-documents', import.meta.url));

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png']
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// CLOUDINARY: switch to the line below and delete the disk storage (and UPLOAD_DIR / fs.mkdirSync).
// const storage = multer.memoryStorage();


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const randomPart = crypto.randomBytes(8).toString('hex');
        cb(null, `${Date.now()}-${randomPart}${extension}`);
    }
});


const fileFilter = (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ALLOWED_TYPES[file.mimetype];

    if (!allowedExtensions || !allowedExtensions.includes(extension)) {
        const error = new Error('Only PDF, JPEG, JPG and PNG files are allowed');
        error.status = 400;
        return cb(error);
    }
    cb(null, true);
};


export const uploadLenderDocument = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 }
}).single('file');

export const handleUploadErrors = (err, req, res, next) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File is too large (max 5 MB)' });
    }
    if (err instanceof multer.MulterError || err.status === 400) {
        return res.status(400).json({ message: err.message });
    }
    next(err);
};

