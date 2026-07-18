const path = require('path');

function fs_path_strict_resolve(root, relative)
{
    if (typeof relative !== 'string' || !relative || relative.includes('\0') || relative.includes('\\')) {
        throw new Error('Invalid relative path');
    }

    const parts = relative.split('/');
    if (parts.some(part => !part || part === '.' || part === '..')) {
        throw new Error('Invalid relative path');
    }

    const absolute_root = path.resolve(root);
    const resolved = path.resolve(absolute_root, ...parts);
    if (!resolved.startsWith(`${absolute_root}${path.sep}`)) {
        throw new Error('Path is outside root');
    }

    return resolved;
}

module.exports = fs_path_strict_resolve;
