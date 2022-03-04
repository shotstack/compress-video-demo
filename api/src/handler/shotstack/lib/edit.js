'use strict';

const fs = require('fs');
const Joi = require('joi');

const VIDEO_INDEX = 0;

const validateBody = (body) => {
    const schema = Joi.object({
        video: Joi.string().uri().min(2).max(300).required(),
        width: Joi.number().min(0).max(1920),
        height: Joi.number().min(0).max(1920),
        fps: Joi.number().valid(12, 15, 24, 25, 30),
        quality: Joi.string().valid('low', 'medium', 'high'),
        duration: Joi.number(),
    });

    return schema.validate({ ...body });
};

const createJson = (body) => {
    return new Promise((resolve, reject) => {
        const valid = validateBody(body);

        if (valid.error) {
            reject(valid.error.details[0].message);
        }

        const videoUrl = body.video;
        const { width, height, fps, quality, duration } = body;

        fs.readFile(__dirname + '/template.json', 'utf-8', function (err, data) {
            if (err) {
                console.error(err);
                reject(err);
            }

            let jsonParsed = JSON.parse(data);

            jsonParsed.timeline.tracks[VIDEO_INDEX].clips[0].asset.src = videoUrl;
            jsonParsed.timeline.tracks[VIDEO_INDEX].clips[0].length = duration;
            jsonParsed.output.size.width = width;
            jsonParsed.output.size.height = height;
            jsonParsed.output.fps = fps;
            jsonParsed.output.quality = quality;

            const json = JSON.stringify(jsonParsed);

            return resolve(json);
        });
    });
};

module.exports = {
    createJson,
};
