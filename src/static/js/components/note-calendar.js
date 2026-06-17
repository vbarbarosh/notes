let note_calendar_seq = 0;

app.component('note-calendar', {
    props: {
        value: {type: String, required: true},
    },
    data: function () {
        return {
            mask_id: `note-calendar-binding-${note_calendar_seq++}`,
        };
    },
    computed: {
        mask_url: function () {
            return `url(#${this.mask_id})`;
        },
        date: function () {
            const match = String(this.value || '').match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
            if (!match) {
                return null;
            }

            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            const date = new Date(Date.UTC(
                year,
                month - 1,
                day,
                Number(match[4]),
                Number(match[5]),
                Number(match[6])
            ));

            if (
                Number.isNaN(date.getTime()) ||
                date.getUTCFullYear() !== year ||
                date.getUTCMonth() !== month - 1 ||
                date.getUTCDate() !== day
            ) {
                return null;
            }

            const local_day = date.getDate();
            return {
                year: date.getFullYear(),
                day: local_day,
                suffix: this.ordinal_suffix(local_day),
                month: date.toLocaleString('en-US', {month: 'long'}),
            };
        },
        label: function () {
            if (!this.date) {
                return '';
            }
            return `${this.date.month} ${this.date.day}${this.date.suffix}, ${this.date.year}`;
        },
    },
    methods: {
        ordinal_suffix: function (value) {
            const mod100 = value % 100;
            if (mod100 >= 11 && mod100 <= 13) {
                return 'th';
            }
            switch (value % 10) {
            case 1:
                return 'st';
            case 2:
                return 'nd';
            case 3:
                return 'rd';
            default:
                return 'th';
            }
        },
    },
    template: `
        <svg v-if="date"
             v-bind:aria-label="label"
             v-bind:title="label"
             class="note-calendar"
             viewBox="0 0 132 130"
             role="img">
            <title>{{ label }}</title>
            <defs>
                <mask v-bind:id="mask_id">
                    <rect x="0" y="0" width="132" height="130" fill="#fff" />
                    <circle cx="26" cy="0" r="7" fill="#000" />
                    <circle cx="106" cy="0" r="7" fill="#000" />
                </mask>
            </defs>
            <g v-bind:mask="mask_url">
                <rect x="0" y="0" width="132" height="130" rx="10" fill="#e8eef3" />
                <path d="M10 0H122Q132 0 132 10V49H0V10Q0 0 10 0Z" fill="#dd2a4a" />
            </g>

            <text
                x="8"
                y="37"
                fill="#fff"
                font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                font-size="33"
                font-weight="500"
                letter-spacing="2">{{ date.year }}</text>

            <g fill="#ffc0bd">
                <circle cx="99" cy="25" r="3.6" />
                <circle cx="110" cy="25" r="3.6" />
                <circle cx="121" cy="25" r="3.6" />
                <circle cx="99" cy="36" r="3.6" />
                <circle cx="110" cy="36" r="3.6" />
                <circle cx="121" cy="36" r="3.6" />
            </g>

            <text
                x="66"
                y="100"
                fill="#05070b"
                text-anchor="middle"
                font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                font-weight="400"><tspan font-size="59">{{ date.day }}</tspan><tspan dx="2" font-size="22" font-weight="500" baseline-shift="super">{{ date.suffix }}</tspan></text>
            <text
                x="66"
                y="121"
                fill="#05070b"
                text-anchor="middle"
                font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                font-size="24"
                font-weight="500">{{ date.month }}</text>
        </svg>
    `,
});

css`
    :where(.note-calendar) {
        width: 64px;
        height: 64px;
    }
    .note-calendar {
        display: block;
        filter: drop-shadow(0 2px 3px rgba(36, 44, 72, 0.22));
    }
    @media (max-width: 520px) {
        :where(.note-calendar) {
            width: 52px;
        }
    }
`;
