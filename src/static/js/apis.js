async function api_notes_list(filters)
{
    return http_get_json(urlmod('/api/v1/notes', filters));
}

async function api_notes_fetch(note_uid)
{
    return http_get_json(`/api/v1/notes/${note_uid}`);
}

async function api_notes_create({body})
{
    return http_post_json('/api/v1/notes', {body});
}

async function api_notes_remove({note_uid})
{
    return http_delete(`/api/v1/notes/${note_uid}`);
}

async function api_notes_update({note_uid, body})
{
    return http_patch_json(`/api/v1/notes/${note_uid}`, {body});
}

async function api_notes_upload_file({note_uid, file, onProgress})
{
    const items = [];

    items.push({name: 'file', body: file, options: file.fullPath});
    return http_post_multipart(`/api/v1/notes/${note_uid}/files`, items, {
        onUploadProgress: onProgress,
    });
}

async function api_notes_files_list({note_uid, q, mime, limit, offset})
{
    return http_get_json(urlmod(`/api/v1/notes/${encodeURIComponent(note_uid)}/files`, {q, mime, limit, offset}));
}

async function api_notes_put_file({note_uid, path, file, onProgress})
{
    const items = [{name: 'file', body: file}];
    return http_put_multipart(api_note_file_url(note_uid, path), items, {
        onUploadProgress: onProgress,
    });
}

async function api_notes_move_file({note_uid, path, destination})
{
    return http_patch_json(api_note_file_url(note_uid, path), {path: destination});
}

async function api_files_upload_start({filename, total_chunks, total_size})
{
    return http_post_json('/api/v1/files/upload/start', {filename, total_chunks, total_size});
}

async function api_files_upload_chunk({upload_id, chunk_index, chunk, onProgress})
{
    const items = [{name: 'chunk', body: chunk}];
    return http_post_multipart(`/api/v1/files/upload/${upload_id}/chunk/${chunk_index}`, items, {
        onUploadProgress: onProgress,
    });
}

async function api_files_upload_assemble({upload_id, note_uid, overwrite})
{
    return http_post_json(`/api/v1/files/upload/${upload_id}/assemble`, {note_uid, overwrite});
}

async function api_notes_remove_file({note_uid, filename})
{
    return http_delete(api_note_file_url(note_uid, filename));
}

function api_note_file_url(note_uid, path)
{
    const encoded_path = String(path).split('/').map(encodeURIComponent).join('/');
    return `/api/v1/notes/${encodeURIComponent(note_uid)}/files/${encoded_path}`;
}

async function api_jobs_list(filters)
{
    return http_get_json(urlmod('/api/v1/jobs', filters));
}

async function api_jobs_create({job_name, note_uid})
{
    return http_post_json(`/api/v1/jobs/${job_name}`, {note_uid});
}

async function api_jobs_confirm({job_uid})
{
    return http_post_json(`/api/v1/jobs/${job_uid}/confirm`, {});
}
