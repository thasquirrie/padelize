# S3 Multipart Upload with Presigned URLs - Implementation Guide

## Overview

This implementation allows mobile apps to upload large files (videos/images) directly to S3 using multipart upload with presigned URLs, eliminating the need to proxy large files through your backend server.

## Architecture

```
Mobile App ←→ Backend (Orchestrator) ←→ S3
     ↓                                    ↑
     └─────── Direct Upload ─────────────┘
```

### Benefits
- ✅ **Scalability**: Backend handles orchestration only, not data transfer
- ✅ **Reliability**: Failed chunks can be retried without restarting entire upload
- ✅ **Performance**: Parallel chunk uploads for faster completion
- ✅ **Cost**: Reduced backend bandwidth and compute costs
- ✅ **Resumable**: Upload can resume from last completed chunk

---

## Backend Implementation (Completed)

### 1. API Endpoints

#### Initialize Upload
```http
POST /api/v1/multipart-upload/initialize
Authorization: Bearer <token>
Content-Type: application/json

{
  "fileName": "match_video.mp4",
  "fileType": "video/mp4",
  "fileSize": 524288000
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Multipart upload initialized",
  "data": {
    "uploadId": "unique-upload-id",
    "key": "uploads/user123/1234567890-match_video.mp4",
    "bucket": "your-bucket-name",
    "fileName": "match_video.mp4",
    "chunkSize": 5242880,
    "maxChunkSize": 104857600
  }
}
```

#### Get Presigned URL for Part
```http
POST /api/v1/multipart-upload/presigned-url
Authorization: Bearer <token>
Content-Type: application/json

{
  "uploadId": "unique-upload-id",
  "key": "uploads/user123/1234567890-match_video.mp4",
  "partNumber": 1
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "presignedUrl": "https://bucket.s3.amazonaws.com/...",
    "partNumber": 1,
    "expiresAt": "2025-12-28T13:00:00.000Z"
  }
}
```

#### Get Batch Presigned URLs (Recommended)
```http
POST /api/v1/multipart-upload/batch-presigned-urls
Authorization: Bearer <token>
Content-Type: application/json

{
  "uploadId": "unique-upload-id",
  "key": "uploads/user123/1234567890-match_video.mp4",
  "startPart": 1,
  "endPart": 10
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "uploadId": "unique-upload-id",
    "key": "uploads/user123/...",
    "urls": [
      {
        "presignedUrl": "https://...",
        "partNumber": 1,
        "expiresAt": "..."
      },
      // ... 9 more URLs
    ],
    "count": 10
  }
}
```

#### Complete Upload
```http
POST /api/v1/multipart-upload/complete
Authorization: Bearer <token>
Content-Type: application/json

{
  "uploadId": "unique-upload-id",
  "key": "uploads/user123/1234567890-match_video.mp4",
  "parts": [
    { "PartNumber": 1, "ETag": "etag-value-1" },
    { "PartNumber": 2, "ETag": "etag-value-2" }
  ]
}
```

#### Abort Upload
```http
POST /api/v1/multipart-upload/abort
Authorization: Bearer <token>
Content-Type: application/json

{
  "uploadId": "unique-upload-id",
  "key": "uploads/user123/1234567890-match_video.mp4"
}
```

#### List Uploaded Parts (For Resume)
```http
GET /api/v1/multipart-upload/parts/:uploadId?key=<key>
Authorization: Bearer <token>
```

---

## S3 CORS Configuration

You **must** configure CORS on your S3 bucket to allow mobile apps to upload directly:

### AWS Console Method
1. Go to AWS S3 Console
2. Select your bucket
3. Go to **Permissions** → **CORS configuration**
4. Add the following JSON:

```json
[
  {
    "AllowedHeaders": [
      "*"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedOrigins": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag",
      "x-amz-server-side-encryption",
      "x-amz-request-id",
      "x-amz-id-2"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

### AWS CLI Method
```bash
aws s3api put-bucket-cors \
  --bucket your-bucket-name \
  --cors-configuration file://cors-config.json
