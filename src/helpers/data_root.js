const fs_path_resolve = require('@vbarbarosh/node-helpers/src/fs_path_resolve');
const fs_path_safe_resolve = require('./fs_path_safe_resolve');

const DATA_ROOT = fs_path_resolve(__dirname, '..', '..', 'data');

function data_root(user_uid)
{
    if (!user_uid || user_uid === '.') {
        return DATA_ROOT;
    }
    return fs_path_safe_resolve(fs_path_resolve(DATA_ROOT, 'users'), user_uid);
}

module.exports = data_root;
