import express from 'express';
import { protect } from '../controllers/authController.js';
import {
  initializeUpload,
  getPresignedUrl,
  getBatchPresignedUrlsController,
  completeUpload,
  abortUpload,
  listParts,
  getStatus,
} from '../controllers/multipartUploadController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route   POST /api/v1/multipart-upload/initialize
 * @desc    Initialize a new multipart upload
 * @access  Private
 * @body    { fileName: string, fileType: string, fileSize: number }
 * @returns { uploadId, key, bucket, fileName, chunkSize, maxChunkSize }
 */
router.post('/initialize', initializeUpload);

/**
 * @route   POST /api/v1/multipart-upload/presigned-url
 * @desc    Get presigned URL for a single part upload
 * @access  Private
 * @body    { uploadId: string, key: string, partNumber: number }
 * @returns { presignedUrl, partNumber, expiresAt }
 */
router.post('/presigned-url', getPresignedUrl);

/**
 * @route   POST /api/v1/multipart-upload/batch-presigned-urls
 * @desc    Get presigned URLs for multiple parts (batch operation)
 * @access  Private
 * @body    { uploadId: string, key: string, startPart: number, endPart: number }
 * @returns { uploadId, key, urls: [...], count }
 */
router.post('/batch-presigned-urls', getBatchPresignedUrlsController);

/**
 * @route   POST /api/v1/multipart-upload/complete
 * @desc    Complete multipart upload and merge all parts
 * @access  Private
 * @body    { uploadId: string, key: string, parts: [{PartNumber, ETag}] }
 * @returns { uploadId, key, location, bucket, etag, fileName, fileSize, totalParts }
 */
router.post('/complete', completeUpload);

/**
 * @route   POST /api/v1/multipart-upload/abort
 * @desc    Abort an in-progress multipart upload
 * @access  Private
 * @body    { uploadId: string, key: string }
 * @returns { uploadId, status, message }
 */
router.post('/abort', abortUpload);

/**
 * @route   GET /api/v1/multipart-upload/parts/:uploadId
 * @desc    List already uploaded parts (for resume functionality)
 * @access  Private
 * @query   { key: string }
 * @returns { uploadId, key, parts: [...], totalParts }
 */
router.get('/parts/:uploadId', listParts);

/**
 * @route   GET /api/v1/multipart-upload/status/:uploadId
 * @desc    Get upload status and metadata
 * @access  Private
 * @returns { uploadId, key, fileName, fileType, fileSize, userId, status, createdAt, parts }
 */
router.get('/status/:uploadId', getStatus);

export default router;
