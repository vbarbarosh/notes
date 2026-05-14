const Promise = require('bluebird');
const cache_api_notes_invalidate = require('../helpers/cache_api_notes_invalidate');
const child_process = require('child_process');
const fs = require('fs');
const fs_exists = require('@vbarbarosh/node-helpers/src/fs_exists');
const fs_mkdirp = require('@vbarbarosh/node-helpers/src/fs_mkdirp');
const fs_path_resolve = require('@vbarbarosh/node-helpers/src/fs_path_resolve');
const fs_read_utf8 = require('@vbarbarosh/node-helpers/src/fs_read_utf8');
const fs_readdir = require('@vbarbarosh/node-helpers/src/fs_readdir');
const fs_rename = require('@vbarbarosh/node-helpers/src/fs_rename');
const fs_write = require('@vbarbarosh/node-helpers/src/fs_write');
const fs_write_json = require('@vbarbarosh/node-helpers/src/fs_write_json');
const make = require('@vbarbarosh/type-helpers');
const path = require('path');

const jobs_events = new Map();
let shutdown_hooks_bound = false;

const routes = [
    {req: 'GET /api/v1/jobs', fn: jobs_list},
    {req: 'GET /api/v1/jobs/events', fn: jobs_events_stream},
    {req: 'POST /api/v1/jobs/:job_name', fn: jobs_create},
    {req: 'POST /api/v1/jobs/:job_uid/confirm', fn: jobs_confirm},
];

// GET /api/v1/jobs
async function jobs_list(req, res)
{
    await ensure_jobs_dirs(req);
    await recover_active_jobs(req);

    const items = [];

    await Promise.each(['active', 'finished', 'failed'], async function (bucket) {
        const bucket_root = jobs_bucket_root(req, bucket);
        if (!await fs_exists(bucket_root)) {
            return;
        }

        const names = await fs_readdir(bucket_root);
        await Promise.each(names, async function (name) {
            const status_file = fs_path_resolve(bucket_root, name, 'status.json');
            if (!await fs_exists(status_file)) {
                return;
            }

            try {
                const job = JSON.parse(await fs_read_utf8(status_file));
                if (job.user_uid && job.user_uid !== req.user_uid) {
                    return;
                }
                items.push({...job, bucket});
            }
            catch (error) {
                items.push({
                    uid: name,
                    bucket,
                    status: 'failed',
                    user_friendly_status: 'Invalid status.json',
                });
            }
        });
    });

    items.sort((a, b) => fcmp_strings_ascii(b.created_at || b.uid, a.created_at || a.uid));
    res.send({items});
}

// GET /api/v1/jobs/events
async function jobs_events_stream(req, res)
{
    bind_shutdown_hooks();
    await ensure_jobs_dirs(req);
    await recover_active_jobs(req);

    const user_key = jobs_event_user_key(req.user_uid);
    const clients = jobs_events.get(user_key) || new Set();
    jobs_events.set(user_key, clients);

    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write('retry: 2500\n\n');
    res.write('event: jobs_connected\ndata: {}\n\n');

    clients.add(res);
    const heartbeat = setInterval(function () {
        res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', function () {
        clearInterval(heartbeat);
        clients.delete(res);
        if (clients.size === 0) {
            jobs_events.delete(user_key);
        }
    });
}

// POST /api/v1/jobs/:job_name body={note_uid}
async function jobs_create(req, res)
{
    const job_name = req.params.job_name;
    const note_uid = make(req.body.note_uid, {type: 'str'});

    if (!is_safe_job_name(job_name)) {
        res.status(400).send('Invalid job name');
        return;
    }

    const note_root_name = await resolve_note_root_name(req, note_uid);
    const note_root = fs_path_resolve(req.user_dir, 'notes', note_root_name);
    const run_file = fs_path_resolve(__dirname, '..', 'jobs', job_name, 'bin', 'run');

    if (!await fs_exists(run_file)) {
        res.status(404).send('Job not found');
        return;
    }

    await ensure_jobs_dirs(req);

    const uid = await next_job_uid(req, job_name);
    const job_root = fs_path_resolve(jobs_bucket_root(req, 'active'), uid);
    const now = new Date().toJSON();
    const status = {
        pid: null,
        uid,
        user_uid: req.user_uid,
        note_uid: note_root_name,
        job_name,
        status: 'queued',
        user_friendly_status: 'Queued',
        created_at: now,
        started_at: null,
        finished_at: null,
    };

    await fs_mkdirp(fs_path_resolve(job_root, 'tmp'));
    await write_job_status(job_root, status);
    spawn_job_process({job_root, run_file, note_root, status});
    emit_jobs_changed(req.user_uid);

    res.status(201).send(status);
}

