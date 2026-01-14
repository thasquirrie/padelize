import { Schema, model } from 'mongoose';

const multipartUploadSchema = new Schema(
  {
    uploadId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'failed', 'aborted'],
      default: 'in_progress',
      index: true,
    },
    parts: [
      {
        partNumber: Number,
        etag: String,
        size: Number,
        uploadedAt: Date,
      },
    ],
    bucket: {
      type: String,
      default: process.env.S3_BUCKET_NAME,
    },
    // For match-specific uploads
    matchId: {
      type: Schema.Types.ObjectId,
      ref: 'Match',
      index: true,
    },
    // Metadata
    completedAt: Date,
    abortedAt: Date,
    lastAccessedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      index: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    },
  },
  {
    timestamps: true,
  }
);

// Index for cleanup of stale uploads
multipartUploadSchema.index({ status: 1, expiresAt: 1 });

// Update lastAccessedAt on every access
multipartUploadSchema.methods.touch = function () {
  this.lastAccessedAt = new Date();
  return this.save();
};

const MultipartUpload = model('MultipartUpload', multipartUploadSchema);

export default MultipartUpload;
