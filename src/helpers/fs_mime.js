const fs = require('fs/promises');
const file_type = require('file-type');
const path_mod = require('path');

async function fs_mime(path)
{
    const info = await file_type.fileTypeFromFile(path);
    const out = info?.mime ?? 'application/octet-stream';
    if ((out === 'application/octet-stream' || out === 'application/xml') && path_mod.extname(path).toLowerCase() === '.svg' && await is_svg(path)) {
        return 'image/svg+xml';
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

module.exports = fs_mime;
