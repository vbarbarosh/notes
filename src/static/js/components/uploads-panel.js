// Global upload queue + floating progress panel. Any page or component calls
// do_upload_file(note_uid, file); the panel shows itself while uploads run.

const uploads_list = Vue.reactive([]);
let uploads_uid_seq = 0;

const CHUNKED_UPLOAD_THRESHOLD = 50 * 1024 * 1024; // 50 MB
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB per chunk

async function do_upload_file(note_uid, file)
{
    const uid = ++uploads_uid_seq;
    const name = file.name || String(file.fullPath || '').split('/').filter(Boolean).pop() || 'file';
    uploads_list.push({uid, name, progress: 0});
    try {
        if (file.size > CHUNKED_UPLOAD_THRESHOLD) {
            await do_upload_file_chunked(note_uid, file, uid);
        }
        else {
            await api_notes_upload_file({
                note_uid,
                file,
                onProgress: function (event) {
                    const item = uploads_list.find(u => u.uid === uid);
                    if (item && event.total) {
                        item.progress = Math.round(event.loaded / event.total * 100);
                    }
                },
            });
        }
    }
    finally {
        const i = uploads_list.findIndex(u => u.uid === uid);
        if (i !== -1) {
            uploads_list.splice(i, 1);
        }
    }
}

async function do_upload_file_chunked(note_uid, file, uid)
{
    const total_chunks = Math.ceil(file.size / CHUNK_SIZE);
    const filename = file.name || String(file.fullPath || '').split('/').filter(Boolean).pop() || 'file';

    const { upload_id } = await api_files_upload_start({ filename, total_chunks, total_size: file.size });

    for (let i = 0; i < total_chunks; i++) {
        const start = i * CHUNK_SIZE;
        const chunk = file.slice(start, start + CHUNK_SIZE);
        await api_files_upload_chunk({
            upload_id,
            chunk_index: i,
            chunk,
            onProgress: function (event) {
                const item = uploads_list.find(u => u.uid === uid);
                if (item && event.total) {
                    item.progress = Math.round((i + event.loaded / event.total) / total_chunks * 100);
                }
            },
        });
    }

    return api_files_upload_assemble({ upload_id, note_uid });
}

app.component('uploads-panel', {
    template: `
        <div v-if="uploads.length" class="upload-progress-panel">
            <div class="upload-progress-title">Uploading {{ uploads.length }} file{{ uploads.length !== 1 ? 's' : '' }}</div>
            <div v-for="upload in uploads" v-bind:key="upload.uid" class="upload-progress-item">
                <div class="upload-progress-name" v-bind:title="upload.name">{{ upload.name }}</div>
                <div class="upload-progress-bar-wrap">
                    <div class="upload-progress-bar" v-bind:style="{width: upload.progress + '%'}"></div>
                </div>
                <div class="upload-progress-pct">{{ upload.progress }}%</div>
            </div>
        </div>
    `,
    data: function () {
        return {uploads: uploads_list};
    },
});

css`
    .upload-progress-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #fff;
        border: 1px solid #c7cde2;
        border-radius: 10px;
        padding: 12px 16px;
        min-width: 280px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        z-index: 1000;
    }
    .upload-progress-title { font-weight: 600; margin-bottom: 8px; font-size: 13px; color: #555; }
    .upload-progress-item { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
    .upload-progress-item:last-child { margin-bottom: 0; }
    .upload-progress-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
    .upload-progress-bar-wrap { width: 90px; height: 5px; background: #e3e6ee; border-radius: 3px; flex-shrink: 0; }
    .upload-progress-bar { height: 100%; background: #2486fd; border-radius: 3px; transition: width 0.1s linear; }
    .upload-progress-pct { width: 34px; text-align: right; font-size: 12px; color: #888; flex-shrink: 0; }
`;
