const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const fs_mime = require('./fs_mime');

describe('fs_mime', function () {
    let root;

    beforeEach(async function () {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-fs-mime-'));
    });

    afterEach(async function () {
        await fs.rm(root, {force: true, recursive: true});
    });

    it('detects text SVG files as image/svg+xml', async function () {
        const file = path.join(root, 'icon.svg');
        await fs.writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>');

        assert.equal(await fs_mime(file), 'image/svg+xml');
    });
});
