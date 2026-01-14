import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fromEnv } from '@aws-sdk/credential-provider-env';
import AppError from '../utils/appError.js';
import MultipartUpload from '../models/MultipartUpload.js';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: fromEnv(),
});

/**
 * Initialize a multipart upload
 * @param {string} fileName - Original filename
 * @param {string} fileType - MIME type
 * @param {number} fileSize - Total file size in bytes
 * @param {string} userId - User ID initiating the upload
 * @returns {Promise<object>} - Upload metadata including uploadId and key
 */
export const initializeMultipartUpload = async (
  fileName,
  fileType,
  fileSize,
  userId
) => {
  // Validate file type (video or image)
  if (!fileType.startsWith('video/') && !fileType.startsWith('image/')) {
    throw new AppError(
      'Invalid file type. Only video and image files are allowed.',
      400
    );
  }

  // Generate unique key for S3
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `uploads/${userId}/${timestamp}-${sanitizedFileName}`;

  try {
    // Create multipart upload in S3
    const command = new CreateMultipartUploadCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      Metadata: {
        'original-filename': fileName,
        'uploaded-by': userId,
        'file-size': fileSize.toString(),
      },
    });

    const response = await s3Client.send(command);

    // Store upload metadata in database
    const uploadRecord = await MultipartUpload.create({
      uploadId: response.UploadId,
      key: key,
      fileName: fileName,
      fileType: fileType,
      fileSize: fileSize,
      userId: userId,
      bucket: process.env.S3_BUCKET_NAME,
      status: 'in_progress',
      parts: [],
    });

    console.log(`✅ Multipart upload initialized: ${response.UploadId}`);

    return {
      uploadId: response.UploadId,
      key: key,
      bucket: process.env.S3_BUCKET_NAME,
      fileName: fileName,
      chunkSize: 5 * 1024 * 1024, // 5MB minimum for S3 multipart (except last part)
      maxChunkSize: 100 * 1024 * 1024, // 100MB recommended for optimal performance
    };
  } catch (error) {
    console.error('Error initializing multipart upload:', error);
    throw new AppError('Failed to initialize upload', 500);
  }
};

/**
 * Generate presigned URL for uploading a specific part
 * @param {string} uploadId - The multipart upload ID
 * @param {string} key - S3 object key
 * @param {number} partNumber - Part number (1-indexed, max 10,000)
 * @returns {Promise<object>} - Presigned URL and part number
 */
export const getPresignedUrlForPart = async (uploadId, key, partNumber) => {
  // Validate part number (S3 allows 1-10,000)
  if (partNumber < 1 || partNumber > 10000) {
    throw new AppError('Part number must be between 1 and 10,000', 400);
  }

  // Verify upload exists in database
  const uploadRecord = await MultipartUpload.findOne({ uploadId });
  if (!uploadRecord) {
    throw new AppError('Upload not found or expired', 404);
  }

  // Update last accessed time
  await uploadRecord.touch();

  try {
    const command = new UploadPartCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    // Generate presigned URL (valid for 1 hour)
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    console.log(`📝 Generated presigned URL for part ${partNumber}`);

    return {
      presignedUrl,
      partNumber,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw new AppError('Failed to generate upload URL', 500);
  }
};

/**
 * Generate presigned URLs for multiple parts at once (batch operation)
 * @param {string} uploadId - The multipart upload ID
 * @param {string} key - S3 object key
 * @param {number} startPart - Starting part number
 * @param {number} endPart - Ending part number
 * @returns {Promise<Array>} - Array of presigned URLs
 */
export const getBatchPresignedUrls = async (
  uploadId,
  key,
  startPart,
  endPart
) => {
  if (endPart - startPart > 100) {
    throw new AppError('Cannot generate more than 100 URLs at once', 400);
  }

  const urls = [];
  for (let partNumber = startPart; partNumber <= endPart; partNumber++) {
    const urlData = await getPresignedUrlForPart(uploadId, key, partNumber);
    urls.push(urlData);
  }

  return urls;
};

/**
 * Complete multipart upload after all parts are uploaded
 * @param {string} uploadId - The multipart upload ID
 * @param {string} key - S3 object key
 * @param {Array} parts - Array of {PartNumber, ETag} objects
/**
 * Complete multipart upload after all parts are uploaded
 * @param {string} uploadId - The multipart upload ID
 * @param {string} key - S3 object key
 * @param {Array} parts - Array of {PartNumber, ETag} objects
 * @returns {Promise<object>} - Final S3 object location
 */
export const completeMultipartUpload = async (uploadId, key, parts) => {
  // Verify upload exists in database
  const uploadRecord = await MultipartUpload.findOne({ uploadId });
  if (!uploadRecord) {
    throw new AppError('Upload not found or expired', 404);
  }

  // Validate parts array
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new AppError('Parts array is required and cannot be empty', 400);
  }

  // Validate each part has required fields
  for (const part of parts) {
    if (!part.PartNumber || !part.ETag) {
      throw new AppError('Each part must have PartNumber and ETag', 400);
    }
  }

  // Sort parts by part number
  const sortedParts = parts.sort((a, b) => a.PartNumber - b.PartNumber);

  try {
    const command = new CompleteMultipartUploadCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts,
      },
    });

    const response = await s3Client.send(command);

    // Update database record
    uploadRecord.status = 'completed';
    uploadRecord.completedAt = new Date();
    uploadRecord.parts = sortedParts.map((part) => ({
      partNumber: part.PartNumber,
      etag: part.ETag,
      uploadedAt: new Date(),
    }));
    await uploadRecord.save();

    console.log(`✅ Multipart upload completed: ${uploadId}`);
    console.log(`📍 S3 Location: ${response.Location}`);

    return {
      uploadId,
      key,
      location: response.Location,
      bucket: response.Bucket,
      etag: response.ETag,
      fileName: uploadRecord.fileName,
      fileSize: uploadRecord.fileSize,
      totalParts: sortedParts.length,
    };
  } catch (error) {
    // Mark as failed in database
    uploadRecord.status = 'failed';
    await uploadRecord.save();

    console.error('Error completing multipart upload:', error);
    throw new AppError('Failed to complete upload', 500);
  }
};

