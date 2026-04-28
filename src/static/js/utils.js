function waitcb(fn)
{
    return new Promise(function (resolve, reject) {
        fn(function (error, out) {
            error ? reject(error_from_json(error)) : resolve(out);
        });
    });
}

function wait_callback(fn)
{
    return new Promise(function (resolve, reject) {
        fn(function (error, out) {
            error ? reject(error_from_json(error)) : resolve(out);
        });
    });
}

function plural(n, singular, plural, zero, one)
{
    if (!n && typeof zero === 'string') {
        return zero;
    }
    if (n === 1 && typeof one === 'string') {
        return one;
    }
    return (n % 10 === 1 && n % 100 !== 11) ? singular.replaceAll('#', n) : plural.replaceAll('#', n);
}

function thumbnailer(url, params)
{
    if (window.location.origin === 'http://127.0.0.1:3000') {
        return urlmod('/thumbnailer', {u: url, ...params});
    }
    return url;
}

function css([val])
{
    const elem = document.createElement('STYLE');
    elem.innerHTML = val;
    const sm = document.querySelector('#smcss');
    sm.parentElement.insertBefore(elem, sm);
}

function html([val])
{
    document.write(val);
}

function vue_modal({template, value})
{
    let promise_shown = null;
    let promise_hidden = null;

    let promise_resolve;
    let promise_reject;
    let promise_destroyed_resolve;
    const promise = new Promise(function (resolve, reject) {
        promise_resolve = resolve;
        promise_reject = reject;
    });
    const promise_destroyed = new Promise(resolve => promise_destroyed_resolve = resolve);

    const app2 = Vue.createApp({
        template,
        provide: function () {
            return {modal: this};
        },
        data: function () {
            return {value};
        },
        methods: {
            hide: function () {
                if (promise_hidden) {
                    return this;
                }
                promise_shown = null;
                promise_hidden = new Promise(resolve => jQuery(this.$el).stop().fadeOut('fast', resolve));
                return this;
            },
            show: function () {
                if (promise_shown) {
                    return this;
                }
                promise_shown = new Promise(resolve => jQuery(this.$el).stop().fadeIn('fast', resolve));
                promise_hidden = null;
                autofocus(this.$el);
                return this;
            },
            show_if_pending: function () {
                return promise_resolve ? this.show() : undefined;
            },
            end: function (out) {
                // The only method which could be called several times.
                // Only the first call will be counted, though.
                if (!promise_resolve) {
                    return;
                }
                return this.return(out);
            },
            return: function (out) {
                return this.resolve(out);
            },
            return_if_exists: function (out) {
                if (promise_resolve) {
                    this.resolve(out);
                }
            },
            throw: function (error) {
                return this.reject(error);
            },
            resolve: function (out) {
                // This method should be called no more than one time
                promise_resolve(out);
                promise_resolve = null;
                promise_reject = null;
                jQuery(this.$el).fadeOut('fast', () => app2.unmount());
                return this;
            },
            reject: function (error) {
                // This method should be called no more than one time
                promise_reject(error);
                promise_reject = null;
                promise_resolve = null;
                jQuery(this.$el).fadeOut('fast', () => app2.unmount());
                return this;
            },
            promise: function () {
                return promise;
            },
            promise_destroyed: function () {
                return promise_destroyed;
            },
        },
        mounted: function () {
            // Case when a component calls `this.modal.hide()` from its `created` method.
            if (promise_hidden) {
                jQuery(this.$el).hide();
                return;
            }
            try {
                document.activeElement.blur();
            } catch (error) {
            }
            jQuery(this.$el).hide().fadeIn('fast', () => autofocus(this.$el));
        },
        unmounted: function () {
            jQuery(app2._container).remove();
            if (promise_resolve) {
                promise_resolve();
                promise_resolve = null;
                promise_reject = null;
            }
            promise_destroyed_resolve(promise);
            promise_destroyed_resolve = null;
        },
    });
    app._context.mixins.forEach(function (mixin) {
        app2.mixin(mixin);
    });
    Object.entries(app._context.components).forEach(function ([key, value]) {
        app2.component(key, value);
    });
    app2.config.errorHandler = app.config.errorHandler;
    app2.config.warnHandler = app.config.warnHandler;
    app2.config.productionTip = app.config.productionTip;
    return app2.mount(document.body.appendChild(document.createElement('DIV')));
}

function autofocus(parent)
{
    return jQuery(parent).addBack().find('[autofocus]a, [autofocus] a, [autofocus]button, [autofocus] button, [autofocus]input, [autofocus] input, [autofocus]textarea, [autofocus] textarea').filter(':visible').first().focus().select();
}

