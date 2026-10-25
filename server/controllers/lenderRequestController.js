import fs from 'node:fs/promises';
import path from 'node:path';
import { LenderRequest } from '../models/LenderRequest.js';
import { UPLOAD_DIR } from '../middleware/uploadLenderDocument.js';

const SLOTS = ['idDocument', 'proofOfAddress'];

// GET /api/lender-requests
export async function getMyRequest(req, res, next) {
    try {
        const request = await LenderRequest.findOne({ member: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json(request);
    } catch (error) {
        next(error);
    }
}

// POST /api/lender-requests/documents/:slot
export async function uploadDocument(req, res, next) {
    try {
        if (!req.file) return res.status(400).json({ message: "Please choose a file to upload" });
        if (!SLOTS.includes(req.params.slot)) {
            await deleteStoredFile(req.file.filename);
            return res.status(400).json({ message: "Invalid document slot" });
        }

        const request = await findOpenRequest(req.user.id) || new LenderRequest({ member: req.user.id });
        if (request.status !== 'draft') {
            await deleteStoredFile(req.file.filename);
            return res.status(409).json({ message: "Your request was already submitted and can no longer be changed" });
        }

        const oldFile = request[req.params.slot];
        request[req.params.slot] = {
            originalName: req.file.originalname,
            storedName: req.file.filename,
            docType: req.file.mimetype,
            size: req.file.size
        };
        await request.save();
        if (oldFile) await deleteStoredFile(oldFile.storedName);

        res.status(200).json(request);
    } catch (error) {
        if (req.file) await deleteStoredFile(req.file.filename);
        next(error);
    }
}

// DELETE /api/lender-requests/documents/:slot
export async function removeDocument(req, res, next) {
    try {
        if (!SLOTS.includes(req.params.slot)) return res.status(400).json({ message: "Invalid document slot" });

        const request = await findOpenRequest(req.user.id);
        if (!request || !request[req.params.slot]) return res.status(404).json({ message: "No document uploaded in this slot" });
        if (request.status !== 'draft') return res.status(409).json({ message: "Your request was already submitted and can no longer be changed" });

        const { storedName } = request[req.params.slot];
        request[req.params.slot] = undefined;
        await request.save();
        await deleteStoredFile(storedName);

        res.status(200).json(request);
    } catch (error) {
        next(error);
    }
}
// POST /api/lender-requests/submit
export async function submitRequest(req, res, next) {
    try {
        const request = await findOpenRequest(req.user.id);
        if (!request) return res.status(404).json({ message: "You have no request to submit" });
        if (request.status !== 'draft') return res.status(409).json({ message: "Your request was already submitted" });
        if (!request.idDocument && !request.proofOfAddress) return res.status(400).json({ message: "Please upload your ID document and proof of address" });
        if (!request.idDocument) return res.status(400).json({ message: "Please upload your ID document" });
        if (!request.proofOfAddress) return res.status(400).json({ message: "Please upload your proof of address" });


        request.status = 'pending';
        await request.save();

        res.status(200).json(request);
    } catch (error) {
        next(error);
    }
}

function findOpenRequest(memberId) {
    return LenderRequest.findOne({ member: memberId, status: { $in: ['draft', 'pending'] } });
}

async function deleteStoredFile(storedName) {
    try {
        await fs.unlink(path.join(UPLOAD_DIR, storedName));
    } catch (error) {
        if (error.code !== 'ENOENT') console.error("Could not delete file:", error.message);
    }
}
