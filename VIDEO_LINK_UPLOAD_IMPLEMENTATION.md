# Video Link Upload Implementation

## Overview

This implementation adds support for uploading match videos via external links (iCloud, Google Photos, Dropbox, etc.) instead of direct uploads. The system uses `streaming.padelize.ai` service to download videos from these links and upload them to S3.

## Architecture

### Flow

1. **Frontend** → Sends video link to backend
2. **Backend** → Creates download job at `streaming.padelize.ai`
3. **Streaming Service** → Downloads video and uploads to S3
4. **Streaming Service** → Sends webhook to backend when complete
5. **Backend** → Updates match with S3 URL
6. **Backend** → Automatically triggers player detection

### Components

#### 1. Match Model Updates

- **File**: `src/models/Match.js`
- **New Fields**:
  - `streamingJobId`: Job ID from streaming service
  - `streamingStatus`: Status of download (not_started, pending, completed, failed)
  - `streamingStartedAt`: When download started
  - `streamingCompletedAt`: When download completed/failed
  - `streamingError`: Error message if failed

#### 2. Streaming Service

- **File**: `src/services/streamingService.js`
- **Methods**:
  - `createDownloadJob(videoLink, matchId)`: Create download job
  - `getJobStatus(jobId)`: Get job status
- **Environment Variables**:
  - `STREAMING_API_BASE_URL`: Base URL (default: https://streaming.padelize.ai)
  - `STREAMING_API_KEY`: API key for authentication
  - `BACKEND_BASE_URL`: Backend URL for webhooks (default: https://api.padelize.ai)

#### 3. Webhook Handler

- **File**: `src/controllers/streamingWebhookController.js`
- **Route**: `POST /api/v1/webhooks/streaming`
- **How it works**:
  - Streaming service sends webhook with `jobId` in body
  - Backend finds match using `Match.findOne({ streamingJobId: jobId })`
  - No `matchId` needed in URL since streaming service doesn't know it
- **Features**:
  - Validates webhook payload
  - Finds match by job ID
  - Updates match with video URL
  - Automatically triggers player detection
  - Sends notifications to user

#### 4. Match Controller & Service

- **Files**:
  - `src/controllers/matchController.js`
  - `src/services/matchService.js`
- **New Endpoint**: `POST /api/v1/matches/:matchId/video-link`
- **Request Body**:
  ```json
  {
    "videoLink": "https://www.icloud.com/photos/..."
  }
  ```
- **Response**:
  ```json
  {
    "status": "success",
    "message": "Video download initiated. You will be notified when it completes.",
    "data": {
      "matchId": "...",
      "jobId": "123",
      "jobStatus": "pending",
      "streamingStatus": "pending",
      "startedAt": "2026-01-15T..."
    }
  }
  ```

#### 5. Notification Service Updates

- **File**: `src/services/matchNotificationService.js`
- **New Methods**:
  - `notifyVideoDownloadStarted()`: Notify when download starts
  - `notifyMatchVideoReady()`: Notify when download completes
  - `notifyMatchVideoFailed()`: Notify when download fails
  - `notifyPlayerDetectionStarted()`: Notify when player detection starts

#### 6. Routes

- **File**: `src/routes/matchRoutes.js`
  - Added: `POST /:matchId/video-link`
- **File**: `src/routes/streamingWebhookRoutes.js` (NEW)
  - Added: `POST /streaming` (no matchId - uses jobId from body)
- **File**: `app.js`
  - Registered: `/api/v1/webhooks` route

## API Documentation

### Submit Video Link

**Endpoint**: `POST /api/v1/matches/:matchId/video-link`

**Authentication**: Required (JWT token)

**Request Body**:

```json
{
  "videoLink": "https://www.icloud.com/photos/..."
}
```

**Success Response** (202 Accepted):

```json
{
  "status": "success",
  "message": "Video download initiated. You will be notified when it completes.",
  "data": {
    "matchId": "65abc123...",
    "jobId": "123",
    "jobStatus": "pending",
    "streamingStatus": "pending",
    "startedAt": "2026-01-15T10:30:00.000Z"
  }
}
```

**Error Responses**:

- `400`: Missing videoLink or match already has video
- `404`: Match not found or not creator
- `500`: Failed to create download job

### Webhook Endpoint

**Endpoint**: `POST /api/v1/webhooks/streaming`

**Authentication**: None (verified by finding match with matching jobId)

**How it works**:

- Streaming service only knows the `jobId`, not the `matchId`
- Backend finds match using: `Match.findOne({ streamingJobId: jobId })`
- This is why we store `streamingJobId` in the Match model

**Request Body** (sent by streaming.padelize.ai):

Success case:

```json
{
  "jobId": "123",
  "status": "completed",
  "s3Url": "https://s3.amazonaws.com/bucket/video.mp4"
}
```

Failure case:

```json
{
  "jobId": "123",
  "status": "failed",
  "error": "Download timeout"
}
```

**Response** (200 OK):

```json
{
  "status": "success",
  "message": "Video download completed and processed",
  "data": {
    "matchId": "65abc123...",
    "videoUrl": "https://s3.amazonaws.com/..."
  }
}
```

## Environment Configuration

Add these variables to your `.env` file:

```bash
# Streaming Service Configuration
STREAMING_API_BASE_URL=https://streaming.padelize.ai
STREAMING_API_KEY=your_streaming_api_key_here
BACKEND_BASE_URL=https://api.padelize.ai
```

## Frontend Integration

### Example Usage

```javascript
// After creating a match
const matchId = '65abc123...';
const videoLink = 'https://www.icloud.com/photos/...';

try {
  const response = await fetch(
    `https://api.padelize.ai/api/v1/matches/${matchId}/video-link`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ videoLink }),
    }
  );

  const data = await response.json();

  if (data.status === 'success') {
    // Show success message
    console.log('Video download started:', data.data.jobId);
    // User will receive push notification when complete
  }
} catch (error) {
  console.error('Failed to submit video link:', error);
}
```

## Notifications Flow

1. **Download Started**: User receives notification when job is created
2. **Download Complete**: User receives notification with video ready
3. **Player Detection Started**: User receives notification that detection began
4. **Player Detection Complete**: User receives notification with detected players
5. **Any Failure**: User receives notification with error message

## Database Queries

### Check Pending Downloads

```javascript
const pendingDownloads = await Match.find({
  streamingStatus: 'pending',
  streamingStartedAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
});
```

### Get Match with Streaming Status

```javascript
const match = await Match.findById(matchId).select(
  '+streamingJobId +streamingStatus +streamingError'
);
```

## Error Handling

### Common Errors

1. **Invalid Video Link**: Streaming service returns 400
2. **Download Timeout**: Webhook with failed status
3. **Network Issues**: Retry mechanism in streaming service
4. **Invalid API Key**: 403 Forbidden from streaming service

### Monitoring

Check logs for:

- `Creating streaming download job`
- `Streaming download job created`
- `Streaming webhook received`
- `Video download completed`
- `Failed to initiate player detection`

## Testing

### Manual Testing

1. Create a match
2. Submit video link:
   ```bash
   curl -X POST https://api.padelize.ai/api/v1/matches/MATCH_ID/video-link \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"videoLink": "https://www.icloud.com/photos/..."}'
   ```
3. Check match status:
   ```bash
   curl https://api.padelize.ai/api/v1/matches/MATCH_ID \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```