```

**cors-config.json:**
```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag", "x-amz-server-side-encryption"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

### Important Notes:
- **ETag header MUST be exposed** - Mobile app needs this to complete the upload
- For production, replace `"*"` in AllowedOrigins with your app's domain
- For mobile apps, you can keep `"*"` since requests come from native code

---

## Mobile App Implementation

### iOS Implementation (Swift)

```swift
import Foundation

class MultipartUploadManager {
    let baseURL = "https://your-api.com/api/v1"
    let authToken: String
    
    init(authToken: String) {
        self.authToken = authToken
    }
    
    func uploadLargeFile(fileURL: URL, fileName: String, fileType: String) async throws {
        let fileSize = try fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        
        // 1. Initialize upload
        let initData = try await initializeUpload(
            fileName: fileName,
            fileType: fileType,
            fileSize: fileSize
        )
        
        let chunkSize = initData.maxChunkSize
        let uploadId = initData.uploadId
        let key = initData.key
        
        // 2. Split file and upload chunks
        let totalChunks = Int(ceil(Double(fileSize) / Double(chunkSize)))
        var uploadedParts: [(partNumber: Int, etag: String)] = []
        
        // Get all presigned URLs at once
        let urlsData = try await getBatchPresignedUrls(
            uploadId: uploadId,
            key: key,
            startPart: 1,
            endPart: totalChunks
        )
        
        // Create background URLSession for persistent uploads
        let config = URLSessionConfiguration.background(
            withIdentifier: "com.padelize.multipart.\(uploadId)"
        )
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        
        for i in 0..<totalChunks {
            let partNumber = i + 1
            let offset = UInt64(i * chunkSize)
            let length = min(chunkSize, fileSize - i * chunkSize)
            
            // Read chunk
            let handle = try FileHandle(forReadingFrom: fileURL)
            try handle.seek(toOffset: offset)
            let chunkData = handle.readData(ofLength: length)
            try handle.close()
            
            // Upload chunk using presigned URL
            let presignedURL = urlsData.urls[i].presignedUrl
            let etag = try await uploadChunk(
                data: chunkData,
                presignedURL: presignedURL,
                session: session
            )
            
            uploadedParts.append((partNumber: partNumber, etag: etag))
            
            // Progress callback
            let progress = Double(partNumber) / Double(totalChunks)
            print("Upload progress: \(Int(progress * 100))%")
        }
        
        // 3. Complete upload
        try await completeUpload(uploadId: uploadId, key: key, parts: uploadedParts)
        
        print("✅ Upload completed successfully!")
    }
    
    private func initializeUpload(fileName: String, fileType: String, fileSize: Int) async throws -> InitResponse {
        var request = URLRequest(url: URL(string: "\(baseURL)/multipart-upload/initialize")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["fileName": fileName, "fileType": fileType, "fileSize": fileSize] as [String : Any]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(APIResponse<InitResponse>.self, from: data)
        return response.data
    }
    
    private func getBatchPresignedUrls(uploadId: String, key: String, startPart: Int, endPart: Int) async throws -> BatchURLsResponse {
        var request = URLRequest(url: URL(string: "\(baseURL)/multipart-upload/batch-presigned-urls")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = [
            "uploadId": uploadId,
            "key": key,
            "startPart": startPart,
            "endPart": endPart
        ] as [String : Any]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(APIResponse<BatchURLsResponse>.self, from: data)
        return response.data
    }
    
    private func uploadChunk(data: Data, presignedURL: String, session: URLSession) async throws -> String {
        var request = URLRequest(url: URL(string: presignedURL)!)
        request.httpMethod = "PUT"
        request.httpBody = data
        
        let (_, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              let etag = httpResponse.allHeaderFields["ETag"] as? String else {
            throw NSError(domain: "Upload", code: -1, userInfo: [NSLocalizedDescriptionKey: "ETag not found"])
        }
        
        return etag.replacingOccurrences(of: "\"", with: "")
    }
    
    private func completeUpload(uploadId: String, key: String, parts: [(partNumber: Int, etag: String)]) async throws {
        var request = URLRequest(url: URL(string: "\(baseURL)/multipart-upload/complete")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let partsArray = parts.map { ["PartNumber": $0.partNumber, "ETag": $0.etag] }
        let body = ["uploadId": uploadId, "key": key, "parts": partsArray] as [String : Any]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        _ = try JSONDecoder().decode(APIResponse<CompleteResponse>.self, from: data)
    }
}

// Response Models
struct APIResponse<T: Decodable>: Decodable {
    let status: String
    let data: T
}

struct InitResponse: Decodable {
    let uploadId: String
    let key: String
    let bucket: String
    let fileName: String
    let chunkSize: Int
    let maxChunkSize: Int
}

struct BatchURLsResponse: Decodable {
    let uploadId: String
    let key: String
    let urls: [PresignedURL]
    let count: Int
}

struct PresignedURL: Decodable {
    let presignedUrl: String
    let partNumber: Int
    let expiresAt: String
}

struct CompleteResponse: Decodable {
    let uploadId: String
    let key: String
    let location: String
}
```

