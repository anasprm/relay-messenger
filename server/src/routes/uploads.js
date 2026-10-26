import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { MAX_UPLOAD_BYTES } from '../config.js';
import { extensionFor, isBlockedExtension, storeUpload } from '../storage.js';
import { clampDuration, inferKind, sanitizeFileName } from '../utils.js';

const router = Router();

function decodeOriginalName(name) {
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

/** POST /api/uploads — multipart field "file" (+ optional duration/width/height). */
router.post('/', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File is larger than the 30 MB limit.' });
      }
      return res.status(400).json({ error: 'Upload failed. Please try again.' });
    }

    if (!req.file) return res.status(400).json({ error: 'No file was received.' });

    const originalName = sanitizeFileName(
      decodeOriginalName(req.file.originalname || '') || 'attachment',
    );
    const extension = extensionFor(originalName);
    if (isBlockedExtension(extension)) {
      return res
        .status(400)
        .json({ error: 'That file type is not allowed for security reasons.' });
    }

    try {
      const stored = await storeUpload(req.file.buffer, {
        extension,
        contentType: req.file.mimetype || 'application/octet-stream',
      });

      const attachment = {
        url: stored.url,
        name: originalName,
        mime: req.file.mimetype || 'application/octet-stream',
        size: req.file.size,
        kind: inferKind(req.file.mimetype || ''),
        duration: clampDuration(req.body?.duration),
        width: Number(req.body?.width) || undefined,
        height: Number(req.body?.height) || undefined,
      };

      res.status(201).json({ attachment, storage: stored.storage });
    } catch (uploadError) {
      console.error('[uploads] Failed to persist file:', uploadError);
      res.status(500).json({ error: 'Upload could not be saved. Please try again.' });
    }
  });
});

export default router;
