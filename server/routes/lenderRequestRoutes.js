import { Router } from 'express';
import { tempAuth } from '../middleware/tempAuth.js';
import { uploadLenderDocument, handleUploadErrors } from '../middleware/uploadLenderDocument.js';
import { getMyRequest, uploadDocument, removeDocument } from '../controllers/lenderRequestController.js';

const router = Router();

router.use(tempAuth);

router.get('/me', getMyRequest);
router.post('/me/documents/:slot', uploadLenderDocument, uploadDocument, handleUploadErrors);
router.delete('/me/documents/:slot', removeDocument);

export default router;