// POST /api/v1/jobs/:job_uid/confirm
async function jobs_confirm(req, res)
{
    const job_uid = req.params.job_uid;
    if (!is_safe_job_uid(job_uid)) {
        res.status(400).send('Invalid job uid');
        return;
    }

    await ensure_jobs_dirs(req);

    for (const bucket of ['finished', 'failed']) {
        const source = fs_path_resolve(jobs_bucket_root(req, bucket), job_uid);
        if (!await fs_exists(source)) {
            continue;
        }

        const status = await read_job_status(source);
        if (status.user_uid && status.user_uid !== req.user_uid) {
            res.status(404).send('Job not found');
            return;
        }

        const target = fs_path_resolve(jobs_bucket_root(req, 'confirmed'), job_uid);
        await fs_rename(source, target);
        emit_jobs_changed(req.user_uid);
        res.send({...status, bucket: 'confirmed'});
        return;
    }

    res.status(404).send('Job not found');
}

async function recover_active_jobs(req)
{
    const active_root = jobs_bucket_root(req, 'active');
    if (!await fs_exists(active_root)) {
        return;
    }

    const names = await fs_readdir(active_root);
    await Promise.each(names, async function (name) {
        const job_root = fs_path_resolve(active_root, name);
        const status_file = fs_path_resolve(job_root, 'status.json');
        if (!await fs_exists(status_file)) {
            return;
        }

        let status;
        try {
            status = await read_job_status(job_root);
        }
        catch (error) {
            status = {
                uid: name,
                status: 'failed',
                user_friendly_status: 'Invalid status.json',
                finished_at: new Date().toJSON(),
            };
            await finish_job(job_root, status, error);
            return;
        }

        if (status.status === 'finished' || status.status === 'failed') {
            await finish_job(job_root, status, null);
            return;
        }

        if (status.pid && !pid_exists(status.pid)) {
            const checked_at = Date.now();
            const touched_at = Date.parse(status.started_at || status.created_at || '') || checked_at;
            if (checked_at - touched_at < 5000) {
                return;
            }

            const inferred_finished = await fs_exists(fs_path_resolve(job_root, 'output.json')) && !await fs_exists(fs_path_resolve(job_root, 'error.txt'));
            await finish_job(job_root, {
                ...status,
                status: inferred_finished ? 'finished' : 'failed',
                user_friendly_status: inferred_finished ? 'Finished' : 'Process exited',
                finished_at: status.finished_at || new Date().toJSON(),
            }, inferred_finished ? null : new Error(`Job process ${status.pid} is no longer running`));
        }
    });
}

function spawn_job_process({job_root, run_file, note_root, status})
{
    const stdout_file = fs.openSync(fs_path_resolve(job_root, 'stdout.log'), 'a');
    const stderr_file = fs.openSync(fs_path_resolve(job_root, 'stderr.log'), 'a');
    let failed_to_start = false;
    let files_closed = false;
    const status_watcher = watch_job_status(job_root, status.user_uid);
    const proc = child_process.spawn(process.execPath, [run_file, note_root], {
        cwd: job_root,
        detached: false,
        stdio: ['ignore', stdout_file, stderr_file],
    });

    function close_files()
    {
        if (files_closed) {
            return;
        }
        files_closed = true;
        status_watcher.close();
        fs.closeSync(stdout_file);
        fs.closeSync(stderr_file);
    }

    proc.once('spawn', function () {
        const running_status = {
            ...status,
            pid: proc.pid,
            status: 'running',
            user_friendly_status: 'Running',
            started_at: new Date().toJSON(),
        };
        write_job_status(job_root, running_status)
            .then(() => emit_jobs_changed(running_status.user_uid))
            .catch(console.error);
    });

    proc.once('error', function (error) {
        failed_to_start = true;
        close_files();
        finish_job(job_root, {
            ...status,
            status: 'failed',
            user_friendly_status: 'Failed to start',
            finished_at: new Date().toJSON(),
        }, error).catch(console.error);
    });

    proc.once('close', function (code, signal) {
        close_files();
        if (failed_to_start) {
            return;
        }
        fs.promises.writeFile(fs_path_resolve(job_root, 'close.log'), JSON.stringify({
            code,
            signal,
            closed_at: new Date().toJSON(),
        }, null, 4)).catch(console.error);
        finish_job_process(job_root, code, signal).catch(console.error);
    });
}

async function finish_job_process(job_root, code, signal)
{
    const current = await read_job_status(job_root);
    const ok = code === 0;
    const status = ok ? 'finished' : 'failed';
    await finish_job(job_root, {
        ...current,
        status,
        user_friendly_status: current.status === status && current.user_friendly_status
            ? current.user_friendly_status
            : ok ? 'Finished' : `Failed${signal ? ` (${signal})` : ''}`,
        finished_at: current.finished_at || new Date().toJSON(),
    }, ok ? null : new Error(`Job exited with code ${code}${signal ? ` and signal ${signal}` : ''}`));
}

