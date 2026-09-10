const fs = require('fs');
const html_page_send = require('../html_page_send');
const path = require('path');

/**
 * Serves the HTML pages under a static root ahead of `express.static`, with
 * their asset references versioned by html_page_send. A directory request
 * resolves to its index.html, as express.static would. Anything that is not
 * an existing page falls through.
 *
 * @param {string} static_root
 */
function express_static_html(static_root)
{
    const root = path.resolve(static_root);

    return async function (req, res, next) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            next();
            return;
        }

        let rel;
        try {
            rel = decodeURIComponent(req.path);
        }
        catch (error) {
            next();
            return;
        }
        if (rel.endsWith('/')) {
            rel += 'index.html';
        }
        if (!rel.endsWith('.html')) {
            next();
            return;
        }

        const file = path.join(root, rel);
        if (!file.startsWith(root + path.sep) || !await is_file(file)) {
            next();
            return;
        }

        try {
            await html_page_send(res, root, file);
        }
        catch (error) {
            next(error);
        }
    };
}

async function is_file(file)
{
    try {
        const stat = await fs.promises.stat(file);
        return stat.isFile();
    }
    catch (error) {
        return false;
    }
}

module.exports = express_static_html;
