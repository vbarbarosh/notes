const { createReadStream, createWriteStream, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } = require('fs');
const { randomUUID } = require('crypto');
const path = require('path');
const amx = require('@vbarbarosh/express-helpers/src/amx');
const multer = require('multer');
const sharp = require('sharp');
const fs_exists = require('@vbarbarosh/node-helpers/src/fs_exists');
const fs_lstat = require('@vbarbarosh/node-helpers/src/fs_lstat');
const fs_mkdirp = require('@vbarbarosh/node-helpers/src/fs_mkdirp');
const fs_path_safe_relative = require('../helpers/fs_path_safe_relative');
const fs_write_over_file = require('../helpers/fs_write_over_file');
const fs_write_unique_file = require('../helpers/fs_write_unique_file');

const CHUNKS_DIR = path.resolve(__dirname, '../../data/chunks');
const NOTES_DIR = path.resolve(__dirname, '../../data/notes');
const TEMP_DIR = path.resolve(__dirname, '../../data/temp-uploads');

const chunk_upload = multer({
    dest: TEMP_DIR,
    defParamCharset: 'utf8',
    limits: { fileSize: 25 * 1024 * 1024 },
});

// POST /api/v1/files/upload/start
// Body: { filename, total_chunks, total_size }
async function files_upload_start(req, res)
{
    const { filename, total_chunks, total_size } = req.body;
    if (!filename || !total_chunks) {
        res.status(400).json({ error: 'filename and total_chunks are required' });
        return;
    }
    const upload_id = randomUUID();
    const chunks_dir = path.join(CHUNKS_DIR, upload_id);
    await fs_mkdirp(chunks_dir);
    const meta = {
        filename,
        total_chunks: Number(total_chunks),
        total_size: Number(total_size || 0),
        user_uid: req.user_uid,
    };
    writeFileSync(path.join(chunks_dir, 'meta.json'), JSON.stringify(meta));
    res.json({ upload_id });
}

// POST /api/v1/files/upload/:upload_id/chunk/:chunk_index
// Body: multipart with 'chunk' field
async function files_upload_chunk(req, res)
{
    const upload_id = req.params.upload_id;
    const chunk_index = Number(req.params.chunk_index);
    const chunk = req.file;

    if (!chunk) {
        res.status(400).json({ error: 'No chunk provided' });
        return;
    }

    const chunks_dir = path.join(CHUNKS_DIR, upload_id);
    if (!await fs_exists(chunks_dir)) {
        require('fs').unlinkSync(chunk.path);
        res.status(404).json({ error: 'Upload not found' });
        return;
    }

    const meta = JSON.parse(readFileSync(path.join(chunks_dir, 'meta.json'), 'utf8'));
    if (meta.user_uid !== req.user_uid) {
        require('fs').unlinkSync(chunk.path);
        res.status(403).json({ error: 'Forbidden' });
        return;
    }

    if (chunk_index < 0 || chunk_index >= meta.total_chunks) {
        require('fs').unlinkSync(chunk.path);
        res.status(400).json({ error: 'Invalid chunk index' });
        return;
    }

    renameSync(chunk.path, path.join(chunks_dir, `chunk_${chunk_index}`));

    const received = readdirSync(chunks_dir).filter(f => f.startsWith('chunk_')).length;
    res.json({ received, total: meta.total_chunks });
}

// POST /api/v1/files/upload/:upload_id/assemble
// Body: { note_uid, overwrite }
async function files_upload_assemble(req, res)
{
    const upload_id = req.params.upload_id;
    const { note_uid, overwrite } = req.body;

    if (!note_uid) {
        res.status(400).json({ error: 'note_uid is required' });
        return;
    }

    const chunks_dir = path.join(CHUNKS_DIR, upload_id);
    if (!await fs_exists(chunks_dir)) {
        res.status(404).json({ error: 'Upload not found' });
        return;
    }

    const meta = JSON.parse(readFileSync(path.join(chunks_dir, 'meta.json'), 'utf8'));
    if (meta.user_uid !== req.user_uid) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }

    for (let i = 0; i < meta.total_chunks; i++) {
        if (!existsSync(path.join(chunks_dir, `chunk_${i}`))) {
            res.status(400).json({ error: `Missing chunk ${i}` });
            return;
        }
    }

    const temp_path = path.join(TEMP_DIR, `${upload_id}_assembled`);
    const out_stream = createWriteStream(temp_path);
    for (let i = 0; i < meta.total_chunks; i++) {
        await new Promise(function (resolve, reject) {
            const src = createReadStream(path.join(chunks_dir, `chunk_${i}`));
            src.pipe(out_stream, { end: false });
            src.on('end', resolve);
            src.on('error', reject);
        });
    }
    await new Promise(function (resolve, reject) {
        out_stream.end(err => err ? reject(err) : resolve());
    });

    const note_dir = path.resolve(NOTES_DIR, req.user_uid, note_uid);
    if (!await fs_exists(note_dir)) {
        require('fs').unlinkSync(temp_path);
        res.status(404).json({ error: 'Note Not Found' });
        return;
    }

    const files_root = path.resolve(note_dir, 'files');
    const fake_file = { originalname: meta.filename, path: temp_path };
    const should_overwrite = overwrite === '1' || overwrite === 1 || overwrite === true;

    const file_path = should_overwrite
        ? await fs_write_over_file(files_root, fake_file)
        : await fs_write_unique_file(files_root, fake_file);

    rmSync(chunks_dir, { recursive: true });

    const lstat = await fs_lstat(file_path);
    const rel = fs_path_safe_relative(files_root, file_path);
    const url = `/r/${note_uid}/files/${rel}`;
    const thumbnail_url = await is_image(file_path) ? `/t/1024/${note_uid}/files/${rel}` : null;

    res.json({ path: rel, url, thumbnail_url, size: lstat.size });
}

async function is_image(file_path)
{
    try {
        await sharp(file_path).metadata();
        return true;
    }
    catch {
        return false;
    }
}

const routes = [
    { req: 'POST /api/v1/files/upload/start', fn: files_upload_start },
    { req: 'POST /api/v1/files/upload/:upload_id/assemble', fn: files_upload_assemble },
];

module.exports = routes;
module.exports.chunk_upload = chunk_upload;
module.exports.files_upload_chunk = files_upload_chunk;