function m_blocking(fn)
{
    return function (...args) {
        return blocking(Promise.method(fn).apply(this, args));
    };
}

function m_modal_hide(fn)
{
    return function (...args) {
        this.modal.hide();
        return Promise.method(fn).apply(this, args).catch(error_handler).finally(this.modal.show_if_pending);
    };
}

/**
 * Hide modal while executing `fn`
 */
function m_modal_hide_nowarn(fn)
{
    return function (...args) {
        this.modal.hide();
        // http://bluebirdjs.com/docs/warning-explanations.html#warning-a-promise-was-created-in-a-handler-but-was-not-returned-from-it
        return Promise.method(fn).apply(this, args).return(null).finally(this.modal.show_if_pending);
    };
}

let blocking_status_counter = 0;
let blocking_counter = 0;
let blocking_modal = null;

function blocking(fn_or_promise)
{
    let status_uid;

    blocking_counter++;
    if (!blocking_modal) {
        blocking_modal = modal_blocking([]);
    }

    if (typeof fn_or_promise == 'function') {
        // Warning: a promise was created in a handler at http://127.0.0.1:3000/js/utils.js:155:34 but was not returned from it, see http://goo.gl/rRqMUw
        return Promise.method(fn_or_promise).call(null, status).then(v => v ?? null).finally(status_end).finally(blocking_end);
    }
    return Promise.resolve(fn_or_promise).finally(blocking_end);

    function status(message)
    {
        if (status_uid) {
            status_update(message);
        } else {
            status_begin(message);
        }
    }

    function status_begin(message)
    {
        status_uid = ++blocking_status_counter;
        blocking_modal.value.push({uid: status_uid, message});
    }

    function status_end()
    {
        const i = blocking_modal.value.findIndex(v => v.uid === status_uid);
        if (i !== -1) {
            blocking_modal.value.splice(i, 1);
        }
    }

    function status_update(message)
    {
        const item = blocking_modal.value.find(v => v.uid === status_uid);
        item.message = message;
    }
}

function blocking_end()
{
    if (--blocking_counter === 0) {
        // To be able to call `blocking` one after the other.
        // await blocking(api_xxx(placeholders));
        // await blocking(this.load_schedules());
        //
        // Wait for 250ms to eliminate flickering when one preloader
        // is closed and another, almost immediately, opened.
        setTimeout(function () {
            if (blocking_modal && blocking_counter === 0) {
                blocking_modal.end();
                blocking_modal = null;
            }
        }, 250);
    }
}


