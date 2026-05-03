const fs_mkdirp = require('@vbarbarosh/node-helpers/src/fs_mkdirp');
const fs_path_dirname = require('@vbarbarosh/node-helpers/src/fs_path_dirname');
const fs_path_safe_relative = require('./fs_path_safe_relative');
const fs_path_safe_resolve = require('./fs_path_safe_resolve');
const fs_rename = require('@vbarbarosh/node-helpers/src/fs_rename');
const fs_write = require('@vbarbarosh/node-helpers/src/fs_write');

async function fs_write_over_file(root, file)
{
    if (file.buffer) {
        return fs_write_over_file_buf(root, file.originalname, file.buffer);
    }
    return fs_write_over_file_disk(root, file.originalname, file.path);
}

async function fs_write_over_file_buf(root, relative, buffer)
{
    const file_path = fs_path_safe_resolve(root, relative);
    const path = fs_path_safe_relative(root, file_path);

    if (!path.startsWith('apps/')) {
        throw new Error('overwrite=1 is only allowed for files under apps/');
    }

    await fs_mkdirp(fs_path_dirname(file_path));
    await fs_write(file_path, buffer);
    return file_path;
}

// {
//   fieldname: 'file',
//   originalname: 'NHWadv_SB.pdf',
//   encoding: '7bit',
//   mimetype: 'application/pdf',
//   destination: '/data/temp-uploads',
//   filename: '86974d9cb1261d0477e12f55f37666fc',
//   path: '/data/temp-uploads/86974d9cb1261d0477e12f55f37666fc',
//   size: 41780903
// }
async function fs_write_over_file_disk(root, relative, uploaded_file)
{
    const file_path = fs_path_safe_resolve(root, relative);
    const path = fs_path_safe_relative(root, file_path);

    if (!path.startsWith('apps/')) {
        throw new Error('overwrite=1 is only allowed for files under apps/');
    }

    await fs_mkdirp(fs_path_dirname(file_path));
    await fs_rename(uploaded_file, file_path);
    return file_path;
}

module.exports = fs_write_over_file;
