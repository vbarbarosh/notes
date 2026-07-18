const assert = require('assert');
const file_meta_public = require('./file_meta_public');

describe('file_meta_public', function () {
    it('returns image details without repeating the content type', function () {
        assert.deepEqual(file_meta_public({
            mime: 'image/jpeg',
            type: 'image',
            image: {width: 1920, height: 1080, pages: 1, format: 'jpeg'},
        }), {
            mime: 'image/jpeg',
            details: {width: 1920, height: 1080, pages: 1},
        });
    });

    it('returns audio details', function () {
        assert.deepEqual(file_meta_public({
            mime: 'audio/mpeg',
            type: 'audio',
            audio: {
                format: {duration: '12.5', bit_rate: '320000'},
                streams: [{codec_type: 'audio', sample_rate: '44100', channels: 2, channel_layout: 'stereo', codec_name: 'mp3'}],
            },
        }), {
            mime: 'audio/mpeg',
            details: {
                duration_seconds: 12.5,
                bit_rate: 320000,
                sample_rate: 44100,
                channels: 2,
                channel_layout: 'stereo',
                codec_name: 'mp3',
            },
        });
    });

    it('returns video details', function () {
        assert.deepEqual(file_meta_public({
            mime: 'video/mp4',
            type: 'video',
            video: {
                format: {duration: '42.25', bit_rate: '1500000'},
                streams: [
                    {codec_type: 'video', width: 1920, height: 1080, avg_frame_rate: '30000/1001', codec_name: 'h264'},
                    {codec_type: 'audio', codec_name: 'aac'},
                ],
            },
        }), {
            mime: 'video/mp4',
            details: {
                duration_seconds: 42.25,
                bit_rate: 1500000,
                width: 1920,
                height: 1080,
                frame_rate: 30000 / 1001,
                codec_name: 'h264',
                audio_codec_name: 'aac',
            },
        });
    });

    it('returns null details for files without specialized metadata', function () {
        assert.deepEqual(file_meta_public({mime: 'application/zip'}), {
            mime: 'application/zip',
            details: null,
        });
    });
});
