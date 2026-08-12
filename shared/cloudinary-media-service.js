import { cloudinaryConfiguration } from "../configuration/cloudinary-config.js";
import { playUiSound } from "./audio/sound-manager.js?v=6";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const AUDIO_TYPES = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]);
const IMAGE_LIMIT = 5 * 1024 * 1024;
const VIDEO_LIMIT = 50 * 1024 * 1024;
const VIDEO_DURATION_LIMIT = 60;
const AUDIO_LIMIT = 15 * 1024 * 1024;

export function validateImage(file) {
    if (!(file instanceof File)) throw new Error("Không tìm thấy tệp ảnh cần tải lên.");
    if (!IMAGE_TYPES.has(file.type)) throw new Error("Ảnh chỉ hỗ trợ JPEG, PNG hoặc WebP.");
    if (file.size > IMAGE_LIMIT) throw new Error("Ảnh phải có dung lượng không quá 5 MB.");
    return true;
}

export async function validateVideo(file) {
    if (!(file instanceof File)) throw new Error("Không tìm thấy tệp video cần tải lên.");
    if (!VIDEO_TYPES.has(file.type)) throw new Error("Video chỉ hỗ trợ MP4, WebM hoặc QuickTime.");
    if (file.size > VIDEO_LIMIT) throw new Error("Video phải có dung lượng không quá 50 MB.");
    const duration = await readVideoDuration(file);
    if (!Number.isFinite(duration) || duration > VIDEO_DURATION_LIMIT) {
        throw new Error("Video phải có thời lượng không quá 60 giây.");
    }
    return true;
}

export async function uploadImage(file, onProgress = () => {}, options = {}) {
    validateImage(file);
    return uploadToCloudinary(file, "image", onProgress, options);
}

export async function uploadVideo(file, onProgress = () => {}, options = {}) {
    await validateVideo(file);
    return uploadToCloudinary(file, "video", onProgress, options);
}

export async function uploadMedia(file, onProgress = () => {}, options = {}) {
    if (!file) return null;
    if (file.type.startsWith("image/")) return uploadImage(file, onProgress, options);
    if (file.type.startsWith("video/")) return uploadVideo(file, onProgress, options);
    if (file.type.startsWith("audio/")) {
        if (!AUDIO_TYPES.has(file.type.split(";")[0])) throw new Error("Âm thanh chỉ hỗ trợ WebM, OGG, MP3, MP4 hoặc WAV.");
        if (file.size > AUDIO_LIMIT) throw new Error("Tin nhắn thoại không được vượt quá 15 MB.");
        return uploadToCloudinary(file, "audio", onProgress, options);
    }
    throw new Error("Định dạng media không được hỗ trợ.");
}

function uploadToCloudinary(file, mediaType, onProgress, options = {}) {
    const isVideo = mediaType === "video" || mediaType === "audio";
    const endpoint = isVideo ? cloudinaryConfiguration.videoUploadEndpoint : cloudinaryConfiguration.imageUploadEndpoint;
    const preset = isVideo ? cloudinaryConfiguration.videoUploadPreset : cloudinaryConfiguration.imageUploadPreset;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", preset);

    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        if (options.signal?.aborted) {
            reject(new Error("Đã hủy tải media lên Cloudinary."));
            return;
        }
        options.signal?.addEventListener("abort", () => request.abort(), { once: true });
        request.open("POST", endpoint, true);
        request.responseType = "json";
        request.upload.onprogress = event => {
            if (event.lengthComputable) onProgress(Math.min(100, Math.round(event.loaded / event.total * 100)));
        };
        request.onerror = () => reject(new Error("Không thể kết nối Cloudinary. Hãy kiểm tra mạng và thử lại."));
        request.onabort = () => reject(new Error("Đã hủy tải media lên Cloudinary."));
        request.onload = () => {
            const response = request.response || {};
            if (request.status < 200 || request.status >= 300 || !response.secure_url) {
                reject(new Error(response.error?.message || `Cloudinary từ chối upload (${request.status}).`));
                return;
            }
            onProgress(100);
            playUiSound("upload-complete");
            resolve(normalizeUploadResult(response, mediaType));
        };
        onProgress(0);
        playUiSound("upload-start");
        request.send(formData);
    });
}

function normalizeUploadResult(response, mediaType) {
    return {
        mediaType,
        mediaUrl: response.secure_url,
        mediaPublicId: response.public_id,
        mediaFormat: response.format || null,
        mediaBytes: Number(response.bytes) || 0,
        mediaWidth: Number(response.width) || null,
        mediaHeight: Number(response.height) || null,
        mediaDuration: mediaType === "video" ? Number(response.duration) || null : null
    };
}

function readVideoDuration(file) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        const objectUrl = URL.createObjectURL(file);
        video.preload = "metadata";
        video.onloadedmetadata = () => {
            const duration = video.duration;
            URL.revokeObjectURL(objectUrl);
            resolve(duration);
        };
        video.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Không thể đọc thời lượng video đã chọn."));
        };
        video.src = objectUrl;
    });
}
