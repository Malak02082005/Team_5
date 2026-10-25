import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import app from "../app.js";
import { LenderRequest } from "../models/LenderRequest.js";
import { UPLOAD_DIR } from "../middleware/uploadLenderDocument.js";

// Mock the LenderRequest model. 
vi.mock('../models/LenderRequest.js', () => ({
    LenderRequest: Object.assign(vi.fn(), { findOne: vi.fn() })
}));

const MEMBER_ID = '64b000000000000000000001';
const BASE_URL = '/api/lender-requests/me';

// Before each test, this stores the list of files already in the uploads folder. Later, tells me which files the test created.
let filesBefore = [];

// Builds a fake request document the way Mongoose would return it.
function fakeRequest(fields = {}) {
    return { member: MEMBER_ID, status: 'draft', save: vi.fn().mockResolvedValue(), ...fields };
}

// Puts a real file in the upload folder, so we can check that the controller deletes it.
function createStoredFile(storedName) {
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), 'old file');
    return { originalName: 'old.pdf', storedName, docType: 'application/pdf', size: 8 };
}

function uploadedFiles() {
    return fs.readdirSync(UPLOAD_DIR).filter((name) => !filesBefore.includes(name));
}

beforeEach(() => {
    vi.resetAllMocks();
    filesBefore = fs.readdirSync(UPLOAD_DIR);

    LenderRequest.findOne.mockResolvedValue(null);
    LenderRequest.mockImplementation(function (data) {
        return fakeRequest(data);
    });
});

afterEach(() => {
    for (const name of uploadedFiles()) {
        fs.rmSync(path.join(UPLOAD_DIR, name), { force: true });
    }
});

describe('GET /api/lender-requests/me', () => {
    it('returns 401 when not logged in', async () => {
        const response = await request(app).get(BASE_URL);

        expect(response.status).toBe(401);
        expect(LenderRequest.findOne).not.toHaveBeenCalled();
    });

    it('returns 200 with the newest request of the member', async () => {
        const sort = vi.fn().mockResolvedValue({ member: MEMBER_ID, status: 'draft' });
        LenderRequest.findOne.mockReturnValue({ sort });

        const response = await request(app)
            .get(BASE_URL)
            .set('x-member-id', MEMBER_ID);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('draft');
        expect(LenderRequest.findOne).toHaveBeenCalledWith({ member: MEMBER_ID });
        expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('returns 200 with null when the member has no request', async () => {
        LenderRequest.findOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });

        const response = await request(app)
            .get(BASE_URL)
            .set('x-member-id', MEMBER_ID);

        expect(response.status).toBe(200);
        expect(response.body).toBeNull();
    });

    it('returns 500 when the lookup fails', async () => {
        LenderRequest.findOne.mockReturnValue({ sort: vi.fn().mockRejectedValue(new Error('Database unavailable')) });

        const response = await request(app)
            .get(BASE_URL)
            .set('x-member-id', MEMBER_ID);

        expect(response.status).toBe(500);
    });
});

const invalidFiles = [
    { name: 'notes.docx', content: Buffer.from('word file'), message: 'Only PDF, JPEG, JPG and PNG files are allowed' },
    { name: 'virus.exe', content: Buffer.from('program'), message: 'Only PDF, JPEG, JPG and PNG files are allowed' },
    { name: 'huge.pdf', content: Buffer.alloc(6 * 1024 * 1024), message: 'File is too large (max 5 MB)' }
];

