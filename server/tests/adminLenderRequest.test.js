import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import app from "../app.js";
import { LenderRequest } from "../models/LenderRequest.js";
import { UPLOAD_DIR } from "../middleware/uploadLenderDocument.js";

// Mock the LenderRequest model with the two functions the admin controller uses: find and findById.
vi.mock('../models/LenderRequest.js', () => ({
    LenderRequest: {
        find: vi.fn(),
        findById: vi.fn()
    }
}));

const ADMIN_ID = '64b0000000000000000000aa';
const REQUEST_ID = '64b0000000000000000000bb';
const BASE_URL = '/api/admin/lender-requests';
const USER_FIELDS = 'username name email phoneNumber address';

const sampleRequest = {
    _id: REQUEST_ID,
    status: 'pending',
    user: { name: 'Sara', email: 'sara@example.com' },
    idDocument: { originalName: 'passport.png', storedName: 'admin-test-id.png', docType: 'image/png', size: 8 },
    proofOfAddress: { originalName: 'proof.pdf', storedName: 'admin-test-proof.pdf', docType: 'application/pdf', size: 8 }
};

// Logs in as an admin with the temporary headers read by tempAuth.
function asAdmin(req) {
    return req.set('x-user-id', ADMIN_ID).set('x-user-role', 'admin');
}

beforeEach(() => {
    vi.resetAllMocks();

    LenderRequest.find.mockReturnValue({ populate: vi.fn().mockReturnValue({ sort: vi.fn().mockResolvedValue([sampleRequest]) }) });
    LenderRequest.findById.mockReturnValue({ populate: vi.fn().mockResolvedValue(sampleRequest) });
});

afterEach(() => {
    fs.rmSync(path.join(UPLOAD_DIR, 'admin-test-id.png'), { force: true });
    fs.rmSync(path.join(UPLOAD_DIR, 'admin-test-proof.pdf'), { force: true });
});

const protectedUrls = [
    `${BASE_URL}`,
    `${BASE_URL}/${REQUEST_ID}`,
    `${BASE_URL}/${REQUEST_ID}/documents/idDocument`
];

describe('Admin access', () => {
    it.each(protectedUrls)('returns 401 for %s when not logged in', async (url) => {
        const response = await request(app).get(url);

        expect(response.status).toBe(401);
    });

    it.each(protectedUrls)('returns 403 for %s when the user is not an admin', async (url) => {
        const response = await request(app)
            .get(url)
            .set('x-user-id', ADMIN_ID);

        expect(response.status).toBe(403);
        expect(LenderRequest.find).not.toHaveBeenCalled();
        expect(LenderRequest.findById).not.toHaveBeenCalled();
    });
});

