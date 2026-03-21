// Attach files immediately, patch body later, reset everything only after both are done.

app.component('notes-new', {
    emits: ['refresh'],
    template: `
        <div class="notes-new-bar">
            <textarea
                v-model="new_body"
                v-autosize
                rows="1"
                placeholder="Write your note here..."
                @keydown.enter.exact.prevent="submit"
                @paste="paste"
                ref="textarea"
                class="notes-new-bar-input" />
            <button
                class="notes-new-bar-attach"
                @click="openFileDialog"
                :title="'Attach files'"
                type="button"
            >📎</button>
            <input
                type="file"
                multiple
                hidden
                ref="fileInput"
                @change="onFileSelect"
            >
            <button
                class="notes-new-bar-submit"
                :disabled="!canSubmit"
                @click="submit"
                title="Save note"
                type="button"
            >➤</button>
        </div>
        <div v-if="attachedFiles.length" class="notes-new-bar-files">
            <div v-for="file in attachedFiles" :key="file.path" class="notes-new-bar-file">
                <span class="file-icon">📎</span> {{ file.path }}
                <button @click.stop="removeFile(file)" title="Remove" class="notes-new-bar-file-remove">✖️</button>
            </div>
        </div>
    `,
    data() {
        return {
            new_body: "",
            note_uid: null,
            attachedFiles: [],
        }
    },
    computed: {
        canSubmit() {
            return !!this.new_body.trim() || this.attachedFiles.length;
        }
    },
    methods: {
        async ensureNote() {
            if (this.note_uid) return this.note_uid;
            const note = await api_notes_create({ body: "" });
            this.note_uid = note.uid;
            return this.note_uid;
        },
        openFileDialog() {
            this.$refs.fileInput.click();
        },
        async onFileSelect(e) {
            const files = Array.from(e.target.files);
            await this.attachFiles(files);
        },
        async attachFiles(files) {
            const note_uid = await this.ensureNote();
            for (const file of files) {
                await api_notes_upload_file({ note_uid, file });
            }
            const freshNote = await api_notes_fetch(note_uid);
            this.attachedFiles = freshNote.files || [];
            this.$refs.textarea.focus();
        },
        async removeFile(file) {
            if (!this.note_uid) return;
            await api_notes_remove_file({ note_uid: this.note_uid, filename: file.path });
            const freshNote = await api_notes_fetch(this.note_uid);
            this.attachedFiles = freshNote.files || [];
        },
        async submit() {
            if (!this.canSubmit) return;
            if (this.note_uid) {
                await api_notes_update({ note_uid: this.note_uid, body: this.new_body });
            } else {
                await api_notes_create({ body: this.new_body });
            }
            this.resetAll();
            this.$emit("refresh");
        },
        async paste(e) {
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            const files = [];
            for (let i = 0; i < items.length; ++i) {
                const item = items[i];
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
            if (files.length) {
                await this.attachFiles(files);
            }
        },
        resetAll() {
            this.note_uid = null;
            this.new_body = "";
            this.attachedFiles = [];
        }
    }
});


css`
    .notes-new-bar {
        display: flex;
        align-items: center;
        gap: 9px;
        background: #f8f9fd;
        border-radius: 8px;
        border: 1.5px solid #c7cde2;
        box-shadow: 0 2px 10px #bbb3;
        padding: 0 14px 0 14px;
        min-height: 48px;
        max-width: 680px;
        margin: 30px auto 30px;
        position: relative;
    }

    .notes-new-bar:has(textarea:focus) {
        position: sticky;
        top: 30px;
        box-shadow: 0 4px 18px #abb9ee6e;
        border-color: #9da9db;
    }

    .notes-new-bar-input {
        margin: 0;
        flex: 1 1 auto;
        background: transparent;
        border: none;
        outline: none;
        font-size: 1.07rem;
        color: #2b2f3a;
        min-height: 38px;
        max-height: 180px;
        padding: 12px 0;
        resize: none;
        font-family: inherit;
        overflow-y: auto;
    }

    .notes-new-bar-input::placeholder {
        color: #b6b7c9;
        opacity: 1;
    }

    .notes-new-bar-attach {
        background: none;
        border: none;
        font-size: 1.28em;
        color: #a3acc8;
        cursor: pointer;
        margin: 0 2px;
        padding: 3px 4px;
        border-radius: 4px;
        transition: background 0.14s, color 0.13s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .notes-new-bar-attach:hover,
    .notes-new-bar-attach:focus {
        background: #e6ebff;
        color: #5370e7;
    }

    .notes-new-bar-submit {
        background: #6376f1;
        border: none;
        border-radius: 6px;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 1.3em;
        margin-left: 3px;
        cursor: pointer;
        box-shadow: 0 2px 6px #bfc2db22;
        transition: background 0.16s, box-shadow 0.14s;
    }

    .notes-new-bar-submit:disabled {
        background: #dde2f3;
        color: #a0aacb;
        cursor: not-allowed;
        box-shadow: none;
    }

    .notes-new-bar-submit:hover:enabled {
        background: #384b92;
    }

    .notes-new-bar-files {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        max-width: 680px;
        margin: 8px auto 0;
        margin-top: -20px;
        margin-bottom: 30px;
    }

    .notes-new-bar-file {
        display: flex;
        align-items: center;
        padding: 4px 10px 4px 6px;
        border-radius: 6px;
        background: #e7f0ff;
        color: #27336a;
        font-size: 0.98em;
        box-shadow: 0 1px 5px #bfc2db22;
        gap: 7px;
        border: 1px solid #c7cde2;
    }

    .notes-new-bar-file .file-icon {
        font-size: 1.1em;
        margin-right: 2px;
    }

    .notes-new-bar-file-remove {
        background: none;
        border: none;
        color: #b21b3a;
        font-size: 1.1em;
        margin-left: 5px;
        cursor: pointer;
        transition: color 0.13s;
        padding: 0;
        border-radius: 3px;
    }

    .notes-new-bar-file-remove:hover {
        color: #e02543;
    }

`;