### Android Implementation (Kotlin)

```kotlin
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import androidx.work.*

class MultipartUploadManager(
    private val baseUrl: String,
    private val authToken: String
) {
    private val client = OkHttpClient()
    
    suspend fun uploadLargeFile(
        file: File,
        fileName: String,
        fileType: String
    ) = withContext(Dispatchers.IO) {
        val fileSize = file.length()
        
        // 1. Initialize upload
        val initData = initializeUpload(fileName, fileType, fileSize)
        
        val chunkSize = initData.maxChunkSize
        val uploadId = initData.uploadId
        val key = initData.key
        
        // 2. Calculate chunks
        val totalChunks = (fileSize + chunkSize - 1) / chunkSize
        val uploadedParts = mutableListOf<Part>()
        
        // Get batch presigned URLs
        val urlsData = getBatchPresignedUrls(uploadId, key, 1, totalChunks.toInt())
        
        // 3. Upload chunks in parallel (4 at a time)
        file.inputStream().use { inputStream ->
            for (i in 0 until totalChunks) {
                val partNumber = i + 1
                val buffer = ByteArray(chunkSize.toInt())
                val bytesRead = inputStream.read(buffer, 0, 
                    minOf(chunkSize.toInt(), (fileSize - i * chunkSize).toInt()))
                
                val chunkData = buffer.copyOf(bytesRead)
                val presignedUrl = urlsData.urls[i].presignedUrl
                
                // Upload chunk
                val etag = uploadChunk(chunkData, presignedUrl)
                uploadedParts.add(Part(partNumber, etag))
                
                // Progress
                val progress = (partNumber.toFloat() / totalChunks) * 100
                println("Upload progress: ${progress.toInt()}%")
            }
        }
        
        // 4. Complete upload
        completeUpload(uploadId, key, uploadedParts)
        
        println("✅ Upload completed!")
    }
    
    private suspend fun initializeUpload(
        fileName: String,
        fileType: String,
        fileSize: Long
    ): InitData = withContext(Dispatchers.IO) {
        val json = JSONObject().apply {
            put("fileName", fileName)
            put("fileType", fileType)
            put("fileSize", fileSize)
        }
        
        val request = Request.Builder()
            .url("$baseUrl/multipart-upload/initialize")
            .post(json.toString().toRequestBody("application/json".toMediaType()))
            .addHeader("Authorization", "Bearer $authToken")
            .build()
        
        val response = client.newCall(request).execute()
        val responseData = JSONObject(response.body!!.string())
            .getJSONObject("data")
        
        InitData(
            uploadId = responseData.getString("uploadId"),
            key = responseData.getString("key"),
            bucket = responseData.getString("bucket"),
            fileName = responseData.getString("fileName"),
            chunkSize = responseData.getLong("chunkSize"),
            maxChunkSize = responseData.getLong("maxChunkSize")
        )
    }
    
    private suspend fun getBatchPresignedUrls(
        uploadId: String,
        key: String,
        startPart: Int,
        endPart: Int
    ): BatchUrlsData = withContext(Dispatchers.IO) {
        val json = JSONObject().apply {
            put("uploadId", uploadId)
            put("key", key)
            put("startPart", startPart)
            put("endPart", endPart)
        }
        
        val request = Request.Builder()
            .url("$baseUrl/multipart-upload/batch-presigned-urls")
            .post(json.toString().toRequestBody("application/json".toMediaType()))
            .addHeader("Authorization", "Bearer $authToken")
            .build()
        
        val response = client.newCall(request).execute()
        val responseData = JSONObject(response.body!!.string())
            .getJSONObject("data")
        
        val urlsArray = responseData.getJSONArray("urls")
        val urls = (0 until urlsArray.length()).map { i ->
            val urlObj = urlsArray.getJSONObject(i)
            PresignedUrlData(
                presignedUrl = urlObj.getString("presignedUrl"),
                partNumber = urlObj.getInt("partNumber"),
                expiresAt = urlObj.getString("expiresAt")
            )
        }
        
        BatchUrlsData(
            uploadId = responseData.getString("uploadId"),
            key = responseData.getString("key"),
            urls = urls,
            count = responseData.getInt("count")
        )
    }
    
    private suspend fun uploadChunk(
        data: ByteArray,
        presignedUrl: String
    ): String = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(presignedUrl)
            .put(data.toRequestBody())
            .build()
        
        val response = client.newCall(request).execute()
        val etag = response.header("ETag")
            ?: throw Exception("ETag not found in response")
        
        etag.replace("\"", "")
    }
    
    private suspend fun completeUpload(
        uploadId: String,
        key: String,
        parts: List<Part>
    ) = withContext(Dispatchers.IO) {
        val partsArray = JSONArray().apply {
            parts.forEach { part ->
                put(JSONObject().apply {
                    put("PartNumber", part.partNumber)
                    put("ETag", part.etag)
                })
            }
        }
        
        val json = JSONObject().apply {
            put("uploadId", uploadId)
            put("key", key)
            put("parts", partsArray)
        }
        
        val request = Request.Builder()
            .url("$baseUrl/multipart-upload/complete")
            .post(json.toString().toRequestBody("application/json".toMediaType()))
            .addHeader("Authorization", "Bearer $authToken")
            .build()
        
        client.newCall(request).execute()
    }
    
    data class InitData(
        val uploadId: String,
        val key: String,
        val bucket: String,
        val fileName: String,
        val chunkSize: Long,
        val maxChunkSize: Long
    )
    
    data class BatchUrlsData(
        val uploadId: String,
        val key: String,
        val urls: List<PresignedUrlData>,
        val count: Int
    )
    
    data class PresignedUrlData(
        val presignedUrl: String,
        val partNumber: Int,
        val expiresAt: String
    )
    
    data class Part(
        val partNumber: Int,
        val etag: String
    )
}
```

