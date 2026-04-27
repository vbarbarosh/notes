const fs_mkdirp = require('@vbarbarosh/node-helpers/src/fs_mkdirp');
const fs_path_safe_resolve = require('./fs_path_safe_resolve');
const fs_write = require('@vbarbarosh/node-helpers/src/fs_write');
const path = require('path');

async function fs_write_unique_file(root, relative, buffer)
{
    const file_path = fs_path_safe_resolve(root, relative);
    const parsed = path.parse(file_path);

    await fs_mkdirp(parsed.dir);

    for (let i = 0; ; ++i) {
        const candidate = path.join(parsed.dir, unique_basename(parsed, i));

        try {
            await fs_write(candidate, buffer, {flag: 'wx'});
            return candidate;
        }
        catch (error) {
            if (error.code === 'EEXIST') {
                continue;
            }
            throw error;
        }
    }
}

function unique_basename(parsed, attempt)
{
    if (!attempt) {
        return parsed.base;
    }

    const n = attempt + 1;
    if (parsed.name.includes(' ')) {
        return `${parsed.name} (${n})${parsed.ext}`;
    }

    const i1 = parsed.name.indexOf('_');
    const i2 = parsed.name.indexOf('-');
    if (i1 === -1 && i2 === -1) {
        return `${parsed.name}_${n}${parsed.ext}`;
    }

    const sep = i1 === -1 ? '-' : i2 === -1 ? '_' : i1 < i2 ? '_' : '-';
    return `${parsed.name}${sep}${n}${parsed.ext}`;
}

module.exports = fs_write_unique_file;
