app.component('note-card', {
    props: {
        note: { type: Object, required: true },
        jobs: { type: Array, default: () => [] },
        activeUid: { type: String, default: null },
        editing: { type: Object, default: null }, // note being edited (owned by parent)
        selectedTags: { type: Array, default: () => [] },
        excludedTags: { type: Array, default: () => [] },
        hoveredNoteUid: { type: String, default: null },
        hoveredFilePath: { type: String, default: null },
        playingYoutubeId: { type: String, default: null },
    },
    emits: [
        'activate',
        'deactivate',
        'toggle-tag',
        'play-youtube',
        'open-terminal',
        'refresh-jobs',
        'edit',
        'edit-save',
        'edit-cancel',
        'remove',
        'remove-file',
        'hover-file',
        'uploaded',
    ],
    template: `
        <div v-on:paste="paste_note"
             v-on:mouseover="$emit('activate', note)"
             v-on:mouseleave="$emit('deactivate', note)"
             v-on:dragenter="dragenter_note"
             v-on:dragover="dragover_note"
             v-on:dragleave="dragleave_note"
             v-on:drop="drop_note"
             v-bind:class="{dropping: dropping, active: (activeUid === note.uid)}"
             class="note-card">
            <h2 class="rel flex-row-center gap5">
                <note-calendar v-bind:value="note.uid" v-bind:data-u="note.uid" class="abs w64 h64" style="top:-32px;left:-96px;" />
                <a v-bind:href="note.prefix" class="note-date" title="Open this note">{{ format_note_uid_date(note.uid) }}</a>
                <span v-if="note_header_has_buttons" class="note-header-separator">•</span>
                <span v-if="note.name" class="note-name">{{ note.name }}</span>
                <button
                    v-if="note.youtube_items.length"
                    v-on:click.stop="$emit('play-youtube', note, note.youtube_items[0])"
                    class="note-play-button"
                    title="Play YouTube">
                    ▶️
                </button>
                <button
                    v-if="note.youtube_items.length"
                    v-on:click.stop="click_youtube_thumbnails"
                    v-bind:disabled="!!note_active_job('youtube-thumbnails')"
                    title="Extract YouTube thumbnails">
                    🖼️
                </button>
                <button
                    v-if="note.youtube_items.length"
                    v-on:click.stop="click_youtube_mp3"
                    v-bind:disabled="!!note_active_job('youtube-mp3')"
                    title="Extract YouTube MP3">
                    🎵
                </button>
                <button
                    v-on:click.stop="click_terminal"
                    title="Open a terminal in this note">
                    🖥️
                </button>
                <a
                    v-if="note_has_pdf"
                    v-bind:href="'/pdf.html?note=' + note.uid"
                    target="_blank"
                    class="note-pdf-link">PDF</a>
                <a
                    v-bind:href="'/demo-browser.html?note=' + note.uid"
                    target="_blank"
                    class="note-app-link">FILES</a>
                <button v-on:click="click_h2_copy" class="mla">📋️</button>
                <button v-on:click="click_h2_paste">📥</button>
                <button v-on:click="$emit('edit', note)">✏️</button>
                <button v-on:click="$emit('remove', note)">🗑️</button>
            </h2>

            <div v-if="note_jobs.length" class="job-list">
                <div v-for="job in note_jobs" v-bind:key="job.uid" class="job-row">
                    <span v-bind:class="['job-status', job.bucket]">{{ job_label(job) }}</span>
                    <button
                        v-if="(job.job_kind === 'terminal' && job.bucket === 'active')"
                        v-on:click="$emit('open-terminal', job)"
                        type="button"
                        title="Open terminal">
                        Open
                    </button>
                    <button
                        v-if="job.bucket === 'finished' || job.bucket === 'failed'"
                        type="button"
                        v-on:click="click_job_confirm(job)"
                        title="Confirm job">
                        OK
                    </button>
                </div>
            </div>

            <div v-if="note.display_tags.length" class="note-tags">
                <button
                    v-for="tag in note.display_tags"
                    v-bind:key="tag"
                    type="button"
                    v-on:click.stop="$emit('toggle-tag', tag)"
                    v-bind:class="['note-tag', {active: selectedTags.includes(tag), excluded: excludedTags.includes(tag)}]"
                    v-bind:title="tag">
                    {{ tag }}
                </button>
            </div>

            <div v-if="editing?.uid === note.uid" class="mb20">
                <textarea v-autosize v-autofocus v-model="editing.body" class="note-input-card-textarea"></textarea>
                <div class="flex-row gap10 mt5">
                    <button v-on:click="$emit('edit-save')">💾 Save</button>
                    <button v-on:click="$emit('edit-cancel')">🚫 Cancel</button>
                </div>
            </div>
            <markdown v-else-if="note.display_body" v-bind:value="note.display_body" v-bind:prefix="note.prefix" />

            <div v-if="note.youtube_items.length > 1" class="youtube-links">
                <button
                    v-for="item in note.youtube_items"
                    v-bind:key="item.id"
                    type="button"
                    v-on:click="$emit('play-youtube', note, item)"
                    v-bind:class="['youtube-link', {active: playingYoutubeId === item.id}]">
                    ▶ {{ item.label }}
                </button>
            </div>

            <fancybox>
                <div class="note-images">
                    <a
                        v-for="file in note.files.filter(v => v.thumbnail_url)"
                        v-bind:key="note.uid + ':' + file.path"
                        v-bind:href="(file.url)"
                        v-bind:class="{highlight: is_file_hovered(file)}"
                        target="_blank">
                        <img
                            v-on:mouseover="mouseover_file(file)"
                            v-on:mouseleave="mouseleave_file(file)"
                            v-bind:src="file.thumbnail_url"
                            v-bind:class="{highlight: is_file_hovered(file)}"
                            alt=""
                            loading="lazy"
                            decoding="async"
                            class="flex-static max-ww checkerboard">
                    </a>
                </div>
            </fancybox>

            <div v-bind:class="['note-files', {empty: !note.files.length}]">
                <div class="note-files-toolbar">
                    <div class="note-files-toolbar-left">
                        <div class="note-files-folder">
                            <i class="ti ti-folder" aria-hidden="true"></i>
                        </div>
                        <div class="note-files-meta">
                            <div class="note-files-title">{{ note.files.length ? 'Files' : 'No files' }}</div>
                            <div v-if="note.files.length" class="note-files-summary">{{ note_file_summary }}</div>
                        </div>
                    </div>
                    <div class="note-files-tools">
                        <label v-if="note.files.length" class="note-files-search">
                            <i class="ti ti-search" aria-hidden="true"></i>
                            <input
                                type="search"
                                v-model="file_query"
                                placeholder="Search files">
                        </label>
                        <label class="note-files-upload">
                            <i class="ti ti-upload" aria-hidden="true"></i>
                            Upload
                            <input
                                type="file"
                                multiple
                                v-on:change="change_note_files">
                        </label>
                    </div>
                </div>
                <div v-if="note.files.length" class="note-files-row note-files-head">
                    <div class="note-files-name">Name <i class="ti ti-arrows-sort" aria-hidden="true"></i></div>
                    <div class="note-files-size">Size</div>
                    <div class="note-files-actions">Actions</div>
                </div>
                <template v-if="note.files.length">
                    <div v-for="file in filtered_note_files"
                        v-bind:key="note.uid + ':' + file.path"
                        v-bind:data-file-path="file.path"
                        v-on:mouseover="mouseover_file(file)"
                        v-on:mouseleave="mouseleave_file(file)"
                        v-bind:class="['note-files-row', 'note-files-body', {'system-file': is_system_file(file), highlight: is_file_hovered(file)}]">
                        <div class="note-file-name-cell">
                            <div v-bind:class="['note-file-icon', file_type(file)]">
                                <i v-bind:class="['ti', file_icon_class(file)]" aria-hidden="true"></i>
                            </div>
                            <div class="note-file-main">
                                <span class="note-file-name">{{ file.path }}</span>
                                <div v-if="file.details && file.mime.startsWith('image/')" class="note-file-media-meta">{{ image_file_summary(file) }}</div>
                                <div v-if="file.details && file.mime.startsWith('audio/')" class="note-file-audio-meta">{{ audio_file_summary(file) }}</div>
                                <div v-if="file.details && file.mime.startsWith('video/')" class="note-file-media-meta">{{ video_file_summary(file) }}</div>
                            </div>
                        </div>
                        <div class="note-file-size">{{ format_bytes(file.size) }}</div>
                        <div class="note-file-actions">
                            <button
                                type="button"
                                class="note-file-button open"
                                v-on:click="click_file_save(file)"
                                v-bind:aria-label="'Open ' + file.path + ' in new tab'"
                                title="Open in new tab">
                                <i class="ti ti-external-link" aria-hidden="true"></i>
                            </button>
                            <button
                                type="button"
                                class="note-file-button delete"
                                v-on:click="$emit('remove-file', note, file)"
                                v-bind:aria-label="'Delete ' + file.path"
                                title="Delete">
                                <i class="ti ti-trash" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>
                </template>
                <div v-if="note.files.length && !filtered_note_files.length" class="note-files-empty">
                    No matching files
                </div>
            </div>
        </div>
    `,
    data: function () {
        return {
            dropping: false,
            drag_depth: 0,
            file_query: '',
        };
    },
    computed: {
        note_jobs: function () {
            return this.jobs.filter(job => job.note_uid === this.note.uid || String(job.note_uid || '').startsWith(this.note.uid + '-'));
        },
        note_has_pdf: function () {
            return this.note.files.some(f => f.path.toLowerCase().endsWith('.pdf'));
        },
        note_header_has_buttons: function () {
            // The terminal button is always shown, so the header always has buttons.
            return true;
        },
        filtered_note_files: function () {
            const query = this.file_query.trim().toLowerCase();
            if (!query) {
                return this.note.files;
            }
            return this.note.files.filter(file => String(file.path || '').toLowerCase().includes(query));
        },
        note_file_summary: function () {
            const files = this.filtered_note_files;
            const total_size = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
            const filtered_count = this.file_query.trim() ? ` of ${this.note.files.length}` : '';
            return `${files.length}${filtered_count} file${files.length === 1 ? '' : 's'} · ${format_bytes(total_size)} total`;
        },
    },
    methods: {
        note_active_job: function (job_name) {
            return this.note_jobs.find(job => job.job_name === job_name && job.bucket === 'active');
        },
        job_label: function (job) {
            return [
                job.job_name,
                job.user_friendly_status || job.status,
                job.bucket,
            ].filter(Boolean).join(' · ');
        },
        format_note_uid_date: function (uid) {
            const match = String(uid || '').match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
            if (!match) {
                return uid;
            }
            const date = new Date(Date.UTC(
                Number(match[1]),
                Number(match[2]) - 1,
                Number(match[3]),
                Number(match[4]),
                Number(match[5]),
                Number(match[6])
            ));
            if (Number.isNaN(date.getTime())) {
                return uid;
            }
            const pad = value => String(value).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        },
        is_system_file: function (file) {
            return String(file.path || '').toLowerCase().startsWith('apps/');
        },
        file_type: function (file) {
            const path = String(file.path || '').toLowerCase();
            if (path.endsWith('.pdf')) {
                return 'pdf';
            }
            if (path.endsWith('.epub')) {
                return 'epub';
            }
            if (path.endsWith('.zip')) {
                return 'zip';
            }
            if (is_audio_file(file)) {
                return 'audio';
            }
            if (is_video_file(file)) {
                return 'video';
            }
            if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.gif') || path.endsWith('.webp') || path.endsWith('.svg')) {
                return 'image';
            }
            if (path.endsWith('.json')) {
                return 'json';
            }
            return 'file';
        },
        file_icon_class: function (file) {
            return {
                pdf: 'ti-file-type-pdf',
                epub: 'ti-book-2',
                zip: 'ti-file-zip',
                audio: 'ti-music',
                video: 'ti-movie',
                image: 'ti-photo',
                json: 'ti-code',
                file: 'ti-file',
            }[this.file_type(file)];
        },
        is_file_hovered: function (file) {
            return this.hoveredNoteUid === this.note.uid && this.hoveredFilePath === file.path;
        },
        mouseover_file: function (file) {
            this.$emit('hover-file', this.note.uid, file.path);
        },
        mouseleave_file: function (file) {
            if (this.is_file_hovered(file)) {
                this.$emit('hover-file', null, null);
            }
        },
        click_h2_copy: async function (event) {
            const elem = event.currentTarget;
            await navigator.clipboard.writeText(this.note.body);
            elem.classList.add('copied');
            await Promise.delay(900);
            elem.classList.remove('copied');
        },
        click_h2_paste: async function () {
            const note_uid = this.note.uid;
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const blob = await item.getType('image/png');
                await do_upload_file(note_uid, new File([blob], 'image.png'));
            }
            this.$emit('uploaded', this.note);
        },
        click_terminal: async function () {
            const job = await api_jobs_create({job_name: 'terminal', note_uid: this.note.uid});
            this.$emit('open-terminal', job);
            this.$emit('refresh-jobs');
        },
        click_youtube_thumbnails: async function () {
            await api_jobs_create({job_name: 'youtube-thumbnails', note_uid: this.note.uid});
            this.$emit('refresh-jobs');
        },
        click_youtube_mp3: async function () {
            await api_jobs_create({job_name: 'youtube-mp3', note_uid: this.note.uid});
            this.$emit('refresh-jobs');
        },
        click_job_confirm: async function (job) {
            await api_jobs_confirm({job_uid: job.uid});
            this.$emit('refresh-jobs');
        },
        click_file_save: function (file) {
            window.open(file.url, '_blank');
        },
        change_note_files: async function (event) {
            const files = await get_event_files(event);
            event.target.value = '';
            if (!files.length) {
                return;
            }
            await Promise.all(files.map(file => do_upload_file(this.note.uid, file)));
            this.$emit('uploaded', this.note);
        },
        paste_note: async function (event) {
            const items = event.clipboardData && event.clipboardData.items;
            if (!items) {
                return;
            }
            let uploaded = false;
            for (let i = 0; i < items.length; ++i) {
                const item = items[i];
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) {
                        await do_upload_file(this.note.uid, file);
                        uploaded = true;
                    }
                }
            }
            if (uploaded) {
                this.$emit('uploaded', this.note);
            }
        },
        dragenter_note: function (event) {
            event.preventDefault();
            this.drag_depth++;
            this.dropping = true;
        },
        dragover_note: function (event) {
            event.preventDefault();
        },
        dragleave_note: function (event) {
            this.drag_depth = Math.max(0, this.drag_depth - 1);
            if (!this.drag_depth) {
                this.dropping = false;
            }
        },
        drop_note: async function (event) {
            event.preventDefault();
            this.drag_depth = 0;
            this.dropping = false;
            const files = await get_event_files(event);
            if (files.length) {
                await Promise.all(files.map(file => do_upload_file(this.note.uid, file)));
                this.$emit('uploaded', this.note);
            }
        },
    },
});
