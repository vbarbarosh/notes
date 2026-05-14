const fs = require('fs/promises');
const file_type = require('file-type');
const path_mod = require('path');

async function fs_mime(path)
{
    const info = await file_type.fileTypeFromFile(path);
    const out = info?.mime ?? 'application/octet-stream';
    const ext = path_mod.extname(path).toLowerCase();
    if ((out === 'application/octet-stream' || out === 'application/xml') && ext === '.svg' && await is_svg(path)) {
        return 'image/svg+xml';
    }
    if (out === 'application/octet-stream') {
        return mime_by_extension(ext) || out;
    }
    return out;
}

async function is_svg(path)
{
    const fh = await fs.open(path, 'r');
    try {
        const buf = Buffer.alloc(4096);
        const result = await fh.read(buf, 0, buf.length, 0);
        return /<svg(?:\s|>)/i.test(buf.subarray(0, result.bytesRead).toString('utf8'));
    }
    finally {
        await fh.close();
    }
}

function mime_by_extension(ext)
{
    return {
        '.m4a': 'audio/mp4',
        '.m4v': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.mov': 'video/quicktime',
        '.mp3': 'audio/mpeg',
        '.mp4': 'video/mp4',
        '.oga': 'audio/ogg',
        '.ogg': 'audio/ogg',
        '.ogv': 'video/ogg',
        '.webm': 'video/webm',
    }[ext] || null;
}

module.exports = fs_mime;
