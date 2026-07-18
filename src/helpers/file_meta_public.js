function file_meta_public(meta)
{
    return {
        mime: meta?.mime || 'application/octet-stream',
        details: file_details(meta),
    };
}

function file_details(meta)
{
    switch (meta?.type) {
    case 'image':
        return image_details(meta.image);
    case 'audio':
        return audio_details(meta.audio);
    case 'video':
        return video_details(meta.video);
    default:
        return null;
    }
}

function image_details(image = {})
{
    return {
        width: number_or_null(image.width),
        height: number_or_null(image.height),
        pages: number_or_null(image.pages),
    };
}

function audio_details(audio = {})
{
    const stream = (audio.streams || []).find(v => v.codec_type === 'audio') || {};
    const format = audio.format || {};
    return {
        duration_seconds: number_or_null(format.duration ?? stream.duration),
        bit_rate: number_or_null(format.bit_rate ?? stream.bit_rate),
        sample_rate: number_or_null(stream.sample_rate),
        channels: number_or_null(stream.channels),
        channel_layout: stream.channel_layout || null,
        codec_name: stream.codec_name || format.format_name || null,
    };
}

function video_details(video = {})
{
    const video_stream = (video.streams || []).find(v => v.codec_type === 'video') || {};
    const audio_stream = (video.streams || []).find(v => v.codec_type === 'audio') || {};
    const format = video.format || {};
    return {
        duration_seconds: number_or_null(format.duration ?? video_stream.duration),
        bit_rate: number_or_null(format.bit_rate ?? video_stream.bit_rate),
        width: number_or_null(video_stream.width),
        height: number_or_null(video_stream.height),
        frame_rate: frame_rate_number(video_stream.avg_frame_rate || video_stream.r_frame_rate),
        codec_name: video_stream.codec_name || format.format_name || null,
        audio_codec_name: audio_stream.codec_name || null,
    };
}

function number_or_null(value)
{
    const out = Number(value);
    return Number.isFinite(out) ? out : null;
}

function frame_rate_number(value)
{
    const match = String(value || '').match(/^(\d+)\/(\d+)$/);
    if (!match) {
        return number_or_null(value);
    }
    const denom = Number(match[2]);
    return denom ? Number(match[1]) / denom : null;
}

module.exports = file_meta_public;
