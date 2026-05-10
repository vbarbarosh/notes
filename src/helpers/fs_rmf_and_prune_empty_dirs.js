const fs_path_dirname = require('@vbarbarosh/node-helpers/src/fs_path_dirname');
const fs_prune_empty_dirs = require('./fs_prune_empty_dirs');
const fs_rmf = require('@vbarbarosh/node-helpers/src/fs_rmf');

async function fs_rmf_and_prune_empty_dirs(root, file)
{
    await fs_rmf(file);
    await fs_prune_empty_dirs(root, fs_path_dirname(file));
}

module.exports = fs_rmf_and_prune_empty_dirs;
