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

const USER_ID = '64b000000000000000000001';
const BASE_URL = '/api/lender-requests';


// Before each test, this stores the list of files already in the uploads folder. Later, tells me which files the test created.
let filesBefore = [];

// Builds a fake request document the way Mongoose would return it.
function fakeRequest(fields = {}) {
    return { user: USER_ID, status: 'draft', save: vi.fn().mockResolvedValue(), ...fields };
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

describe('GET /api/lender-requests', () => {
    it('returns 401 when not logged in', async () => {
        const response = await request(app).get(BASE_URL);

        expect(response.status).toBe(401);
        expect(LenderRequest.findOne).not.toHaveBeenCalled();
    });

    it('returns 200 with the newest request of the user', async () => {
        const sort = vi.fn().mockResolvedValue({ user: USER_ID, status: 'draft' });
        LenderRequest.findOne.mockReturnValue({ sort });

        const response = await request(app)
            .get(BASE_URL)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('draft');
        expect(LenderRequest.findOne).toHaveBeenCalledWith({ user: USER_ID });
        expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('returns 200 with null when the user has no request', async () => {
        LenderRequest.findOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });

        const response = await request(app)
            .get(BASE_URL)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(200);
        expect(response.body).toBeNull();
    });

    it('returns 500 when the lookup fails', async () => {
        LenderRequest.findOne.mockReturnValue({ sort: vi.fn().mockRejectedValue(new Error('Database unavailable')) });

        const response = await request(app)
            .get(BASE_URL)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(500);
    });
});

const invalidFiles = [
    { name: 'notes.docx', content: Buffer.from('word file'), message: 'Only PDF, JPEG, JPG and PNG files are allowed' },
    { name: 'virus.exe', content: Buffer.from('program'), message: 'Only PDF, JPEG, JPG and PNG files are allowed' },
    { name: 'huge.pdf', content: Buffer.alloc(6 * 1024 * 1024), message: 'File is too large (max 5 MB)' }
];

describe('POST /api/lender-requests/documents/:slot', () => {
    it.each(['idDocument', 'proofOfAddress'])(
        'returns 200 and creates a draft request when uploading %s for the first time',
        async (slot) => {
        const response = await request(app)
            .post(`${BASE_URL}/documents/${slot}`)
            .set('x-user-id', USER_ID)
            .attach('file', Buffer.from('fake pdf'), 'passport.pdf');

        expect(response.status).toBe(200);
        expect(LenderRequest).toHaveBeenCalledWith({ user: USER_ID });

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
            .set('x-user-id', USER_ID)
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
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Please choose a file to upload');
        expect(LenderRequest.findOne).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid slot and does not keep the file', async () => {
        const response = await request(app)
            .post(`${BASE_URL}/documents/banana`)
            .set('x-user-id', USER_ID)
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
            .set('x-user-id', USER_ID)
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
            .set('x-user-id', USER_ID)
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
            .set('x-user-id', USER_ID)
            .attach('file', Buffer.from('fake pdf'), 'passport.pdf');

        expect(response.status).toBe(500);
        expect(uploadedFiles()).toHaveLength(0);
    });
});

describe('DELETE /api/lender-requests/documents/:slot', () => {
    it('returns 200, empties the slot and deletes the file', async () => {
        const existing = fakeRequest({ proofOfAddress: createStoredFile('old-addressproof.pdf') });
        LenderRequest.findOne.mockResolvedValue(existing);

        const response = await request(app)
            .delete(`${BASE_URL}/documents/proofOfAddress`)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(200);
        expect(existing.proofOfAddress).toBeUndefined();
        expect(existing.save).toHaveBeenCalledOnce();
        expect(uploadedFiles()).not.toContain('old-addressproof.pdf');
    });

    it('returns 401 when not logged in', async () => {
        const response = await request(app).delete(`${BASE_URL}/documents/idDocument`);

        expect(response.status).toBe(401);
    });

    it('returns 400 for an invalid slot', async () => {
        const response = await request(app)
            .delete(`${BASE_URL}/documents/banana`)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(400);
        expect(LenderRequest.findOne).not.toHaveBeenCalled();
    });

    it.each([null, fakeRequest()])(
        'returns 404 when there is no document to remove %#',
        async (existing) => {
        LenderRequest.findOne.mockResolvedValue(existing);

        const response = await request(app)
            .delete(`${BASE_URL}/documents/idDocument`)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(404);
    });

    it('returns 409 when the request was already submitted', async () => {
        const submitted = fakeRequest({ status: 'pending', idDocument: createStoredFile('locked-id.pdf') });
        LenderRequest.findOne.mockResolvedValue(submitted);

        const response = await request(app)
            .delete(`${BASE_URL}/documents/idDocument`)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(409);
        expect(submitted.save).not.toHaveBeenCalled();
        expect(uploadedFiles()).toContain('locked-id.pdf');
    });

    it('returns 500 when the lookup fails', async () => {
        LenderRequest.findOne.mockRejectedValue(new Error('Database unavailable'));

        const response = await request(app)
            .delete(`${BASE_URL}/documents/idDocument`)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(500);
    });
});

const incompleteRequests = [
    { documents: { idDocument: { originalName: 'id.pdf' } }, message: 'Please upload your proof of address' },
    { documents: { proofOfAddress: { originalName: 'addressproof.pdf' } }, message: 'Please upload your ID document' },
    { documents: {}, message: 'Please upload your ID document and proof of address' }
];

describe('POST /api/lender-requests/submit', () => {
    it('returns 200 and changes the status to pending when both documents are uploaded', async () => {
        const draft = fakeRequest({ idDocument: { originalName: 'id.pdf' }, proofOfAddress: { originalName: 'addressproof.pdf' } });
        LenderRequest.findOne.mockResolvedValue(draft);

        const response = await request(app)
            .post(`${BASE_URL}/submit`)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('pending');
        expect(draft.status).toBe('pending');
        expect(draft.save).toHaveBeenCalledOnce();
        expect(LenderRequest.findOne).toHaveBeenCalledWith({ user: USER_ID, status: { $in: ['draft', 'pending'] } });
    });

    it('returns 401 when not logged in', async () => {
        const response = await request(app).post(`${BASE_URL}/submit`);

        expect(response.status).toBe(401);
        expect(LenderRequest.findOne).not.toHaveBeenCalled();
    });

    it('returns 404 when the member has no request', async () => {
        const response = await request(app)
            .post(`${BASE_URL}/submit`)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(404);
    });

    it.each(incompleteRequests)(
        'returns 400 with "$message"',
        async ({ documents, message }) => {
        const draft = fakeRequest(documents);
        LenderRequest.findOne.mockResolvedValue(draft);

        const response = await request(app)
            .post(`${BASE_URL}/submit`)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(message);
        expect(draft.status).toBe('draft');
        expect(draft.save).not.toHaveBeenCalled();
    });

    it('returns 409 when the request was already submitted', async () => {
        const submitted = fakeRequest({ status: 'pending', idDocument: { originalName: 'id.pdf' }, proofOfAddress: { originalName: 'addressproof.pdf' } });
        LenderRequest.findOne.mockResolvedValue(submitted);

        const response = await request(app)
            .post(`${BASE_URL}/submit`)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(409);
        expect(submitted.save).not.toHaveBeenCalled();
    });

    it.each(['findOne', 'save'])(
        'returns 500 when %s fails',
        async (operation) => {
        const draft = fakeRequest({ idDocument: { originalName: 'id.pdf' }, proofOfAddress: { originalName: 'addressproof.pdf' } });
        LenderRequest.findOne.mockResolvedValue(draft);
        if (operation === 'findOne') LenderRequest.findOne.mockRejectedValue(new Error('Database unavailable'));
        if (operation === 'save') draft.save.mockRejectedValue(new Error('Database unavailable'));

        const response = await request(app)
            .post(`${BASE_URL}/submit`)
            .set('x-user-id', USER_ID);

        expect(response.status).toBe(500);
    });
});
