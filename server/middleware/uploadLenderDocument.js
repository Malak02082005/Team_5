import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UPLOAD_DIR = fileURLToPath(new URL('../uploads/lender-documents', import.meta.url));
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png']
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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
        return cb(new Error('Only PDF, JPEG, JPG and PNG files are allowed'));
    }
    cb(null, true);
};

export const uploadLenderDocument = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 }
}).single('file');
