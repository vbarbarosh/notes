const fs_mkdirp = require('@vbarbarosh/node-helpers/src/fs_mkdirp');
const fs_path_dirname = require('@vbarbarosh/node-helpers/src/fs_path_dirname');
const fs_read_json = require('@vbarbarosh/node-helpers/src/fs_read_json');
const fs_write_json = require('@vbarbarosh/node-helpers/src/fs_write_json');

async function cache_api(file, build)
{
    try {
        return await fs_read_json(file);
    }
    catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
            throw error;
        }
    }

    const out = await build();

    await fs_mkdirp(fs_path_dirname(file));
    await fs_write_json(file, out);

    return out;
}

module.exports = cache_api;
