const fs = require('fs');
const html_asset_versions = require('./html_asset_versions');
const path = require('path');

/**
 * Sends a static HTML page with its local script and stylesheet references
 * versioned. The page itself is never cached: it is the one URL that must
 * always be fresh for the versioned references to reach the browser.
 *
 * @param {import('express').Response} res
 * @param {string} static_root - directory the pages are served from
 * @param {string} file - absolute path of the page under static_root
 */
async function html_page_send(res, static_root, file)
{
    const html = await fs.promises.readFile(file, 'utf8');
    const page = await html_asset_versions(html, static_root, path.dirname(file));
    res.set('Cache-Control', 'no-cache');
    res.type('html');
    res.send(page);
}

module.exports = html_page_send;
