# Video Link Upload - Complete Flow Example

## Step-by-Step Example

### Step 1: User Submits Video Link

**Frontend Request:**
```http
POST /api/v1/matches/65abc123def456/video-link HTTP/1.1
Host: api.padelize.ai
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "videoLink": "https://www.icloud.com/photos/0a1b2c3d4e5f6g7h8i9j"
}
```

**Backend Response:**
```json
{
  "status": "success",
  "message": "Video download initiated. You will be notified when it completes.",
  "data": {
    "matchId": "65abc123def456",
    "jobId": "job_xyz789abc",
    "jobStatus": "pending",
    "streamingStatus": "pending",
    "startedAt": "2026-01-15T10:30:00.000Z"
  }
}
```

**What Happens:**
1. Backend validates match exists and user is creator
2. Backend calls `streaming.padelize.ai/api/v1/jobs`:
   ```json
   {
     "link": "https://www.icloud.com/photos/0a1b2c3d4e5f6g7h8i9j",
     "webhookUrl": "https://api.padelize.ai/api/v1/webhooks/streaming"
   }
   ```
3. Streaming service returns: `{ "jobId": "job_xyz789abc", "status": "pending" }`
4. Backend saves to database:
   ```javascript
   match.streamingJobId = "job_xyz789abc"
   match.streamingStatus = "pending"
   match.streamingStartedAt = new Date()
   ```
5. User receives "Download Started" notification

---

### Step 2: Streaming Service Processes (Background)

- Streaming service downloads video from iCloud
- Uploads video to S3: `s3://padelize-videos/matches/65abc123def456.mp4`
- Takes 30 seconds to 5 minutes depending on video size

---

### Step 3: Webhook Callback (Automatic)

**Streaming Service → Backend:**
```http
POST /api/v1/webhooks/streaming HTTP/1.1
Host: api.padelize.ai
Content-Type: application/json
X-API-Key: streaming_webhook_key_abc123

{
  "jobId": "job_xyz789abc",
  "status": "completed",
  "s3Url": "https://s3.amazonaws.com/padelize-videos/matches/65abc123def456.mp4"
}
```

**Backend Processing:**
1. Receives webhook
2. Finds match: `Match.findOne({ streamingJobId: "job_xyz789abc" })`
3. Updates match:
   ```javascript
   match.video = "https://s3.amazonaws.com/padelize-videos/matches/65abc123def456.mp4"
   match.streamingStatus = "completed"
   match.streamingCompletedAt = new Date()
   ```
4. Sends "Download Complete" notification
5. **Automatically triggers player detection**:
   - Calls AI server: `POST /fetch_players/`
   - Gets back: `{ "player_detection_job_id": "pd_job_123" }`
   - Saves: `match.playerDetectionJobId = "pd_job_123"`
   - Sends "Player Detection Started" notification

**Backend Response to Streaming Service:**
```json
{
  "status": "success",
  "message": "Video download completed and processed",
  "data": {
    "matchId": "65abc123def456",
    "videoUrl": "https://s3.amazonaws.com/padelize-videos/matches/65abc123def456.mp4"
  }
}
```

---

### Step 4: Player Detection (Background Cron Job)

Every 3 minutes, cron job checks:
```javascript
Match.find({
  playerDetectionStatus: 'processing',
  playerDetectionRetryCount: { $lt: 10 }
})
```

For each match:
1. Calls AI server: `GET /fetch_players/status/?job_id=pd_job_123`
2. Gets status: `{ "processing_status": "completed", "players": [...] }`
3. Updates match with detected players
4. Sends "Player Detection Complete" notification

---

## Database State at Each Step

### After Step 1 (Video Link Submitted)
```json
{
  "_id": "65abc123def456",
  "creator": "user123",
  "video": null,
  "streamingJobId": "job_xyz789abc",
  "streamingStatus": "pending",
  "streamingStartedAt": "2026-01-15T10:30:00.000Z",
  "playerDetectionJobId": null,
  "playerDetectionStatus": "not_started"
}
```

