import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/appError.js';
import {
  initializeMultipartUpload,
  getPresignedUrlForPart,
  getBatchPresignedUrls,
  completeMultipartUpload,
  abortMultipartUpload,
  listUploadedParts,
  getUploadStatus,
} from '../services/multipartUploadService.js';

/**
 * Initialize multipart upload
 * POST /api/v1/multipart-upload/initialize
 * Body: { fileName, fileType, fileSize }
 */
export const initializeUpload = catchAsync(async (req, res, next) => {
  const { fileName, fileType, fileSize } = req.body;

  // Validation
  if (!fileName || !fileType || !fileSize) {
    return next(
      new AppError('fileName, fileType, and fileSize are required', 400)
    );
  }

  if (typeof fileSize !== 'number' || fileSize <= 0) {
    return next(new AppError('fileSize must be a positive number', 400));
  }

  // Maximum file size: 5GB (you can adjust this)
  const maxFileSize = 5 * 1024 * 1024 * 1024; // 5GB
  if (fileSize > maxFileSize) {
    return next(
      new AppError(
        `File size exceeds maximum allowed size of ${maxFileSize / (1024 * 1024 * 1024)}GB`,
        400
      )
    );
  }

  const userId = req.user.id || req.user._id.toString();

  const result = await initializeMultipartUpload(
    fileName,
    fileType,
    fileSize,
    userId
  );

  res.status(200).json({
    status: 'success',
    message: 'Multipart upload initialized',
    data: result,
  });
});

/**
 * Get presigned URL for a single part
 * POST /api/v1/multipart-upload/presigned-url
 * Body: { uploadId, key, partNumber }
 */
export const getPresignedUrl = catchAsync(async (req, res, next) => {
  const { uploadId, key, partNumber } = req.body;

  if (!uploadId || !key || !partNumber) {
    return next(
      new AppError('uploadId, key, and partNumber are required', 400)
    );
  }

  const result = await getPresignedUrlForPart(uploadId, key, partNumber);

  res.status(200).json({
    status: 'success',
    data: result,
  });
});

/**
 * Get presigned URLs for multiple parts (batch)
 * POST /api/v1/multipart-upload/batch-presigned-urls
 * Body: { uploadId, key, startPart, endPart }
 */
export const getBatchPresignedUrlsController = catchAsync(
  async (req, res, next) => {
    const { uploadId, key, startPart, endPart } = req.body;

    if (!uploadId || !key || !startPart || !endPart) {
      return next(
        new AppError(
          'uploadId, key, startPart, and endPart are required',
          400
        )
      );
    }

    if (startPart < 1 || endPart < startPart) {
      return next(new AppError('Invalid part range', 400));
    }

    const result = await getBatchPresignedUrls(
      uploadId,
      key,
      startPart,
      endPart
    );

    res.status(200).json({
      status: 'success',
      data: {
        uploadId,
        key,
        urls: result,
        count: result.length,
      },
    });
  }
);

/**
 * Complete multipart upload
 * POST /api/v1/multipart-upload/complete
 * Body: { uploadId, key, parts: [{PartNumber, ETag}] }
 */
export const completeUpload = catchAsync(async (req, res, next) => {
  const { uploadId, key, parts } = req.body;

  if (!uploadId || !key || !parts) {
    return next(new AppError('uploadId, key, and parts are required', 400));
  }

  const result = await completeMultipartUpload(uploadId, key, parts);

  res.status(200).json({
    status: 'success',
    message: 'Upload completed successfully',
    data: result,
  });
});

/**
 * Abort multipart upload
 * POST /api/v1/multipart-upload/abort
 * Body: { uploadId, key }
 */
export const abortUpload = catchAsync(async (req, res, next) => {
  const { uploadId, key } = req.body;

  if (!uploadId || !key) {
    return next(new AppError('uploadId and key are required', 400));
  }

  const result = await abortMultipartUpload(uploadId, key);

  res.status(200).json({
    status: 'success',
    data: result,
  });
});

/**
 * List uploaded parts (for resume)
 * GET /api/v1/multipart-upload/parts/:uploadId
 * Query: { key }
 */
export const listParts = catchAsync(async (req, res, next) => {
  const { uploadId } = req.params;
  const { key } = req.query;

  if (!uploadId || !key) {
    return next(new AppError('uploadId and key are required', 400));
  }

  const result = await listUploadedParts(uploadId, key);

  res.status(200).json({
    status: 'success',
    data: result,
  });
});

/**
 * Get upload status
 * GET /api/v1/multipart-upload/status/:uploadId
 */
export const getStatus = catchAsync(async (req, res, next) => {
  const { uploadId } = req.params;

  if (!uploadId) {
    return next(new AppError('uploadId is required', 400));
  }

  const result = getUploadStatus(uploadId);

  res.status(200).json({
    status: 'success',
    data: result,
  });
});