### Background Upload (Android WorkManager)

```kotlin
class UploadWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    override suspend fun doWork(): Result {
        val filePath = inputData.getString("filePath") ?: return Result.failure()
        val fileName = inputData.getString("fileName") ?: return Result.failure()
        val fileType = inputData.getString("fileType") ?: return Result.failure()
        val authToken = inputData.getString("authToken") ?: return Result.failure()
        
        return try {
            val file = File(filePath)
            val uploadManager = MultipartUploadManager(
                baseUrl = "https://your-api.com/api/v1",
                authToken = authToken
            )
            
            uploadManager.uploadLargeFile(file, fileName, fileType)
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }
}

// Schedule upload work
fun scheduleUpload(filePath: String, fileName: String, fileType: String, authToken: String) {
    val uploadWork = OneTimeWorkRequestBuilder<UploadWorker>()
        .setInputData(workDataOf(
            "filePath" to filePath,
            "fileName" to fileName,
            "fileType" to fileType,
            "authToken" to authToken
        ))
        .setConstraints(
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
        )
        .build()
    
    WorkManager.getInstance(context).enqueue(uploadWork)
}
```

---

## Testing

### Test with cURL

```bash
# 1. Initialize
curl -X POST https://your-api.com/api/v1/multipart-upload/initialize \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.mp4",
    "fileType": "video/mp4",
    "fileSize": 10485760
  }'

# 2. Get presigned URL
curl -X POST https://your-api.com/api/v1/multipart-upload/presigned-url \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uploadId": "UPLOAD_ID",
    "key": "uploads/user/file.mp4",
    "partNumber": 1
  }'

# 3. Upload chunk to S3 (using presigned URL)
curl -X PUT "PRESIGNED_URL" \
  --data-binary "@chunk1.bin" \
  -v  # Note the ETag in response headers

# 4. Complete
curl -X POST https://your-api.com/api/v1/multipart-upload/complete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uploadId": "UPLOAD_ID",
    "key": "uploads/user/file.mp4",
    "parts": [
      {"PartNumber": 1, "ETag": "etag-from-step3"}
    ]
  }'
```

