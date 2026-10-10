app.component('notes-overview', {
    props: {
        notes: {type: Array, required: true},
        activeUid: {type: String, default: null}, // uid of active note (optional, for parent sync)
    },
    emits: ['select'],
    template: `
        <aside class="notes-overview">
            <div v-for="note in notes"
                v-bind:key="note.uid"
                v-bind:class="['overview-item', {active: note.uid === activeUid}]"
                v-on:click="$emit('select', note.uid)">
                <div class="overview-date">{{ formatDate(note.created_at || note.date) }}</div>
                <div class="overview-title">{{ note.name || truncate(note.display_body ?? note.body) || 'Untitled' }}</div>
                <div v-if="note.display_tags?.length" class="overview-tags">
                    <span v-for="tag in note.display_tags" v-bind:key="tag" class="overview-tag">{{ tag }}</span>
                </div>
            </div>
        </aside>
    `,
    watch: {
        activeUid: async function () {
            await this.$nextTick();
            const elem = this.$el.querySelector('.active');
            if (elem) {
                elem.scrollIntoView({behavior: 'smooth', block: 'center'});
            }
        },
    },
    methods: {
        truncate: function (body) {
            // Use first 32 chars of body as fallback name
            if (!body) {
                return '';
            }
            let txt = body.replace(/\s+/g, ' ').trim();
            return txt.length > 32 ? `${txt.slice(0, 32)}…` : txt;
        },
        formatDate: function (ts) {
            // Expects ISO or Date. Fallback to today.
            if (!ts) {
                return '';
            }
            const d = new Date(ts);
            return d.toISOString().slice(0, 10);
        }
    }
});

css`
    .notes-overview {
        position: fixed;
        top: 0; left: 0; bottom: 0;
        width: 230px;
        background: var(--color-surface);
        border-right: 1px solid var(--color-line-soft);
        overflow-y: auto;
        padding: 10px 0;
        z-index: 100;
        font-family: 'Inter', system-ui, sans-serif;
    }

    .overview-item {
        cursor: pointer;
        display: flex;
        flex-direction: column;
        justify-content: center;
        border-left: 3px solid transparent;
        margin: 2px 0;
        padding: 10px 14px 9px 18px;
        border-radius: 0;
        font-size: 15px;
        background: transparent;
        transition: background 0.13s, border-color 0.13s;
        position: relative;
    }

    .overview-item.active {
        background: var(--color-select);
        border-left-color: #2486fd;
        font-weight: 600;
        /* Remove border-radius and gradient! */
    }

    .overview-item:hover,
    .overview-item:focus {
        background: var(--color-select-soft);
        border-left-color: #81bfff;
    }

    .overview-item.active:hover {
        background: var(--color-select-strong);
        border-left-color: #1569ce;
    }

    .overview-date {
        font-size: 12px;
        color: var(--color-text-3);
        margin-bottom: 2px;
        letter-spacing: 0.04em;
    }

    .overview-title {
        font-size: 15px;
        color: var(--color-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 500;
        line-height: 1.15;
    }

    .overview-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 7px;
        min-height: 17px;
    }

    .overview-tag {
        display: inline-flex;
        align-items: center;
        max-width: 88px;
        padding: 2px 6px;
        border-radius: 999px;
        background: var(--color-surface-tint);
        color: var(--color-accent-text);
        font-size: 11px;
        font-weight: 600;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .overview-item.active .overview-tag {
        background: var(--color-select-strong);
        color: var(--color-select-ink);
    }

    @media (max-width: 700px) {
        .notes-overview {
            display: none;
        }
    }
`;