async function finish_job(job_root, status, error)
{
    status = {
        ...status,
        uid: status.uid || path.basename(job_root),
        status: status.status || 'failed',
    };

    if (error) {
        const error_file = fs_path_resolve(job_root, 'error.txt');
        if (!await fs_exists(error_file)) {
            await fs_write(error_file, error.stack || error.message || String(error));
        }
    }
    const target_bucket = status.status === 'finished' ? 'finished' : 'failed';
    const target_bucket_root = job_root_bucket(job_root, target_bucket);

    await write_job_status(job_root, status);
    await fs_mkdirp(target_bucket_root);

    const target = fs_path_resolve(target_bucket_root, status.uid);
    if (await fs_exists(target)) {
        return;
    }
    await cache_api_notes_invalidate({user_dir: job_root_user_dir(job_root)}, status.note_uid);
    await fs_rename(job_root, target);
    emit_jobs_changed(status.user_uid);
}

function job_root_user_dir(job_root)
{
    return path.dirname(path.dirname(path.dirname(job_root)));
}

async function resolve_note_root_name(req, note_uid)
{
    const d = `${req.user_dir}/notes`;
    const names = await fs_readdir(d);
    const out = names.find(name => name.startsWith(note_uid));
    if (out) {
        return out;
    }
    throw new Error(`Not found ${note_uid}`);
}

async function read_job_status(job_root)
{
    return JSON.parse(await fs_read_utf8(fs_path_resolve(job_root, 'status.json')));
}

async function write_job_status(job_root, status)
{
    await fs_write_json(fs_path_resolve(job_root, 'status.json'), status);
}

async function ensure_jobs_dirs(req)
{
    await Promise.all(['active', 'finished', 'failed', 'confirmed'].map(bucket => fs_mkdirp(jobs_bucket_root(req, bucket))));
}

async function next_job_uid(req, job_name)
{
    const base = `${now_fs()}-${job_name}`;
    for (let i = 0; ; ++i) {
        const uid = i ? `${base}-${i + 1}` : base;
        const exists = (await Promise.all(['active', 'finished', 'failed', 'confirmed'].map(bucket => {
            return fs_exists(fs_path_resolve(jobs_bucket_root(req, bucket), uid));
        }))).some(Boolean);
        if (!exists) {
            return uid;
        }
    }
}

function jobs_bucket_root(req, bucket)
{
    return fs_path_resolve(req.user_dir, 'jobs', bucket);
}

function emit_jobs_changed(user_uid)
{
    emit_jobs_event(user_uid, 'jobs_changed', {});
}

function watch_job_status(job_root, user_uid)
{
    try {
        return fs.watch(job_root, {persistent: false}, function (event, filename) {
            if (filename === 'status.json') {
                emit_jobs_changed(user_uid);
            }
        });
    }
    catch {
        return {close: function () {}};
    }
}

function emit_jobs_event(user_uid, event, data)
{
    const clients = jobs_events.get(jobs_event_user_key(user_uid));
    if (!clients) {
        return;
    }

    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
        res.write(message);
    }
}

function bind_shutdown_hooks()
{
    if (shutdown_hooks_bound) {
        return;
    }
    shutdown_hooks_bound = true;
    process.once('SIGINT', close_jobs_event_streams);
    process.once('SIGTERM', close_jobs_event_streams);
}

function close_jobs_event_streams()
{
    for (const clients of jobs_events.values()) {
        for (const res of clients) {
            res.end();
        }
    }
    jobs_events.clear();
}

function jobs_event_user_key(user_uid)
{
    return user_uid || '';
}

function job_root_bucket(job_root, bucket)
{
    return fs_path_resolve(path.dirname(path.dirname(job_root)), bucket);
}

function is_safe_job_name(value)
{
    return /^[a-z0-9][a-z0-9_-]*$/.test(value);
}

function is_safe_job_uid(value)
{
    return /^[0-9]{8}_[0-9]{6}-[a-z0-9][a-z0-9_-]*(?:-[0-9]+)?$/.test(value);
}

function pid_exists(pid)
{
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === 'EPERM';
    }
}

function now_fs()
{
    const now = new Date();
    return [
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate(),
        'xx',
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
    ].map(n => n.toString().padStart(2, '0')).join('').replace('xx', '_');
}

function fcmp_strings_ascii(a, b)
{
    return a < b ? -1 : a > b ? 1 : 0;
}

module.exports = routes;
