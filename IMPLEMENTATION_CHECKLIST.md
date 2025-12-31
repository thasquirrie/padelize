# S3 Multipart Upload - Implementation Checklist

## ✅ Backend Implementation (COMPLETED)

- [x] Install required packages (`@aws-sdk/s3-request-presigner`)
- [x] Create multipart upload service
- [x] Create multipart upload controller
- [x] Create multipart upload routes
- [x] Integrate routes into Express app
- [x] Add authentication middleware to all endpoints
- [x] Implement error handling
- [x] Add automatic cleanup for stale uploads

### Files Created/Modified:
- ✅ `src/services/multipartUploadService.js` (NEW)
- ✅ `src/controllers/multipartUploadController.js` (NEW)
- ✅ `src/routes/multipartUploadRoutes.js` (NEW)
- ✅ `app.js` (MODIFIED - added routes)
- ✅ `package.json` (MODIFIED - added presigner package)

---

## ⏳ AWS S3 Configuration (TODO - CRITICAL)

### Step 1: Configure CORS on S3 Bucket

**Why?** Mobile apps need permission to upload directly to S3.

**How:**
1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Select your bucket: `${process.env.S3_BUCKET_NAME}`
3. Click **Permissions** tab
4. Scroll to **Cross-origin resource sharing (CORS)**
5. Click **Edit**
6. Paste the following JSON:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag", "x-amz-server-side-encryption", "x-amz-request-id"],
    "MaxAgeSeconds": 3600
  }
]
```

7. Click **Save changes**

**⚠️ CRITICAL:** The `ExposeHeaders` array MUST include `"ETag"` - mobile apps need this to complete uploads.

**For Production:** Replace `"*"` in `AllowedOrigins` with your specific domain if using web apps. For mobile apps, `"*"` is fine.

### Step 2: Verify IAM Permissions

Ensure your AWS credentials have these S3 permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name/*",
        "arn:aws:s3:::your-bucket-name"
      ]
    }
  ]
}
```

---

## ⏳ Backend Testing (TODO)

### Test 1: Initialize Upload
```bash
curl -X POST http://localhost:3000/api/v1/multipart-upload/initialize \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.mp4",
    "fileType": "video/mp4",
    "fileSize": 10485760
  }'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Multipart upload initialized",
  "data": {
    "uploadId": "...",
    "key": "uploads/...",
    "bucket": "...",
    "chunkSize": 5242880,
    "maxChunkSize": 104857600
  }
}
```

### Test 2: Get Presigned URL
```bash
curl -X POST http://localhost:3000/api/v1/multipart-upload/presigned-url \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uploadId": "UPLOAD_ID_FROM_STEP_1",
    "key": "KEY_FROM_STEP_1",
    "partNumber": 1
  }'
```

**Expected Response:**
```json
{
  "status": "success",
  "data": {
    "presignedUrl": "https://your-bucket.s3.amazonaws.com/...",
    "partNumber": 1,
    "expiresAt": "2025-12-28T13:00:00.000Z"
  }
}
```

### Test 3: Upload to S3
```bash
# Create a test file
dd if=/dev/urandom of=test_chunk.bin bs=1M count=5

# Upload using presigned URL
curl -X PUT "PRESIGNED_URL_FROM_STEP_2" \
  --data-binary "@test_chunk.bin" \
  -v
```

**Look for:** `ETag: "..."` in response headers

### Test 4: Complete Upload
```bash
curl -X POST http://localhost:3000/api/v1/multipart-upload/complete \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uploadId": "UPLOAD_ID",
    "key": "KEY",
    "parts": [
      {"PartNumber": 1, "ETag": "ETAG_FROM_STEP_3"}
    ]
  }'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Upload completed successfully",
  "data": {
    "uploadId": "...",
    "key": "...",
    "location": "https://...",
    "etag": "...",
    "fileName": "test.mp4",
    "fileSize": 10485760,
    "totalParts": 1
  }
}
```

---

## ⏳ Production Readiness (TODO)

### Priority 1: Implement Persistent Storage

**Current Issue:** Upload state is stored in-memory (Map). Server restart = lost uploads.

**Solution: Add Redis**

```bash
# Install Redis client
npm install ioredis
```

Then modify `src/services/multipartUploadService.js`:

```javascript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Replace activeUploads.set() with:
await redis.setex(
  `upload:${uploadId}`,
  86400, // 24 hours TTL
  JSON.stringify(uploadMetadata)
);

// Replace activeUploads.get() with:
const data = await redis.get(`upload:${uploadId}`);
const uploadMetadata = data ? JSON.parse(data) : null;

// Replace activeUploads.delete() with:
await redis.del(`upload:${uploadId}`);
```

### Priority 2: Add Monitoring

Add logging/metrics for:
- Upload initialization rate
- Completion rate
- Failure rate
- Average upload time
- Average file size
- Abandoned uploads

### Priority 3: Security Enhancements

1. **Rate Limiting:**
```javascript
import rateLimit from 'express-rate-limit';

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 uploads per 15 minutes
  message: 'Too many upload attempts, please try again later'
});

router.post('/initialize', uploadLimiter, initializeUpload);
```