/**
 * Abort a multipart upload
 * @param {string} uploadId - The multipart upload ID
 * @param {string} key - S3 object key
 * @returns {Promise<object>} - Confirmation
 */
export const abortMultipartUpload = async (uploadId, key) => {
  const uploadRecord = await MultipartUpload.findOne({ uploadId });
  if (!uploadRecord) {
    throw new AppError('Upload not found', 404);
  }

  try {
    const command = new AbortMultipartUploadCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    });

    await s3Client.send(command);

    // Update database record
    uploadRecord.status = 'aborted';
    uploadRecord.abortedAt = new Date();
    await uploadRecord.save();

    console.log(`🗑️ Multipart upload aborted: ${uploadId}`);

    return {
      uploadId,
      status: 'aborted',
      message: 'Upload cancelled successfully',
    };
  } catch (error) {
    console.error('Error aborting multipart upload:', error);
    throw new AppError('Failed to abort upload', 500);
  }
};

/**
 * List already uploaded parts (for resume functionality)
 * @param {string} uploadId - The multipart upload ID
 * @param {string} key - S3 object key
 * @returns {Promise<Array>} - Array of uploaded parts
 */
export const listUploadedParts = async (uploadId, key) => {
  try {
    const command = new ListPartsCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    });

    const response = await s3Client.send(command);

    const parts = (response.Parts || []).map((part) => ({
      PartNumber: part.PartNumber,
      ETag: part.ETag,
      Size: part.Size,
      LastModified: part.LastModified,
    }));

    console.log(`📋 Listed ${parts.length} uploaded parts for ${uploadId}`);

    return {
      uploadId,
      key,
      parts,
      totalParts: parts.length,
    };
  } catch (error) {
    console.error('Error listing parts:', error);
    throw new AppError('Failed to list uploaded parts', 500);
  }
};

/**
 * Get upload status and metadata
 * @param {string} uploadId - The multipart upload ID
 * @returns {object} - Upload metadata
 */
export const getUploadStatus = async (uploadId) => {
  const uploadRecord = await MultipartUpload.findOne({ uploadId });
  if (!uploadRecord) {
    throw new AppError('Upload not found', 404);
  }

  // Update last accessed time
  await uploadRecord.touch();

  return {
    uploadId: uploadRecord.uploadId,
    key: uploadRecord.key,
    fileName: uploadRecord.fileName,
    fileType: uploadRecord.fileType,
    fileSize: uploadRecord.fileSize,
    userId: uploadRecord.userId,
    status: uploadRecord.status,
    parts: uploadRecord.parts,
    createdAt: uploadRecord.createdAt,
    completedAt: uploadRecord.completedAt,
    lastAccessedAt: uploadRecord.lastAccessedAt,
  };
};

/**
 * Cleanup function to remove stale uploads (run periodically)
 * Aborts uploads that have expired or been inactive for too long
 */
export const cleanupStaleUploads = async () => {
  try {
    const now = new Date();

    // Find stale in-progress uploads
    const staleUploads = await MultipartUpload.find({
      status: 'in_progress',
      expiresAt: { $lt: now },
    });

    console.log(`🧹 Found ${staleUploads.length} stale uploads to clean up`);

    for (const upload of staleUploads) {
      try {
        console.log(`🗑️ Cleaning up stale upload: ${upload.uploadId}`);
        await abortMultipartUpload(upload.uploadId, upload.key);
      } catch (err) {
        console.error(`Error aborting stale upload ${upload.uploadId}:`, err);
      }
    }

    // Optionally: Delete old completed/aborted records (older than 7 days)
    const oldRecordDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const deletedCount = await MultipartUpload.deleteMany({
      status: { $in: ['completed', 'aborted', 'failed'] },
      updatedAt: { $lt: oldRecordDate },
    });

    if (deletedCount.deletedCount > 0) {
      console.log(`🗑️ Deleted ${deletedCount.deletedCount} old upload records`);
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
};

// Run cleanup every hour
setInterval(cleanupStaleUploads, 60 * 60 * 1000);
