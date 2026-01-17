# Postman Setup Guide for Job Status API

## Files Updated
- ✅ `Padelize.postman_collection.json` - Added "Get Job Status" endpoint to Match section
- ✅ `Padelize.postman_environment.json` - Created with API_KEY variable

## Import to Postman

### 1. Import Collection
1. Open Postman
2. Click **Import** button (top left)
3. Select `Padelize.postman_collection.json`
4. Click **Import**

### 2. Import Environment
1. Click **Import** button again
2. Select `Padelize.postman_environment.json`
3. Click **Import**
4. Select "Padelize Environment" from the environment dropdown (top right)

## Using the Job Status Endpoint

### Location
**Collection Structure:**
```
Padelize
├── Auth
├── User
├── Match
│   ├── Create a Match
│   ├── Upload Video
│   ├── Submit Video Link
│   └── Get Job Status  ← NEW!
├── Webhooks
└── Post
```

### Endpoint Details

**Request:**
```
GET {{URL}}/jobs/:jobId
```

**Headers:**
```
X-API-Key: {{API_KEY}}
```

**Path Variables:**
- `jobId`: Job identifier (e.g., from video-link submission response)

### Example Usage Flow

1. **Submit Video Link** (from Match section)
   ```
   POST {{URL}}/matches/:matchId/video-link
   Body: { "videoLink": "https://..." }
   ```
   
   Response includes `jobId`:
   ```json
   {
     "data": {
       "jobId": "job_xyz789abc",
       "jobStatus": "pending"
     }
   }
   ```

2. **Poll Job Status** (from Jobs section)
   ```
   GET {{URL}}/jobs/job_xyz789abc
   Header: X-API-Key: {{API_KEY}}
   ```
   
   Repeat this until status is "completed" or "failed"

### Example Responses

The collection includes 6 example responses:

#### 1. Success - Pending
```json
{
  "jobId": "job_xyz789abc",
  "status": "pending",
  "link": "https://www.icloud.com/iclouddrive/abc123/video.mov",
  "linkType": "iCloud",
  "s3Url": null,
  "error": null,
  "createdAt": "2026-01-17T10:00:00.000Z",
  "updatedAt": "2026-01-17T10:01:30.000Z",
  "completedAt": null
}
```

#### 2. Success - Completed
```json
{
  "jobId": "job_xyz789abc",
  "status": "completed",
  "s3Url": "https://s3.amazonaws.com/padelize-videos/matches/video.mp4",
  ...
}
```

#### 3. Success - Failed
```json
{
  "jobId": "job_xyz789abc",
  "status": "failed",
  "error": "Download timeout - file not accessible",
  ...
}
```

#### 4. Error - Unauthorized (401)
Missing API key

#### 5. Error - Forbidden (403)
Invalid API key

#### 6. Error - Not Found (404)
Job doesn't exist

## Environment Variables

The environment file includes:

| Variable | Value | Description |
|----------|-------|-------------|
| `URL` | `http://localhost:9000/api/v1` | Base API URL |
| `jwt` | (empty) | JWT token for authenticated endpoints |
| `API_KEY` | `792fcdf...bce3` | API key for job status polling |

**Note:** Update these values for production environment.

## Testing the Endpoint

### Quick Test
1. Select "Padelize Environment" from dropdown
2. Navigate to **Match → Get Job Status**
3. Update `:jobId` path variable with an actual job ID
4. Click **Send**

### Polling Example
Use Postman's **Collection Runner** or **Tests** tab to implement polling:

```javascript
// In Tests tab
if (pm.response.json().status === "pending") {
    setTimeout(() => {}, 5000); // Wait 5 seconds
    postman.setNextRequest("Get Job Status");
} else {
    console.log("Job completed with status:", pm.response.json().status);
}
```

## Tips

- **API Key**: Stored as secret in environment variables
- **Job ID**: Copy from video-link submission response
- **Polling**: Check every 5-10 seconds until completed/failed
- **Timeout**: Stop polling after ~10 minutes

## Related Endpoints

- `POST /matches/:matchId/video-link` - Submit video for download (returns jobId)
- `POST /webhooks/streaming` - Webhook called when job completes
- `GET /jobs/:jobId` - **NEW** Poll job status

## Troubleshooting

**401 Unauthorized**
- Check that `X-API-Key` header is present
- Verify environment is selected
- Ensure `{{API_KEY}}` variable is set

**403 Forbidden**
- API key is invalid
- Update `API_KEY` in environment with correct value

**404 Not Found**
- Job ID doesn't exist
- Check jobId from video-link response
- Job may have been deleted

---

**Ready to test!** 🚀
