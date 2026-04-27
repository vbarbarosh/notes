app.component('notes-overview', {
    props: {
        notes: { type: Array, required: true },
        activeUid: { type: String, default: null }, // uid of active note (optional, for parent sync)
    },
    emits: ['select'],
    template: `
        <aside class="notes-overview">
            <div v-for="note in notes"
                :key="note.uid"
                :class="['overview-item', {active: note.uid === activeUid}]"
                @click="$emit('select', note.uid)">
                <div class="overview-date">{{ formatDate(note.created_at || note.date) }}</div>
                <div class="overview-title">{{ note.name || truncate(note.body) }}</div>
            </div>
        </aside>
    `,
    watch: {
        activeUid: async function () {
            await this.$nextTick();
            const elem = this.$el.querySelector('.active');
            if (elem) {
                elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        },
    },
    methods: {
        truncate(body) {
            // Use first 32 chars of body as fallback name
            if (!body) return '';
            let txt = body.replace(/\s+/g, ' ').trim();
            return txt.length > 32 ? txt.slice(0, 32) + '…' : txt;
        },
        formatDate(ts) {
            // Expects ISO or Date. Fallback to today.
            if (!ts) return '';
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
        background: #f6f6f9;
        border-right: 1px solid #e0e0e0;
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
        background: #e5eeff;
        border-left-color: #2486fd;
        font-weight: 600;
        /* Remove border-radius and gradient! */
    }

    .overview-item:hover,
    .overview-item:focus {
        background: #f0f7ff;
        border-left-color: #81bfff;
    }

    .overview-item.active:hover {
        background: #d3e6ff;
        border-left-color: #1569ce;
    }

    .overview-date {
        font-size: 12px;
        color: #aaa;
        margin-bottom: 2px;
        letter-spacing: 0.04em;
    }

    .overview-title {
        font-size: 15px;
        color: #252525;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 500;
        line-height: 1.15;
    }

    @media (max-width: 700px) {
        .notes-overview {
            position: sticky;
            top: 0;
            left: auto;
            right: auto;
            bottom: auto;
            width: auto;
            display: flex;
            gap: 6px;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 6px;
            border-right: 0;
            border-bottom: 1px solid #e0e0e0;
        }

        .overview-item {
            flex: 0 0 142px;
            min-height: 48px;
            margin: 0;
            padding: 7px 9px;
            border-left: 0;
            border-bottom: 3px solid transparent;
            background: #fff;
        }

        .overview-item.active,
        .overview-item:hover,
        .overview-item:focus,
        .overview-item.active:hover {
            border-left-color: transparent;
        }

        .overview-item.active {
            border-bottom-color: #2486fd;
        }

        .overview-item:hover,
        .overview-item:focus {
            border-bottom-color: #81bfff;
        }

        .overview-item.active:hover {
            border-bottom-color: #1569ce;
        }
    }
`;
