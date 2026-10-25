import { Router } from 'express';
import { tempAuth } from '../middleware/tempAuth.js';
import { blockLendersAndAdmins } from '../middleware/blockLendersAndAdmins.js';
import { uploadLenderDocument, handleUploadErrors } from '../middleware/uploadLenderDocument.js';
import { getMyRequest, uploadDocument, removeDocument, submitRequest } from '../controllers/lenderRequestController.js';

const router = Router();

router.use(tempAuth);

router.get('/', getMyRequest);
router.post('/documents/:slot', blockLendersAndAdmins, uploadLenderDocument, uploadDocument, handleUploadErrors);
router.delete('/documents/:slot', blockLendersAndAdmins, removeDocument);
router.post('/submit', blockLendersAndAdmins, submitRequest);

export default router;