### After Step 3 (Webhook Received)
```json
{
  "_id": "65abc123def456",
  "creator": "user123",
  "video": "https://s3.amazonaws.com/padelize-videos/matches/65abc123def456.mp4",
  "streamingJobId": "job_xyz789abc",
  "streamingStatus": "completed",
  "streamingStartedAt": "2026-01-15T10:30:00.000Z",
  "streamingCompletedAt": "2026-01-15T10:32:00.000Z",
  "playerDetectionJobId": "pd_job_123",
  "playerDetectionStatus": "processing",
  "playerDetectionStartedAt": "2026-01-15T10:32:00.000Z"
}
```

### After Step 4 (Player Detection Complete)
```json
{
  "_id": "65abc123def456",
  "creator": "user123",
  "video": "https://s3.amazonaws.com/padelize-videos/matches/65abc123def456.mp4",
  "streamingJobId": "job_xyz789abc",
  "streamingStatus": "completed",
  "streamingStartedAt": "2026-01-15T10:30:00.000Z",
  "streamingCompletedAt": "2026-01-15T10:32:00.000Z",
  "playerDetectionJobId": "pd_job_123",
  "playerDetectionStatus": "completed",
  "playerDetectionStartedAt": "2026-01-15T10:32:00.000Z",
  "playerDetectionCompletedAt": "2026-01-15T10:35:00.000Z",
  "players": [
    { "id": 0, "name": "Player 1", "position": [100, 200], "team": "blue" },
    { "id": 1, "name": "Player 2", "position": [300, 400], "team": "red" }
  ],
  "fetchedPlayerData": true
}
```

---

## Failure Case Example

### Webhook Body (Failed Download)
```json
{
  "jobId": "job_xyz789abc",
  "status": "failed",
  "error": "Invalid video link or download timeout"
}
```

### Backend Processing
1. Finds match by jobId
2. Updates:
   ```javascript
   match.streamingStatus = "failed"
   match.streamingError = "Invalid video link or download timeout"
   match.streamingCompletedAt = new Date()
   ```
3. Sends "Download Failed" notification to user
4. Does NOT trigger player detection

---

## Key Design Points

✅ **Why no matchId in webhook URL?**
- Streaming service doesn't know the matchId
- It only knows the jobId it created
- Backend uses `Match.findOne({ streamingJobId: jobId })` to find the match

✅ **Why store streamingJobId in database?**
- Allows webhook to find the correct match
- Provides audit trail
- Enables status checking

✅ **Security:**
- Job ID is unique and acts as verification
- Only the match with matching streamingJobId can be updated
- Streaming service uses API key for authentication

✅ **Automatic Player Detection:**
- Webhook handler automatically triggers player detection
- No manual step required
- User gets seamless experience

---

## Testing the Webhook

### Create Test Match First
```javascript
// In MongoDB or via API
{
  "_id": ObjectId("65abc123def456"),
  "streamingJobId": "test_job_123",
  "streamingStatus": "pending",
  "creator": ObjectId("user123")
}
```

### Send Test Webhook
```bash
curl -X POST http://localhost:8080/api/v1/webhooks/streaming \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "test_job_123",
    "status": "completed",
    "s3Url": "https://s3.amazonaws.com/test-bucket/test-video.mp4"
  }'
```

### Expected Response
```json
{
  "status": "success",
  "message": "Video download completed and processed",
  "data": {
    "matchId": "65abc123def456",
    "videoUrl": "https://s3.amazonaws.com/test-bucket/test-video.mp4"
  }
}
```

### Check Database
```javascript
// Match should now have:
{
  "video": "https://s3.amazonaws.com/test-bucket/test-video.mp4",
  "streamingStatus": "completed",
  "playerDetectionJobId": "pd_job_...",
  "playerDetectionStatus": "processing"
}
```