function urlmod(url, params)
{
    const tmp_url = new URL(url || '', 'xxx://___base___/');
    const tmp_search = tmp_url.searchParams;
    Object.entries(params || {}).forEach(function ([key, value]) {
        switch (value) {
        case null:
        case undefined:
            tmp_search.delete(key);
            break;
        case true:
            tmp_search.set(key, 1);
            break;
        case false:
            tmp_search.set(key, 0);
            break;
        default:
            tmp_search.set(key, value);
            break;
        }
    });
    if (url && url[0] === '/') {
        return tmp_url.toString().replace(/^xxx:\/\/___base___/, '');
    }
    return tmp_url.toString().replace(/^xxx:\/\/___base___\//, '');
}

function http_get_json(url, options)
{
    return axios.get(url, {responseType: 'json', ...options}).then(v => v.data);
}

function http_post_json(url, body, options)
{
    return axios.post(url, body, {responseType: 'json', ...options}).then(v => v.data);
}

function http_post_utf8(url, body, options)
{
    return axios.post(url, body, {responseType: 'text', ...options}).then(v => v.data);
}

function http_put_json(url, body, options)
{
    return axios.put(url, body, {responseType: 'json', ...options}).then(v => v.data);
}

function http_patch_json(url, body, options)
{
    return axios.patch(url, body, {responseType: 'json', ...options}).then(v => v.data);
}

function http_delete(url, options)
{
    return axios.delete(url, {responseType: 'text', ...options}).then(v => v.data);
}

// const items = [];
// items.push({name: 'from', body: MAILGUN_FROM});
// items.push({name: 'to', body: to});
// items.push({name: 'subject', body: subject});
// items.push({name: 'text', body: text});
// items.push({name: 'attachment', body: fs_read_stream(__filename), options: {filename: 'hello.txt'}});
// return http_post_multipart(`${MAILGUN_BASE}/messages`, items, options);
function http_post_multipart(url, items, options)
{
    const form = new FormData();
    for (let i = 0, end = items.length; i < end; ++i) {
        const item = items[i];
        // Without this, all string vales (ordinary fields) will
        // be empty in _Chrome 59.0.3071.86 (Official Build) (64-bit)_
        if (item.options) {
            form.append(item.name, item.body, item.options);
        }
        else {
            form.append(item.name, item.body);
        }
    }
    return axios.post(url, form, options).then(v => v.data);
}





function px(v)
{
    return v ? `${v}px` : '0';
}

function pc(v)
{
    return v ? `${v * 100}%` : '0';
}





function selrect(event, fn)
{
    const target = event.currentTarget;
    const s0 = target.getBoundingClientRect();
    const feedback = document.body.appendChild(document.createElement('DIV'));
    const r = {};
    feedback.setAttribute('class', 'fix yellow border o25 no-pointer-events');
    return new Promise(function (resolve) {
        dd({
            event,
            end: function () {
                feedback.remove();
                resolve();
            },
            update: function ({x, y, x0, y0}) {
                const s1 = target.getBoundingClientRect();
                const sx = s1.left - s0.left;
                const sy = s1.top - s0.top;
                r.x = r.left = Math.min(x, x0 + sx);
                r.y = r.top = Math.min(y, y0 + sy);
                r.w = r.width = Math.abs((x0 + sx) - x);
                r.h = r.height = Math.abs((y0 + sy) - y);
                r.right = r.left + r.width;
                r.bottom = r.top + r.height;
                feedback.style.top = px(r.top);
                feedback.style.left = px(r.left);
                feedback.style.width = px(r.width);
                feedback.style.height = px(r.height);
                fn(r);
            },
        });
    });
}

function is_rects_intersects(a, b)
{
    return a.top < b.bottom
        && b.top < a.bottom
        && a.left < b.right
        && b.left < a.right;
}

// https://stackoverflow.com/a/18157551
function rect_distance(x1, y1, x2, y2, px, py)
{
    var dx = Math.max(Math.min(x1, x2) - px, 0, px - Math.max(x1, x2));
    var dy = Math.max(Math.min(y1, y1) - py, 0, py - Math.max(y1, y2));
    return Math.sqrt(dx*dx + dy*dy);
}

function rects_closest(rects, x, y, r)
{
    let min = Number.MAX_VALUE;
    let out = -1;
    const rr = r*r;
    for (let i = 0, end = rects.length; i < end; ++i) {
        const rect = rects[i];
        const dd = rect_distance(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h, x, y);
        if (min > dd && dd <= rr) {
            min = dd;
            out = i;
        }
    }
    return out;
}





function format_bytes(bytes)
{
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
        return 'n/a';
    }
    if (!bytes) {
        return '0KB';
    }
    if (bytes < 1024) {
        return '1KB';
    }
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
    return `${(bytes / (1024 ** i)).toFixed(bytes > 1024*1024 ? 2 : 0)}${sizes[i]}`.replace(/\.00/, '.0');
}

function format_date(d)
{
    return d.getFullYear() + `/0${d.getMonth()+1}/0${d.getDate()} 0${d.getHours()}:0${d.getMinutes()}:0${d.getSeconds()}`.replace(/0(\d\d)/g, '$1');
}

// https://stackoverflow.com/a/2901298
function format_thousands(x)
{
    return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',');
}





/**
 * Convert an array of items into a hash map
 *
 * @param items
 * @param fn
 * @returns {{}}
 * @link https://stackoverflow.com/questions/26264956/convert-object-array-to-hash-map-indexed-by-an-attribute-value-of-the-object
 */
function array_index(items, fn)
{
    return Object.fromEntries(items.map(v => [fn(v), v]));
}

async function get_event_files(event, options = {})
{
    const limit = options.limit ?? Number.MAX_SAFE_INTEGER;
    if (!event.dataTransfer) {
        return Array.from(event.target.files).slice(0, limit).map(function (file) {
            file.fullPath ??= '/' + (file.webkitRelativePath ?? file.name);
            return file;
        });
    }
    const out = [];
    const buf = Array.from(event.dataTransfer.items).map(v => v.webkitGetAsEntry()).filter(Boolean);
    while (buf.length) {
        const entry = buf.pop();
        if (entry.isFile) {
            const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
            file.fullPath = entry.fullPath;
            out.push(file);
            if (out.length >= limit) {
                break;
            }
        }
        else if (entry.isDirectory) {
            buf.push(...await new Promise((resolve, reject) => entry.createReader().readEntries(resolve, reject)));
        }
    }
    return out;
}
