import { Router } from 'express';
import { readMedia } from '../media-store.js';

const router = Router();

const ID_PATTERN = /^[a-f0-9-]{36}$/i;

function notFound(res) {
  res.status(404).json({ error: 'This attachment is no longer available on the server.' });
}

/**
 * GET /media/:id — streams a file that lives in Firestore chunk storage.
 *
 * URLs are unguessable UUIDs and the content is immutable, so the response can
 * be cached for a year. Range requests are honoured because browsers ask for
 * them when seeking inside a video.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ID_PATTERN.test(id)) return notFound(res);

    const media = await readMedia(id);
    if (!media) return notFound(res);

    const total = media.buffer.length;

    res.setHeader('Content-Type', media.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const range = req.headers.range;
    if (!range) {
      res.setHeader('Content-Length', total);
      res.end(media.buffer);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (!match) {
      res.setHeader('Content-Range', `bytes */${total}`);
      res.status(416).end();
      return;
    }

    const [, rawStart, rawEnd] = match;
    let start;
    let end;

    if (rawStart === '' && rawEnd === '') {
      res.setHeader('Content-Range', `bytes */${total}`);
      res.status(416).end();
      return;
    }

    if (rawStart === '') {
      // "bytes=-500" means the last 500 bytes.
      const suffix = Number(rawEnd);
      start = Math.max(0, total - suffix);
      end = total - 1;
    } else {
      start = Number(rawStart);
      end = rawEnd === '' ? total - 1 : Math.min(Number(rawEnd), total - 1);
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
      res.setHeader('Content-Range', `bytes */${total}`);
      res.status(416).end();
      return;
    }

    const slice = media.buffer.subarray(start, end + 1);
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', slice.length);
    res.end(slice);
  } catch (error) {
    next(error);
  }
});

export default router;
