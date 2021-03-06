var apiUrl = 'http://localhost:3000/demo/'; // 'https://cl8gk0ix49.execute-api.ap-southeast-2.amazonaws.com/demo/';
var apiEndpoint = apiUrl + 'shotstack';
var urlEndpoint = apiUrl + 'upload/sign';
var probeEndpoint = 'https://api.shotstack.io/stage/probe/';
var s3Bucket = 'https://shotstack-demo-storage.s3-ap-southeast-2.amazonaws.com/';
var progress = 0;
var progressIncrement = 10;
var pollIntervalSeconds = 10;
var unknownError = 'An error has occurred, please try again later.';
var player;
var maxVideoDuration = 120;

var originalWidth;
var originalHeight;
var originalDuration;
var originalFileSize;

/**
 * Initialise and play the video
 *
 * @param {String} src  the video URL
 */
function initialiseVideo(src) {
    player = new Plyr('#player', {
        controls: ['play-large', 'play', 'progress', 'mute', 'volume', 'download', 'fullscreen'],
    });

    player.source = {
        type: 'video',
        sources: [
            {
                src: src,
                type: 'video/mp4',
            },
        ],
    };

    player.download = src;

    $('#status').removeClass('d-flex').addClass('d-none');
    $('#player').show();

    player.play();
}

/**
 * Convert bytes to the closest unit of storage (KB, MB, GB etc).
 *
 * @param {Number} bytes - number of bytes
 * @param {Number} decimal - number of decimal places.
 *
 * @returns {String} representation of bytes in closest unit of storage.
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Show the size of the original and compressed video, as well as the savings
 * that compression achieved as a percentage. Uses the Shotstack probe API to
 * get the dimensions of the compressed video.
 *
 * @param {String} url - the URL of a video.
 */
function showCompressedVideoFileSize(url) {
    $.get(probeEndpoint + encodeURIComponent(url), function (data, status) {
        const metadata = data.response.metadata;

        for (let i = 0; i < metadata.streams.length; i++) {
            stream = metadata.streams[i];

            if (stream.codec_type === 'video' && stream.width && stream.height) {
                const compressedFileSize = Number(metadata.format.size);
                const saving = ((originalFileSize - compressedFileSize) / originalFileSize) * 100;

                $('#original-file-size').text(formatBytes(originalFileSize, 1));
                $('#compressed-file-size').text(formatBytes(compressedFileSize, 1));
                $('#file-size-delta-percentage').text(saving.toFixed(0));
                $('#file-delta-summary').removeClass('d-none');

                break;
            }
        }
    }).fail(function(error) {
        console.error(error);
        displayError('Failed to get size of compressed video');
    });

}

/**
 * Check the render status of the video
 *
 * @param {String} id  the render job UUID
 */
function pollVideoStatus(id) {
    $.get(apiEndpoint + '/' + id, function (response) {
        updateStatus(response.data.status);
        if (!(response.data.status === 'done' || response.data.status === 'failed')) {
            setTimeout(function () {
                pollVideoStatus(id);
            }, pollIntervalSeconds * 1000);
        } else if (response.data.status === 'failed') {
            updateStatus(response.data.status);
        } else {
            initialiseVideo(response.data.url);
            initialiseJson(response.data.data);
            initialiseDownload(response.data.url);
            showCompressedVideoFileSize(response.data.url);

            resetForm();
        }
    });
}

/**
 * Update status message and progress bar
 *
 * @param {String} status  the status text
 */
function updateStatus(status) {
    $('#status').removeClass('d-none');
    $('#instructions').addClass('d-none');

    if (progress <= 90) {
        progress += progressIncrement;
    }

    if (status === 'submitted') {
        $('#status .fas').attr('class', 'fas fa-spinner fa-spin fa-2x');
        $('#status p').text('SUBMITTED');
    } else if (status === 'queued') {
        $('#status .fas').attr('class', 'fas fa-history fa-2x');
        $('#status p').text('QUEUED');
    } else if (status === 'fetching') {
        $('#status .fas').attr('class', 'fas fa-cloud-download-alt fa-2x');
        $('#status p').text('DOWNLOADING ASSETS');
    } else if (status === 'rendering') {
        $('#status .fas').attr('class', 'fas fa-server fa-2x');
        $('#status p').text('RENDERING VIDEO');
    } else if (status === 'saving') {
        $('#status .fas').attr('class', 'fas fa-save fa-2x');
        $('#status p').text('SAVING VIDEO');
    } else if (status === 'done') {
        $('#status .fas').attr('class', 'fas fa-check-circle fa-2x');
        $('#status p').text('READY');
        progress = 100;
    } else {
        $('#status .fas').attr('class', 'fas fa-exclamation-triangle fa-2x');
        $('#status p').text('SOMETHING WENT WRONG');
        $('#submit-video').prop('disabled', false);
        progress = 0;
    }

    $('.progress-bar')
        .css('width', progress + '%')
        .attr('aria-valuenow', progress);
}