4. Verify webhook received (check logs)
5. Verify video URL updated in match
6. Verify player detection triggered

### Test Webhook Locally

```bash
curl -X POST http://localhost:8080/api/v1/webhooks/streaming \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "test-job-123",
    "status": "completed",
    "s3Url": "https://s3.amazonaws.com/test-video.mp4"
  }'
```

**Note**: Make sure a match exists with `streamingJobId: "test-job-123"` in the database first.

## Migration Notes

### For Existing Matches

Existing matches using direct upload continue to work. This is an additional upload method, not a replacement.

### Backward Compatibility

- Old upload endpoints remain unchanged
- Multipart upload still supported
- Legacy single file upload still works

## Security Considerations

1. **Webhook Verification**: Job ID must match stored value
2. **API Key**: Streaming API key stored securely in environment variables
3. **User Authorization**: Only match creator can submit video link
4. **URL Validation**: Streaming service validates video URLs

## Performance

- **Async Processing**: No blocking API calls
- **Webhook Callbacks**: Instant notification when complete
- **Automatic Player Detection**: Triggers immediately after download
- **Notification System**: Multi-channel (push, in-app, WebSocket)

## Future Enhancements

1. Add progress tracking for downloads
2. Support batch video link submissions
3. Add retry mechanism for failed downloads
4. Implement download cancellation
5. Add video preview before processing
6. Support more video platforms

## Support

For issues or questions:

- Check logs in `logs/` directory
- Review webhook logs at `/api/v1/webhook-logs`
- Contact streaming.padelize.ai support for API issues
