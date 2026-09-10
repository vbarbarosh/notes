const fs = require('fs');
const path = require('path');

// `<script src>` and `<link href>` only. Vue bindings such as `src="url"` on
// other tags, absolute URLs and data: URLs are left alone.
const REFERENCE_PATTERN = /<(?:script|link)\b[^>]*?\s(?:src|href)="([^"?#]+)"/g;

/**
 * Appends `?v=<mtime>` to every local script and stylesheet reference in a
 * page, so a redeployed file is fetched under a new URL instead of from a
 * cache. The tag is the file's modification time in milliseconds; a
 * reference to a file that does not exist under the static root is left as
 * it is.
 *
 * @param {string} html
 * @param {string} static_root - directory the pages are served from
 * @param {string} page_dir - directory of the page, for relative references
 */
async function html_asset_versions(html, static_root, page_dir)
{
    const tags = new Map();
    for (const match of String(html || '').matchAll(REFERENCE_PATTERN)) {
        const url = match[1];
        if (tags.has(url) || !is_local(url)) {
            continue;
        }
        tags.set(url, await file_version(static_root, page_dir, url));
    }

    const out = String(html || '').replace(REFERENCE_PATTERN, function (tag, url) {
        const version = tags.get(url);
        if (!version) {
            return tag;
        }
        return tag.replace(`"${url}"`, `"${url}?v=${version}"`);
    });
    return out;
}

function is_local(url)
{
    return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url);
}

async function file_version(static_root, page_dir, url)
{
    const root = path.resolve(static_root);
    const file = url.startsWith('/') ? path.join(root, url) : path.resolve(page_dir, url);
    if (file !== root && !file.startsWith(root + path.sep)) {
        return null;
    }
    try {
        const stat = await fs.promises.stat(file);
        return stat.isFile() ? String(Math.floor(stat.mtimeMs)) : null;
    }
    catch (error) {
        return null;
    }
}

module.exports = html_asset_versions;
