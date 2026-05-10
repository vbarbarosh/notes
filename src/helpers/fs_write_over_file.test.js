const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const fs_write_over_file = require('./fs_write_over_file');

describe('fs_write_over_file', function () {
    let root;

    beforeEach(async function () {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-overwrite-file-'));
    });

    afterEach(async function () {
        await fs.rm(root, {force: true, recursive: true});
    });

    it('overwrites files under apps/', async function () {
        const first = await fs_write_over_file(root, file('apps/demo/index.js', 'first'));
        const second = await fs_write_over_file(root, file('apps/demo/index.js', 'second'));

        assert.equal(first, second);
        assert.equal(path.relative(root, second), 'apps/demo/index.js');
        assert.equal(await fs.readFile(second, 'utf8'), 'second');
    });

    it('throws when the file is not under apps/', async function () {
        await assert.rejects(
            fs_write_over_file(root, file('image.png', 'image')),
            /overwrite=1 is only allowed for files under apps\//
        );
    });
});

function file(originalname, contents)
{
    return {originalname, buffer: Buffer.from(contents)};
}