describe('POST /api/lender-requests/me/documents/:slot', () => {
    it.each(['idDocument', 'proofOfAddress'])(
        'returns 200 and creates a draft request when uploading %s for the first time',
        async (slot) => {
        const response = await request(app)
            .post(`${BASE_URL}/documents/${slot}`)
            .set('x-member-id', MEMBER_ID)
            .attach('file', Buffer.from('fake pdf'), 'passport.pdf');

        expect(response.status).toBe(200);
        expect(LenderRequest).toHaveBeenCalledWith({ member: MEMBER_ID });

        const savedRequest = LenderRequest.mock.results[0].value;
        expect(savedRequest.save).toHaveBeenCalledOnce();
        expect(savedRequest[slot].originalName).toBe('passport.pdf');
        expect(savedRequest[slot].docType).toBe('application/pdf');
        expect(uploadedFiles()).toContain(savedRequest[slot].storedName);
    });

    it('returns 200 and replaces the old file in an existing draft', async () => {
        const oldFile = createStoredFile('old-id.pdf');
        const existing = fakeRequest({ idDocument: oldFile });
        LenderRequest.findOne.mockResolvedValue(existing);

        const response = await request(app)
            .post(`${BASE_URL}/documents/idDocument`)
            .set('x-member-id', MEMBER_ID)
            .attach('file', Buffer.from('new image'), 'new-id.png');

        expect(response.status).toBe(200);
        expect(LenderRequest).not.toHaveBeenCalled();
        expect(existing.save).toHaveBeenCalledOnce();
        expect(existing.idDocument.originalName).toBe('new-id.png');
        expect(existing.idDocument.docType).toBe('image/png');
        expect(uploadedFiles()).not.toContain('old-id.pdf');
    });

    it('returns 401 when not logged in', async () => {
        const response = await request(app)
            .post(`${BASE_URL}/documents/idDocument`)
            .attach('file', Buffer.from('fake pdf'), 'passport.pdf');

        expect(response.status).toBe(401);
        expect(uploadedFiles()).toHaveLength(0);
    });

    it('returns 400 when no file is sent', async () => {
        const response = await request(app)
            .post(`${BASE_URL}/documents/idDocument`)
            .set('x-member-id', MEMBER_ID);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Please choose a file to upload');
        expect(LenderRequest.findOne).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid slot and does not keep the file', async () => {
        const response = await request(app)
            .post(`${BASE_URL}/documents/banana`)
            .set('x-member-id', MEMBER_ID)
            .attach('file', Buffer.from('fake pdf'), 'passport.pdf');

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Invalid document slot');
        expect(LenderRequest.findOne).not.toHaveBeenCalled();
        expect(uploadedFiles()).toHaveLength(0);
    });

    it.each(invalidFiles)(
        'returns 400 for an invalid file ($name)',
        async (file) => {
        const response = await request(app)
            .post(`${BASE_URL}/documents/idDocument`)
            .set('x-member-id', MEMBER_ID)
            .attach('file', file.content, file.name);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(file.message);
        expect(LenderRequest.findOne).not.toHaveBeenCalled();
        expect(uploadedFiles()).toHaveLength(0);
    });

    it('returns 409 when the request was already submitted', async () => {
        const submitted = fakeRequest({ status: 'pending' });
        LenderRequest.findOne.mockResolvedValue(submitted);

        const response = await request(app)
            .post(`${BASE_URL}/documents/idDocument`)
            .set('x-member-id', MEMBER_ID)
            .attach('file', Buffer.from('fake pdf'), 'passport.pdf');

        expect(response.status).toBe(409);
        expect(submitted.save).not.toHaveBeenCalled();
        expect(uploadedFiles()).toHaveLength(0);
    });

    it('returns 500 when saving fails and removes the new file', async () => {
        const existing = fakeRequest();
        existing.save.mockRejectedValue(new Error('Database unavailable'));
        LenderRequest.findOne.mockResolvedValue(existing);

        const response = await request(app)
            .post(`${BASE_URL}/documents/idDocument`)
            .set('x-member-id', MEMBER_ID)
            .attach('file', Buffer.from('fake pdf'), 'passport.pdf');

        expect(response.status).toBe(500);
        expect(uploadedFiles()).toHaveLength(0);
    });
});

describe('DELETE /api/lender-requests/me/documents/:slot', () => {
    it('returns 200, empties the slot and deletes the file', async () => {
        const existing = fakeRequest({ proofOfAddress: createStoredFile('old-bill.pdf') });
        LenderRequest.findOne.mockResolvedValue(existing);

        const response = await request(app)
            .delete(`${BASE_URL}/documents/proofOfAddress`)
            .set('x-member-id', MEMBER_ID);

        expect(response.status).toBe(200);
        expect(existing.proofOfAddress).toBeUndefined();
        expect(existing.save).toHaveBeenCalledOnce();
        expect(uploadedFiles()).not.toContain('old-bill.pdf');
    });

    it('returns 401 when not logged in', async () => {
        const response = await request(app).delete(`${BASE_URL}/documents/idDocument`);

        expect(response.status).toBe(401);
    });

    it('returns 400 for an invalid slot', async () => {
        const response = await request(app)
            .delete(`${BASE_URL}/documents/banana`)
            .set('x-member-id', MEMBER_ID);

        expect(response.status).toBe(400);
        expect(LenderRequest.findOne).not.toHaveBeenCalled();
    });

    it.each([null, fakeRequest()])(
        'returns 404 when there is no document to remove %#',
        async (existing) => {
        LenderRequest.findOne.mockResolvedValue(existing);

        const response = await request(app)
            .delete(`${BASE_URL}/documents/idDocument`)
            .set('x-member-id', MEMBER_ID);

        expect(response.status).toBe(404);
    });

    it('returns 409 when the request was already submitted', async () => {
        const submitted = fakeRequest({ status: 'pending', idDocument: createStoredFile('locked-id.pdf') });
        LenderRequest.findOne.mockResolvedValue(submitted);

        const response = await request(app)
            .delete(`${BASE_URL}/documents/idDocument`)
            .set('x-member-id', MEMBER_ID);

        expect(response.status).toBe(409);
        expect(submitted.save).not.toHaveBeenCalled();
        expect(uploadedFiles()).toContain('locked-id.pdf');
    });

    it('returns 500 when the lookup fails', async () => {
        LenderRequest.findOne.mockRejectedValue(new Error('Database unavailable'));

        const response = await request(app)
            .delete(`${BASE_URL}/documents/idDocument`)
            .set('x-member-id', MEMBER_ID);

        expect(response.status).toBe(500);
    });
});
