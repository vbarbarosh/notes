// Two buttons beside the note under the middle of the window: ↓ jumps to the
// end of that note, ↑ back to its start. Each shows only while the note runs
// more than half a window past that edge.
const NOTE_JUMP_REACH = 0.5;
// Where a jump leaves the note's edge: its end this far above the window's
// bottom, its start this far below the top panel.
const NOTE_JUMP_MARGIN = 80;
const NOTE_JUMP_TOP_MARGIN = 16;

app.component('note-jump', {
    template: `
        <div class="note-jump" v-bind:style="{left: left + 'px'}">
            <button
                type="button"
                v-bind:class="['note-jump-button', {shown: up}]"
                v-bind:tabindex="(up ? 0 : -1)"
                v-on:click="click_up"
                title="Start of this note">
                <i class="ti ti-arrow-bar-to-up" aria-hidden="true"></i>
            </button>
            <button
                type="button"
                v-bind:class="['note-jump-button', {shown: down}]"
                v-bind:tabindex="(down ? 0 : -1)"
                v-on:click="click_down"
                title="End of this note">
                <i class="ti ti-arrow-bar-to-down" aria-hidden="true"></i>
            </button>
        </div>
    `,
    data: function () {
        return {
            up: false,
            down: false,
            left: 0,
        };
    },
    methods: {
        schedule_update: function () {
            if (!this.frame) {
                this.frame = requestAnimationFrame(this.update);
            }
        },
        update: function () {
            this.frame = null;
            this.card = this.find_card();
            if (!this.card) {
                this.up = false;
                this.down = false;
                return;
            }
            const rect = this.card.getBoundingClientRect();
            const reach = window.innerHeight*NOTE_JUMP_REACH;
            this.up = (-rect.top > reach);
            this.down = (rect.bottom - window.innerHeight > reach);
            // In the gap right of the note; inside its right edge when the
            // window has no room for the gap.
            this.left = (rect.right + 58 < window.innerWidth) ? rect.right + 12 : rect.right - 52;
        },
        // The note under the middle of the window, or just above or below it
        // when the middle falls into the gap between two notes.
        find_card: function () {
            const first = document.querySelector('.note-card');
            if (!first) {
                return null;
            }
            const rect = first.getBoundingClientRect();
            const x = rect.left + rect.width/2;
            const y = window.innerHeight/2;
            for (const dy of [0, -30, 30]) {
                const card = document.elementFromPoint(x, y + dy)?.closest('.note-card');
                if (card) {
                    return card;
                }
            }
            return null;
        },
        click_down: function () {
            this.jump(v => v.bottom - window.innerHeight + NOTE_JUMP_MARGIN);
        },
        click_up: function () {
            // Scrolling up brings the top panel back, so the start lands below it.
            const head = document.querySelector('.sticky-head');
            const head_height = head ? head.getBoundingClientRect().height : 0;
            this.jump(v => v.top - head_height - NOTE_JUMP_TOP_MARGIN);
        },
        // Parts of a note far from the window are not laid out and count at an
        // estimated height. Lay out the whole note first, so the jump lands
        // where the note really ends.
        jump: function (fn) {
            const card = this.card;
            if (!card) {
                return;
            }
            card.classList.add('note-jump-measure');
            window.addEventListener('scrollend', function () {
                card.classList.remove('note-jump-measure');
            }, {once: true});
            window.scrollBy({top: fn(card.getBoundingClientRect()), behavior: 'smooth'});
        },
    },
    created: function () {
        this.frame = null;
        this.card = null;
    },
    mounted: function () {
        window.addEventListener('scroll', this.schedule_update, {passive: true});
        window.addEventListener('resize', this.schedule_update, {passive: true});
        this.update();
    },
    unmounted: function () {
        window.removeEventListener('scroll', this.schedule_update);
        window.removeEventListener('resize', this.schedule_update);
        cancelAnimationFrame(this.frame);
    },
});

css`
    .note-jump {
        position: fixed;
        top: 50%;
        z-index: 60;
        display: flex;
        flex-direction: column;
        gap: 8px;
        transform: translateY(-50%);
        pointer-events: none;
    }

    .note-jump-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: 1px solid #c7cde2;
        border-radius: 50%;
        background: #f7f8fb;
        box-shadow: 0 2px 10px #bbb3;
        color: #636b8f;
        font-size: 20px;
        opacity: 0;
        transform: scale(0.8);
        transition: opacity 0.18s ease, transform 0.18s ease, background 0.14s, color 0.14s, border-color 0.14s;
    }

    .note-jump-button.shown {
        opacity: 1;
        transform: none;
        pointer-events: auto;
    }

    .note-jump-button:hover {
        background: #fff;
        border-color: #9da9db;
        color: #3b4273;
    }

    .note-card.note-jump-measure .markdown,
    .note-card.note-jump-measure .note-images,
    .note-card.note-jump-measure .note-files {
        content-visibility: visible;
    }
`;
