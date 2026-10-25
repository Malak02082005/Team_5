import mongoose from 'mongoose';
import path from 'node:path';
import { LenderRequest } from '../models/LenderRequest.js';
import { UPLOAD_DIR } from '../middleware/uploadLenderDocument.js';

// CLOUDINARY: uncomment when Cloudinary is set up.
// import { getSignedDocumentUrl } from '../config/cloudinary.js';

const SLOTS = ['idDocument', 'proofOfAddress'];
const STATUS = ['pending', 'approved', 'rejected'];
const USER_FIELDS = 'username name email phoneNumber address';

// GET /api/admin/lender-requests
export async function listLenderRequests(req, res, next) {
    try {
        const status = req.query.status || 'pending';
        if (!STATUS.includes(status)) return res.status(400).json({ message: "Invalid status" });

        const requests = await LenderRequest.find({ status }).populate('user', USER_FIELDS).sort({ createdAt: -1 });
        res.status(200).json(requests);
    } catch (error) {
        next(error);
    }
}

// GET /api/admin/lender-requests/:id
export async function getLenderRequest(req, res, next) {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid request id" });

        const request = await LenderRequest.findById(req.params.id).populate('user', USER_FIELDS);
        if (!request) return res.status(404).json({ message: "Lender request not found" });

        res.status(200).json(request);
    } catch (error) {
        next(error);
    }
}

// GET /api/admin/lender-requests/:id/documents/:slot
export async function getLenderRequestDocument(req, res, next) {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid request id" });
        if (!SLOTS.includes(req.params.slot)) return res.status(400).json({ message: "Invalid document slot" });

        const request = await LenderRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ message: "Lender request not found" });

        const document = request[req.params.slot];
        if (!document) return res.status(404).json({ message: "Document not found" });

        sendDocument(req, res, next, document);
    } catch (error) {
        next(error);
    }
}

function sendDocument(req, res, next, document) {
    // CLOUDINARY: replace everything in this function with:
    // return res.redirect(getSignedDocumentUrl(document.storedName));
    const filePath = path.join(UPLOAD_DIR, document.storedName);
    const onError = (error) => {
        if (!error) return;
        if (error.code === 'ENOENT') return res.status(404).json({ message: "Document file is missing" });
        next(error);
    };

    if (req.query.download === 'true') return res.download(filePath, document.originalName, onError);
    res.sendFile(filePath, { headers: { 'Content-Type': document.docType } }, onError);
}
