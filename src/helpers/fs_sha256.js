const crypto = require('crypto');
const fs = require('fs');

async function fs_sha256(path)
{
    const hash = crypto.createHash('sha256');

    const highWaterMark = 1024*1024;
    for await (const chunk of fs.createReadStream(path, {highWaterMark})) {
        hash.update(chunk);
    }

    return hash.digest('hex');
}

module.exports = fs_sha256;
