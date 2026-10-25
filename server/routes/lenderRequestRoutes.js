import { Router } from 'express';
import { tempAuth } from '../middleware/tempAuth.js';
import { uploadLenderDocument, handleUploadErrors } from '../middleware/uploadLenderDocument.js';
import { getMyRequest, uploadDocument, removeDocument, submitRequest} from '../controllers/lenderRequestController.js';

const router = Router();

router.use(tempAuth);

router.get('/', getMyRequest);
router.post('/documents/:slot', uploadLenderDocument, uploadDocument, handleUploadErrors);
router.delete('/documents/:slot', removeDocument);
router.post('/submit', submitRequest);



export default router;