/**
 * Display form field and general errors returned by API
 *
 * @param error
 */
function displayError(error) {
    if (typeof error === 'string') {
        $('#errors').text(error).removeClass('d-hide').addClass('d-block');
        return;
    }

    updateStatus(null);

    if (error.status === 400) {
        var response = error.responseJSON;
        if (typeof response.data === 'string') {
            $('#errors').text(response.data).removeClass('d-hide').addClass('d-block');
        } else {
            $('#errors').text(unknownError).removeClass('d-hide').addClass('d-block');
        }
    } else {
        $('#errors').text(unknownError).removeClass('d-hide').addClass('d-block');
    }
}

/**
 * Reset errors
 */
function resetErrors() {
    $('input, label, select').removeClass('text-danger is-invalid');
    $('.invalid-feedback').remove();
    $('#errors').text('').removeClass('d-block').addClass('d-none');
}

/**
 * Reset form
 */
function resetForm() {
    $('#submit-video').prop('disabled', false);
}

/**
 * Reset and delete video
 */
function resetVideo() {
    if (player) {
        player.destroy();
        player = undefined;
    }

    progress = 0;

    $('.json-container').html('');
    $('#json').hide();
}

/**
 * Submit the form with data to create a Shotstack edit
 */
function submitVideoEdit() {
    updateStatus('submitted');
    $('#submit-video').prop('disabled', true);
    $('#file-delta-summary').addClass('d-none');

    var formData = {
        video: getSelectedVideoFile(),
        width: Number($('#width').text()),
        height: Number($('#height').text()),
        fps: Number($('#fps').val()),
        quality: $('#quality').val(),
        duration: originalDuration,
    };

    $.ajax({
        type: 'POST',
        url: apiEndpoint,
        data: JSON.stringify(formData),
        dataType: 'json',
        crossDomain: true,
        contentType: 'application/json',
    })
        .done(function (response) {
            if (response.status !== 'success') {
                displayError(response.message);
                $('#submit-video').prop('disabled', false);
            } else {
                pollVideoStatus(response.data.response.id);
            }
        })
        .fail(function (error) {
            displayError(error);
            $('#submit-video').prop('disabled', false);
        });
}

/**
 * Colour and style JSON
 *
 * @param match
 * @param pIndent
 * @param pKey
 * @param pVal
 * @param pEnd
 * @returns {*}
 */
