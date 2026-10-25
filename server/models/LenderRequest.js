import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
    {
        originalName: {
            type: String,
            required: true
        },
        storedName: {
            type: String,
            required: true
        },
        docType: {
            type: String,
            enum: ['application/pdf', 'image/jpeg', 'image/png','image/jpg' ],
            required: true
        },
        size: {
            type: Number,
            required: true
        },
        uploadedAt: {type: Date, default: Date.now}
    },
    { _id: false }
);

const lenderRequestSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        status: {
            type: String,
            enum: ['draft', 'pending', 'approved', 'rejected'],
            default: 'draft'
        },
        idDocument: {type: documentSchema},
        proofOfAddress: {type: documentSchema},
        reviewedBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
        reviewedAt: {type: Date},
        rejectionReason: {type: String}
    },
    { timestamps: true }
);

lenderRequestSchema.index({ status: 1 });
lenderRequestSchema.index(
    { user: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['draft', 'pending'] } } }
);

export const LenderRequest = mongoose.model('LenderRequest', lenderRequestSchema);