describe('GET /api/admin/lender-requests', () => {
    it('returns 200 with the pending requests by default', async () => {
        const response = await asAdmin(request(app).get(BASE_URL));

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].user.name).toBe('Sara');
        expect(LenderRequest.find).toHaveBeenCalledWith({ status: 'pending' });

        const populate = LenderRequest.find.mock.results[0].value.populate;
        expect(populate).toHaveBeenCalledWith('user', USER_FIELDS);
        expect(populate.mock.results[0].value.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it.each(['approved', 'rejected'])('returns 200 and filters by status %s', async (status) => {
        const response = await asAdmin(request(app).get(`${BASE_URL}?status=${status}`));

        expect(response.status).toBe(200);
        expect(LenderRequest.find).toHaveBeenCalledWith({ status });
    });

    it.each(['draft', 'banana'])('returns 400 for status %s', async (status) => {
        const response = await asAdmin(request(app).get(`${BASE_URL}?status=${status}`));

        expect(response.status).toBe(400);
        expect(LenderRequest.find).not.toHaveBeenCalled();
    });

    it('returns 500 when the lookup fails', async () => {
        LenderRequest.find.mockImplementation(() => { throw new Error('Database unavailable'); });

        const response = await asAdmin(request(app).get(BASE_URL));

        expect(response.status).toBe(500);
    });
});

describe('GET /api/admin/lender-requests/:id', () => {
    it('returns 200 with the request, its documents and the user details', async () => {
        const response = await asAdmin(request(app).get(`${BASE_URL}/${REQUEST_ID}`));

        expect(response.status).toBe(200);
        expect(response.body.user.name).toBe('Sara');
        expect(response.body.idDocument.originalName).toBe('passport.png');
        expect(response.body.proofOfAddress.originalName).toBe('proof.pdf');
        expect(LenderRequest.findById).toHaveBeenCalledWith(REQUEST_ID);
        expect(LenderRequest.findById.mock.results[0].value.populate).toHaveBeenCalledWith('user', USER_FIELDS);
    });

    it('returns 400 for an invalid id', async () => {
        const response = await asAdmin(request(app).get(`${BASE_URL}/not-an-id`));

        expect(response.status).toBe(400);
        expect(LenderRequest.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when the request does not exist', async () => {
        LenderRequest.findById.mockReturnValue({ populate: vi.fn().mockResolvedValue(null) });

        const response = await asAdmin(request(app).get(`${BASE_URL}/${REQUEST_ID}`));

        expect(response.status).toBe(404);
    });

    it('returns 500 when the lookup fails', async () => {
        LenderRequest.findById.mockReturnValue({ populate: vi.fn().mockRejectedValue(new Error('Database unavailable')) });

        const response = await asAdmin(request(app).get(`${BASE_URL}/${REQUEST_ID}`));

        expect(response.status).toBe(500);
    });
});

describe('GET /api/admin/lender-requests/:id/documents/:slot', () => {
    beforeEach(() => {
        LenderRequest.findById.mockResolvedValue(sampleRequest);
        fs.writeFileSync(path.join(UPLOAD_DIR, 'admin-test-id.png'), 'png data');
        fs.writeFileSync(path.join(UPLOAD_DIR, 'admin-test-proof.pdf'), 'pdf data');
    });

    it.each([
        { slot: 'idDocument', type: 'image/png', content: 'png data' },
        { slot: 'proofOfAddress', type: 'application/pdf', content: 'pdf data' }
    ])('returns 200 with the $slot file for preview', async ({ slot, type, content }) => {
        const response = await asAdmin(request(app).get(`${BASE_URL}/${REQUEST_ID}/documents/${slot}`))
            .buffer(true)
            .parse((res, done) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => done(null, data));
            });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain(type);
        expect(response.headers['content-disposition']).toBeUndefined();
        expect(response.body).toBe(content);
    });

    it('returns 200 as a download with the original file name', async () => {
        const response = await asAdmin(request(app).get(`${BASE_URL}/${REQUEST_ID}/documents/proofOfAddress?download=true`));

        expect(response.status).toBe(200);
        expect(response.headers['content-disposition']).toContain('attachment');
        expect(response.headers['content-disposition']).toContain('proof.pdf');
    });

    it('returns 400 for an invalid slot', async () => {
        const response = await asAdmin(request(app).get(`${BASE_URL}/${REQUEST_ID}/documents/banana`));

        expect(response.status).toBe(400);
        expect(LenderRequest.findById).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid id', async () => {
        const response = await asAdmin(request(app).get(`${BASE_URL}/not-an-id/documents/idDocument`));

        expect(response.status).toBe(400);
    });

    it('returns 404 when the request does not exist', async () => {
        LenderRequest.findById.mockResolvedValue(null);

        const response = await asAdmin(request(app).get(`${BASE_URL}/${REQUEST_ID}/documents/idDocument`));

        expect(response.status).toBe(404);
    });

    it('returns 404 when the slot is empty', async () => {
        LenderRequest.findById.mockResolvedValue({ ...sampleRequest, idDocument: undefined });

        const response = await asAdmin(request(app).get(`${BASE_URL}/${REQUEST_ID}/documents/idDocument`));

        expect(response.status).toBe(404);
        expect(response.body.message).toBe('Document not found');
    });

    it('returns 404 when the file is missing on disk', async () => {
        fs.rmSync(path.join(UPLOAD_DIR, 'admin-test-id.png'));

        const response = await asAdmin(request(app).get(`${BASE_URL}/${REQUEST_ID}/documents/idDocument`));

        expect(response.status).toBe(404);
        expect(response.body.message).toBe('Document file is missing');
    });

    it('returns 500 when the lookup fails', async () => {
        LenderRequest.findById.mockRejectedValue(new Error('Database unavailable'));

        const response = await asAdmin(request(app).get(`${BASE_URL}/${REQUEST_ID}/documents/idDocument`));

        expect(response.status).toBe(500);
    });
});
