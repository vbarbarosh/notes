const fs_path_relative = require('@vbarbarosh/node-helpers/src/fs_path_relative');
const fs_path_resolve = require('@vbarbarosh/node-helpers/src/fs_path_resolve');

/**
 * Returns the short path relative to the root (root + returned path = full path)
 *
 * @param {string} root - The root directory.
 * @param {string} path - The path to resolve (can be relative or absolute).
 * @returns {string} The path relative to the root.
 */
function fs_path_safe_relative(root, path)
{
    const absoluteRoot = fs_path_resolve(root);
    const resolvedPath = fs_path_resolve(absoluteRoot, path);

    // Ensure the resolved path is within the root
    if (!resolvedPath.startsWith(absoluteRoot)) {
        return '.'; // Or throw an error if preferred
    }

    // Return the relative path from root to resolvedPath
    return fs_path_relative(absoluteRoot, resolvedPath) || '.';
}

module.exports = fs_path_safe_relative;
