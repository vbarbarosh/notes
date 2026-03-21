const fs_path_resolve = require('@vbarbarosh/node-helpers/src/fs_path_resolve');

/**
 * Returns the full path relative to the given root, ensuring it doesn't go outside the root.
 *
 * @param {string} root - The root directory.
 * @param {string} relative - The path to resolve (can be relative or absolute).
 * @returns {string} The resolved path that is within the root directory.
 */
function fs_path_safe_resolve(root, relative)
{
    // - split `relative` by /
    // - in each component
    //     - remove any leading dots
    //     - if the component is empty - ignore it

    const safe = relative.split('/').map(v => v.replace(/^\.+/, '')).filter(v => v).join('/');
    const sp = root.endsWith('/') ? '' : '/';
    return root + (sp + fs_path_resolve('/', safe).slice(1)).replace(/\/+$/, '');
}

module.exports = fs_path_safe_resolve;
