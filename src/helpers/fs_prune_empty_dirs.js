const fs_path_dirname = require('@vbarbarosh/node-helpers/src/fs_path_dirname');
const fs_path_resolve = require('@vbarbarosh/node-helpers/src/fs_path_resolve');
const fs_rmdir = require('@vbarbarosh/node-helpers/src/fs_rmdir');
const path = require('path');

async function fs_prune_empty_dirs(root, start)
{
    let current = fs_path_resolve(start);
    const stop = fs_path_resolve(root);

    if (current !== stop && !current.startsWith(`${stop}${path.sep}`)) {
        throw new Error(`Path is outside root: ${start}`);
    }

    for (; current !== stop; current = fs_path_dirname(current)) {
        try {
            await fs_rmdir(current);
        }
        catch (error) {
            switch (error.code) {
            case 'ENOENT':
                // Already gone; continue pruning from parent.
                break;
            case 'ENOTEMPTY':
            case 'EEXIST':
                return;
            default:
                throw error;
            }
        }
    }
}

module.exports = fs_prune_empty_dirs;
