const path = require('path');

// Extensions a browser will execute as an active document (script, event
// handlers, external entities) when the file is navigated to directly or
// framed. User-uploaded files are served from the app's own origin, so serving
// these inline is stored XSS. They are sent with `Content-Disposition:
// attachment` and an empty CSP sandbox so a shared link can not run script on
// the app origin. `<img>`/`<video>`/`<audio>` embedding ignores
// Content-Disposition and an empty sandbox, so inline media keeps working.
const ACTIVE_EXT = new Set([
    '.html', '.htm', '.xhtml', '.xht', '.shtml',
    '.svg', '.svgz',
    '.xml', '.xsl', '.xslt',
    '.mhtml', '.mht',
]);

/**
 * Hardens the response headers before a user-uploaded file is streamed.
 * Always disables MIME sniffing; forces a download + sandbox for types a
 * browser would otherwise execute on the app origin.
 *
 * @param {import('express').Response} res
 * @param {string} file_path - the file about to be sent (used for its extension)
 */
function harden_download_headers(res, file_path)
{
    res.set('X-Content-Type-Options', 'nosniff');

    const ext = path.extname(String(file_path || '')).toLowerCase();
    if (ACTIVE_EXT.has(ext)) {
        res.set('Content-Disposition', 'attachment');
        res.set('Content-Security-Policy', "sandbox; default-src 'none'");
        res.set('X-Frame-Options', 'DENY');
    }
}

module.exports = harden_download_headers;