2. **User Ownership Validation:**
```javascript
// In completeUpload controller
const uploadMetadata = await getUploadMetadata(uploadId);
if (uploadMetadata.userId !== req.user.id) {
  throw new AppError('Unauthorized', 403);
}
```

3. **File Size Limits by Subscription:**
```javascript
// In initializeUpload controller
const maxSize = req.user.subscription === 'premium' 
  ? 10 * 1024 * 1024 * 1024  // 10GB
  : 2 * 1024 * 1024 * 1024;   // 2GB

if (fileSize > maxSize) {
  throw new AppError('File size exceeds plan limit', 400);
}
```

---

## ⏳ Mobile App Implementation (TODO)

### iOS (Swift)
- [ ] Copy code from `MULTIPART_UPLOAD_GUIDE.md` (search for "iOS Implementation")
- [ ] Implement `MultipartUploadManager` class
- [ ] Add background URLSession support
- [ ] Implement resume functionality
- [ ] Add progress callbacks
- [ ] Test with various file sizes

### Android (Kotlin)
- [ ] Copy code from `MULTIPART_UPLOAD_GUIDE.md` (search for "Android Implementation")
- [ ] Implement `MultipartUploadManager` class
- [ ] Add WorkManager for background uploads
- [ ] Implement resume functionality
- [ ] Add progress notifications
- [ ] Test with various file sizes

---

## ⏳ Deployment Checklist

### Before Deploying to Production:

- [ ] Configure S3 CORS (CRITICAL!)
- [ ] Test all endpoints thoroughly
- [ ] Implement Redis for state persistence
- [ ] Add monitoring and logging
- [ ] Set up alerts for failed uploads
- [ ] Document API for mobile team
- [ ] Create Postman collection for testing
- [ ] Test with production-like file sizes
- [ ] Load test with multiple concurrent uploads
- [ ] Set up cleanup cron job for abandoned uploads

### Environment Variables to Set:

```bash
# Already have these:
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
S3_BUCKET_NAME=your-bucket

# May need to add:
REDIS_URL=redis://localhost:6379  # For production persistence
```

---

## Testing Scenarios

### Test Case 1: Small File (< 5MB)
- Single part upload
- Quick completion
- Verify file appears in S3

### Test Case 2: Large File (> 100MB)
- Multiple parts
- Test parallel uploads
- Verify all parts merged correctly

### Test Case 3: Resume Upload
- Start upload
- Abort halfway
- Call `/parts/:uploadId` to get completed parts
- Resume from where it stopped

### Test Case 4: Timeout Handling
- Start upload with presigned URL
- Wait > 1 hour (URL expires)
- Request new presigned URL
- Complete upload

### Test Case 5: Concurrent Uploads
- Start 10 uploads simultaneously
- Verify all complete successfully
- Check backend memory usage

---

## Migration Plan

### Phase 1: Backend Ready (CURRENT)
- ✅ Implementation complete
- ⏳ S3 CORS configuration
- ⏳ Backend testing
- ⏳ Documentation review

### Phase 2: Mobile Development (1-2 weeks)
- Implement iOS multipart upload
- Implement Android multipart upload
- Add background upload support
- Internal testing

### Phase 3: Beta Testing (1 week)
- Deploy to beta users
- Monitor errors and performance
- Collect feedback
- Fix issues

### Phase 4: Gradual Rollout (2 weeks)
- 10% of users
- 50% of users
- 100% of users
- Keep old endpoint as fallback during this phase

### Phase 5: Full Migration (After successful rollout)
- Remove old upload endpoint
- All uploads use multipart
- Monitor and optimize

---

## Success Metrics

Track these to measure success:

1. **Upload Success Rate**: Should increase (retryable chunks)
2. **Backend CPU Usage**: Should decrease (no file processing)
3. **Backend Memory Usage**: Should decrease (no buffering)
4. **Upload Time**: May decrease (parallel chunks)
5. **User Complaints**: Should decrease (better reliability)
6. **Cost**: Backend bandwidth costs should decrease

---

## Rollback Plan

If issues occur:

1. **Quick Rollback:**
   - Remove multipart routes from `app.js`
   - Restart backend
   - Old endpoint still works

2. **Mobile App Fallback:**
   - Keep old upload code in mobile apps
   - Add feature flag to switch between methods
   - Can disable remotely without app update

---

## Support Resources

- **Full Implementation Guide**: `MULTIPART_UPLOAD_GUIDE.md`
- **Quick Summary**: `MULTIPART_UPLOAD_SUMMARY.md`
- **This Checklist**: `IMPLEMENTATION_CHECKLIST.md`

---

## Current Status

✅ **COMPLETED:**
- Backend API implementation
- Routes and controllers
- Error handling
- Documentation

⏳ **NEXT STEPS:**
1. Configure S3 CORS (5 minutes)
2. Test backend endpoints (30 minutes)
3. Implement Redis persistence (1 day)
4. Start mobile app implementation

---

**Questions?** See `MULTIPART_UPLOAD_GUIDE.md` for detailed explanations.
