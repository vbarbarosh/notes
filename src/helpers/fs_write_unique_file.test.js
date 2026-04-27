const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const fs_write_unique_file = require('./fs_write_unique_file');

describe('fs_write_unique_file', function () {
    let root;

    beforeEach(async function () {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-unique-file-'));
    });

    afterEach(async function () {
        await fs.rm(root, {force: true, recursive: true});
    });

    it('adds a numeric suffix when a file already exists', async function () {
        const first = await fs_write_unique_file(root, 'image.png', Buffer.from('first'));
        const second = await fs_write_unique_file(root, 'image.png', Buffer.from('second'));

        assert.equal(path.basename(first), 'image.png');
        assert.equal(path.basename(second), 'image_2.png');
        assert.equal(await fs.readFile(first, 'utf8'), 'first');
        assert.equal(await fs.readFile(second, 'utf8'), 'second');
    });

    it('uses parenthesized numbers when the name has spaces', async function () {
        await fs_write_unique_file(root, 'my image.png', Buffer.from('first'));
        const second = await fs_write_unique_file(root, 'my image.png', Buffer.from('second'));

        assert.equal(path.basename(second), 'my image (2).png');
    });

    it('uses the first underscore or hyphen from the name', async function () {
        await fs_write_unique_file(root, 'my_image.png', Buffer.from('first'));
        await fs_write_unique_file(root, 'my-image.png', Buffer.from('first'));
        await fs_write_unique_file(root, 'my-image_v1.png', Buffer.from('first'));

        const underscore = await fs_write_unique_file(root, 'my_image.png', Buffer.from('second'));
        const hyphen = await fs_write_unique_file(root, 'my-image.png', Buffer.from('second'));
        const first_separator = await fs_write_unique_file(root, 'my-image_v1.png', Buffer.from('second'));

        assert.equal(path.basename(underscore), 'my_image_2.png');
        assert.equal(path.basename(hyphen), 'my-image-2.png');
        assert.equal(path.basename(first_separator), 'my-image_v1-2.png');
    });

    it('keeps colliding uploads in the same sanitized directory', async function () {
        const first = await fs_write_unique_file(root, '../nested/image.png', Buffer.from('first'));
        const second = await fs_write_unique_file(root, '../nested/image.png', Buffer.from('second'));

        assert.equal(path.relative(root, first), 'nested/image.png');
        assert.equal(path.relative(root, second), 'nested/image_2.png');
    });

    it('handles parallel writes with the same requested name', async function () {
        const files = await Promise.all([
            fs_write_unique_file(root, 'image.png', Buffer.from('one')),
            fs_write_unique_file(root, 'image.png', Buffer.from('two')),
            fs_write_unique_file(root, 'image.png', Buffer.from('three')),
        ]);

        assert.deepEqual(files.map(v => path.basename(v)).sort(), [
            'image.png',
            'image_2.png',
            'image_3.png',
        ]);
    });
});
