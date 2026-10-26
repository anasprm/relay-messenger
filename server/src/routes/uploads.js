import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { MAX_UPLOAD_BYTES, UPLOAD_DIR } from '../config.js';
import { clampDuration, inferKind, sanitizeFileName } from '../utils.js';

const router = Router();

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.vbs',
  '.jar', '.js', '.html', '.htm', '.dll', '.cpl', '.hta',
]);

function decodeOriginalName(name) {
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const original = decodeOriginalName(file.originalname || '');
    const extension = path.extname(original).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12);
    if (BLOCKED_EXTENSIONS.has(extension)) {
      return callback(new Error('BLOCKED_FILE_TYPE'));
    }
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

/** POST /api/uploads — multipart field "file" (+ optional duration/width/height). */
router.post('/', requireAuth, (req, res) => {
  upload.single('file')(req, res, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File is larger than the 30 MB limit.' });
      }
      if (error.message === 'BLOCKED_FILE_TYPE') {
        return res.status(400).json({ error: 'That file type is not allowed for security reasons.' });
      }
      return res.status(400).json({ error: 'Upload failed. Please try again.' });
    }

    if (!req.file) return res.status(400).json({ error: 'No file was received.' });

    const originalName = sanitizeFileName(
      decodeOriginalName(req.file.originalname || '') || req.file.filename,
    );
    const attachment = {
      url: `/uploads/${req.file.filename}`,
      name: originalName,
      mime: req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
      kind: inferKind(req.file.mimetype || ''),
      duration: clampDuration(req.body?.duration),
      width: Number(req.body?.width) || undefined,
      height: Number(req.body?.height) || undefined,
    };

    res.status(201).json({ attachment });
  });
});

export default router;