function styleJson(match, pIndent, pKey, pVal, pEnd) {
    var key = '<span class=json-key>"';
    var val = '<span class=json-value>';
    var str = '<span class=json-string>';
    var r = pIndent || '';
    if (pKey) r = r + key + pKey.replace(/[": ]/g, '') + '"</span>: ';
    if (pVal) r = r + (pVal[0] == '"' ? str : val) + pVal + '</span>';
    return r + (pEnd || '');
}

/**
 * Pretty print JSON object on screen
 *
 * @param obj
 * @returns {string}
 */
function prettyPrintJson(obj) {
    var jsonLine = /^( *)("[\w]+": )?("[^"]*"|[\w.+-]*)?([,[{])?$/gm;
    return JSON.stringify(obj, null, 3)
        .replace(/&/g, '&amp;')
        .replace(/\\"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(jsonLine, styleJson);
}

/**
 * Show the JSON display button
 *
 * @param json
 */
function initialiseJson(json) {
    $('#json').show();
    $('.json-container').html(prettyPrintJson(json));
}

/**
 * Open video in new window
 *
 * @param {String} url
 */
function initialiseDownload(url) {
    $('#download').attr('href', url);
}

/**
 * Set URL to active
 * @param {Object} $urlButton
 */
function setUrlActive($urlButton) {
    var $parent = $urlButton.closest('.video-group');
    var $videoUrlField = $parent.children('.input-url');
    var $uploadField = $parent.children('.upload');

    $urlButton.addClass('btn-primary').removeClass('btn-secondary');
    $videoUrlField.prop('required', true);
    $uploadField.removeAttr('required');
    $videoUrlField.slideDown('fast');
}

/**
 * Set URL to inactive
 * @param {Object} $urlButton
 */
function setUrlInactive($urlButton) {
    var $parent = $urlButton.closest('.video-group');
    var $videoUrlField = $parent.children('.input-url');

    $urlButton.removeClass('btn-primary').addClass('btn-secondary');
    $videoUrlField.removeAttr('required');
    $videoUrlField.slideUp('fast');
}

/**
 * Set upload to active
 * @param {Object} $uploadButton
 */
function setUploadActive($uploadButton) {
    var $parent = $uploadButton.closest('.video-group');
    var $videoUrlField = $parent.children('.input-url');
    var $uploadField = $parent.find('.upload');
    var $filePlaceholder = $parent.children('.file-placeholder');

    $uploadButton.addClass('btn-primary').removeClass('btn-secondary');
    $videoUrlField.removeAttr('required');
    $uploadField.prop('required', true);
    $filePlaceholder.slideDown('fast');
}

/**
 * Set Upload to inactive
 * @param {Object} $uploadButton
 */
function setUploadInactive($uploadButton) {
    var $parent = $uploadButton.closest('.video-group');
    var $uploadField = $parent.find('.upload');
    var $filePlaceholder = $parent.children('.file-placeholder');

    $uploadButton.removeClass('btn-primary').addClass('btn-secondary');
    $uploadField.removeAttr('required');
    $filePlaceholder.slideUp('fast');
}

/**
 * Remove a file from upload
 *
 * @param {*} $removeButton
 */
function removeFile($removeButton) {
    var $uploadButton = $removeButton.closest('.video-group').find('.upload-button');
    var $filename = $removeButton.siblings('.name');

    setUploadInactive($uploadButton);
    $filename.empty().removeAttr('data-file');

    $('#dimensions-placeholder').addClass('d-none');
}

/**
 * Get the URL of the selected video file
 */
function getSelectedVideoFile() {
    var $videoUrl = $('#video-url');
    var $videoFile = $('#video-upload');

    if ($videoUrl.prop('required')) {
        return $videoUrl.val();
    }

    if ($videoFile.prop('required')) {
        var $videoFileName = $('#video-file .name');
        return s3Bucket + encodeURIComponent($videoFileName.attr('data-file'));
    }
}

/**
 * Calculate the output video width and height based on the proportion selected
 * and the original video width and height. In the absence of a valid
 * proportion, use 100%.
 */
function calculateProportionalWidthHeight() {
    let proportion = Number($('#proportion').val());

    if (proportion <= 0.0 || proportion > 1.0) {
        proportion = 1.0;
    }

    let width = proportion * originalWidth;
    let height = proportion * originalHeight;

    if (width % 2) {
        width += 1;
    }
    if (height % 2) {
        height += 1;
    }

    $('#width').text(width);
    $('#height').text(height);
}

/**
 * Save the dimensions of the original video. This is necessary to recalculate
 * new dimensions when the proportion selection changes.
 *
 * @param {stream} stream - a (video?) stream from a media file.
 */
function saveOriginalVideoWidthHeight(stream) {
    originalWidth = stream.width ?? 0;
    originalHeight = stream.height ?? 0;
}

/**
 * Save the duration of the original video. Required by the Shotstack API when
 * we ask for a new video.
 *
 * @param {Number} duration - length of video in seconds.
 */
function saveOriginalVideoDuration(duration) {
    originalDuration = duration;
}

/**
 * Save the file size of the original video. Used to calculate the savings
 * after video has been compressed.
 *
 * @param {Number} bytes - size of the video in bytes.
 */
function saveOriginalFileSize(bytes) {
    originalFileSize = bytes;
}

/**
 * Get the dimensions of a video file. Uses the Shotstack probe endpoint.
 *
 * @param {String} url
 */
function setDimensionsFromFile(url) {
    $('#submit-video').prop('disabled', true);

    $.get(probeEndpoint + encodeURIComponent(url), function (data, status) {
        const metadata = data.response.metadata;

        for (let i = 0; i < metadata.streams.length; i++) {
            stream = metadata.streams[i];

            if (stream.codec_type === 'video' && stream.width && stream.height) {
                saveOriginalVideoWidthHeight(stream);
                saveOriginalVideoDuration(Number(metadata.format.duration));
                saveOriginalFileSize(Number(metadata.format.size));
                calculateProportionalWidthHeight();
                $('#dimensions-placeholder').removeClass('d-none');
                $('#submit-video').prop('disabled', false);
 
                break;
            }
        }
    }).fail(function(error) {
        console.error(error);
        displayError('Failed to get dimensions of video');
    });
}

/**
 * Upload a file to AWS S3
 *
 * @param {String} file
 * @param {Object} presignedPostData
 * @param {Object} element
 */
function uploadFileToS3(file, presignedPostData, element) {
    var $uploadField = $(element);
    var $parent = $uploadField.closest('.video-group');
    var $uploadButton = $parent.find('.upload-button');
    var $loadingSpinner = $uploadButton.find('.loading-image');
    var $uploadIcon = $uploadButton.find('.upload-icon');
    var $filePlaceholder = $parent.children('.file-placeholder');
    var $filePlaceholderName = $filePlaceholder.children('.name');

    var formData = new FormData();
    Object.keys(presignedPostData.fields).forEach((key) => {
        formData.append(key, presignedPostData.fields[key]);
    });
    formData.append('file', file);

    $loadingSpinner.removeClass('d-none');
    $uploadIcon.addClass('d-none');

    $.ajax({
        url: presignedPostData.url,
        method: 'POST',
        data: formData,
        contentType: false,
        processData: false,
    })
        .done(function (response, statusText, xhr) {
            $loadingSpinner.addClass('d-none');
            $uploadIcon.removeClass('d-none');
            if (xhr.status === 204) {
                setUploadActive($uploadButton);
                setDimensionsFromFile(s3Bucket + presignedPostData.fields['key']);
                $filePlaceholderName
                    .text(file.name)
                    .attr('data-file', presignedPostData.fields['key']);
            } else {
                console.log(xhr.status);
            }
        })
        .fail(function (error) {
            console.error(error);
            displayError('Failed to upload file to S3');
        });
}

/**
 * Get an AWS signed URL for S3 uploading
 *
 * @param {*} name
 * @param {*} type
 * @param {*} callback
 */
function getS3PresignedPostData(name, type, callback) {
    var formData = new FormData();
    var formData = {
        name: name,
        type: type,
    };

    $.ajax({
        type: 'POST',
        url: urlEndpoint,
        data: JSON.stringify(formData),
        dataType: 'json',
        crossDomain: true,
        contentType: 'application/json',
    })
        .done(function (response) {
            if (response.status !== 'success') {
                displayError(response.message);
            } else {
                callback(response.data);
            }
        })
        .fail(function (error) {
            console.error(error);
            displayError('Failed to generate S3 signed URL');
        });
}

/**
 * Check video are selected
 */
function isFormValid() {
    $requiredFields = $('.video-group').find('input[required]');

    if ($requiredFields.length !== 1) {
        return false;
    }

    return true;
}

/**
 * Event Handlers
 */
$(document).ready(function () {
    /** URL button click event */
    $('.url-button').click(function () {
        var $urlButton = $(this);
        var $parent = $urlButton.closest('.video-group');
        var $videoUrlField = $parent.children('.input-url');
        var $uploadButton = $parent.find('.upload-button');

        setUploadInactive($uploadButton);

        if ($videoUrlField.is(':hidden')) {
            setUrlActive($urlButton);
        } else {
            setUrlInactive($urlButton);
        }
    });

    /** Upload button click event */
    $('.upload-button').click(function (event) {
        var $uploadButton = $(this);
        var $parent = $uploadButton.closest('.video-group');
        var $uploadField = $parent.find('.upload');
        var $urlButton = $parent.find('.url-button');

        setUrlInactive($urlButton);
        $uploadField.prop('required', true).click();

        event.preventDefault();
    });

    /** Remove file button click event */
    $('.remove-file').click(function () {
        removeFile($(this));
    });

    /** File upload change event */
    $('.upload').change(function (event) {
        var name = event.target.files[0].name;
        var type = event.target.files[0].type;

        getS3PresignedPostData(name, type, function (data) {
            uploadFileToS3(event.target.files[0], data, event.target);
        });
    });

    $('#proportion').change(function (event) {
        calculateProportionalWidthHeight();
    });

    /** Video URL field change event */
    $('#video-url').blur(function () {
        var videoUrl = $(this).val();
        setDimensionsFromFile(videoUrl);
    });

    /** Form submit event */
    $('form').submit(function (event) {
        if (isFormValid()) {
            resetErrors();
            resetVideo();
            submitVideoEdit();
        } else {
            displayError('Please select a video.');
        }

        event.preventDefault();
    });
});
