const fs_mkdirp = require('@vbarbarosh/node-helpers/src/fs_mkdirp');
const fs_path_dirname = require('@vbarbarosh/node-helpers/src/fs_path_dirname');
const fs_path_safe_relative = require('./fs_path_safe_relative');
const fs_path_safe_resolve = require('./fs_path_safe_resolve');
const fs_write = require('@vbarbarosh/node-helpers/src/fs_write');

async function fs_write_over_file(root, relative, buffer)
{
    const file_path = fs_path_safe_resolve(root, relative);
    const path = fs_path_safe_relative(root, file_path);

    if (!path.startsWith('apps/')) {
        throw new Error('overwrite=1 is only allowed for files under apps/');
    }

    await fs_mkdirp(fs_path_dirname(file_path));
    await fs_write(file_path, buffer);
    return file_path;
}

module.exports = fs_write_over_file;