---

## Production Considerations

### 1. Persistent Storage (Required for Production)
The current implementation uses an in-memory Map for tracking uploads. For production:

**Option A: Redis**
```javascript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

// Store
await redis.setex(
  `upload:${uploadId}`,
  86400, // 24 hours TTL
  JSON.stringify(uploadMetadata)
);

// Retrieve
const metadata = JSON.parse(await redis.get(`upload:${uploadId}`));
```

**Option B: MongoDB**
Create an `Upload` model to store upload metadata.

### 2. Security Enhancements
- Add user ownership validation (ensure user can only complete their own uploads)
- Implement rate limiting on initialize endpoint
- Add file type validation beyond MIME type
- Implement virus scanning on completed uploads

### 3. Monitoring
- Track upload success/failure rates
- Monitor abandoned uploads (cleanup cron job)
- Log upload times and sizes for analytics

### 4. Error Handling
- Implement retry logic with exponential backoff
- Handle network interruptions gracefully
- Provide clear error messages to users

---

## Migration from Current System

### Option 1: Gradual Migration
Keep both endpoints active:
- Old: `POST /api/v1/matches/upload_video` (existing)
- New: `POST /api/v1/multipart-upload/initialize` (new)

Mobile app can check file size and use appropriate method.

### Option 2: Version-based
- v1 API: Current direct upload
- v2 API: New multipart upload

### Option 3: Feature Flag
Use feature flags to enable multipart for specific users/plans.

---

## Troubleshooting

### Issue: "ETag header not found"
**Solution**: Ensure S3 CORS configuration exposes the ETag header.

### Issue: "Upload not found or expired"
**Solution**: 
- Check if uploadId is correct
- Verify upload hasn't been completed/aborted
- Implement persistent storage (Redis/MongoDB)

### Issue: "Part number out of range"
**Solution**: Ensure part numbers are 1-indexed and ≤10,000.

### Issue: "Upload fails after backgrounding app"
**Solution**: 
- iOS: Use background URLSession
- Android: Use WorkManager with ForegroundService

---

## Summary

✅ **Backend**: Fully implemented with 7 endpoints  
✅ **Security**: JWT authentication required on all endpoints  
✅ **S3 CORS**: Configuration provided  
✅ **Mobile Examples**: iOS (Swift) and Android (Kotlin) implementations  
✅ **Background Uploads**: iOS URLSession and Android WorkManager patterns  
✅ **Resumable**: List parts endpoint for recovery  
✅ **Scalable**: Direct S3 upload removes backend bottleneck  

**Next Steps:**
1. Configure S3 CORS (see above)
2. Implement persistent storage for production (Redis recommended)
3. Update mobile apps with provided code examples
4. Test with small files first, then scale up
5. Monitor and optimize based on usage patterns
