# Job Status API Documentation

## Overview
The Job Status API allows external services and clients to poll the status of video download jobs initiated via the streaming service.

## Endpoint

### Get Job Status
**GET** `/api/v1/jobs/:jobId`

Retrieves the current status of a streaming video download job.

## Authentication
This endpoint requires API key authentication via the `X-API-Key` header.

```bash
X-API-Key: <your-api-key>
```

## Request

### URL Parameters
| Parameter | Type   | Required | Description        |
|-----------|--------|----------|--------------------|
| jobId     | string | Yes      | Job identifier     |

### Headers
```json
{
  "X-API-Key": "your-api-key-here",
  "Content-Type": "application/json"
}
```

## Response

### Success Response (200 OK)
```json
{
  "jobId": "job-123-abc",
  "status": "completed",
  "link": "https://www.icloud.com/iclouddrive/...",
  "linkType": "iCloud",
  "s3Url": "https://s3.amazonaws.com/bucket/video.mp4",
  "error": null,
  "createdAt": "2026-01-17T10:00:00.000Z",
  "updatedAt": "2026-01-17T10:05:30.000Z",
  "completedAt": "2026-01-17T10:05:30.000Z"
}
```

### Response Fields
| Field       | Type   | Description                                           |
|-------------|--------|-------------------------------------------------------|
| jobId       | string | Job identifier                                        |
| status      | string | Job status: `pending`, `completed`, `failed`          |
| link        | string | Original video link submitted                         |
| linkType    | string | Type of link: `iCloud`, `Google Photos`, `Dropbox`, etc. |
| s3Url       | string | S3 URL of downloaded video (when completed)           |
| error       | string | Error message (when failed)                           |
| createdAt   | Date   | Job creation timestamp                                |
| updatedAt   | Date   | Last update timestamp                                 |
| completedAt | Date   | Job completion timestamp                              |

## Status Values
- `pending` - Job is queued or in progress
- `completed` - Video downloaded successfully, `s3Url` is available
- `failed` - Job failed, `error` contains details

## Error Responses

### 401 Unauthorized
API key is missing from the request.

```json
{
  "status": "error",
  "message": "API key missing"
}
```

### 403 Forbidden
API key is invalid.

```json
{
  "status": "error",
  "message": "Invalid API key"
}
```

### 404 Not Found
Job with the specified ID does not exist.

```json
{
  "status": "error",
  "message": "Job not found"
}
```

## Usage Examples

### cURL
```bash
curl -X GET \
  'https://api.padelize.ai/api/v1/jobs/job-123-abc' \
  -H 'X-API-Key: your-api-key-here'
```

### JavaScript (fetch)
```javascript
const response = await fetch('https://api.padelize.ai/api/v1/jobs/job-123-abc', {
  method: 'GET',
  headers: {
    'X-API-Key': 'your-api-key-here',
    'Content-Type': 'application/json'
  }
});

const jobStatus = await response.json();
console.log(jobStatus);
```

### JavaScript (axios)
```javascript
const axios = require('axios');

const response = await axios.get(
  'https://api.padelize.ai/api/v1/jobs/job-123-abc',
  {
    headers: {
      'X-API-Key': 'your-api-key-here'
    }
  }
);

console.log(response.data);
```

### Python (requests)
```python
import requests

response = requests.get(
    'https://api.padelize.ai/api/v1/jobs/job-123-abc',
    headers={
        'X-API-Key': 'your-api-key-here'
    }
)

job_status = response.json()
print(job_status)
```

## Polling Best Practices

1. **Interval**: Poll every 5-10 seconds for pending jobs
2. **Timeout**: Stop polling after 10 minutes and consider the job failed
3. **Exponential Backoff**: Increase polling interval if job is taking longer
4. **Status Check**: Stop polling once status is `completed` or `failed`

### Example Polling Logic (JavaScript)
```javascript
async function pollJobStatus(jobId, apiKey) {
  const maxAttempts = 120; // 10 minutes with 5-second intervals
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const response = await fetch(`https://api.padelize.ai/api/v1/jobs/${jobId}`, {
      headers: { 'X-API-Key': apiKey }
    });
    
    const job = await response.json();
    
    if (job.status === 'completed') {
      console.log('✅ Job completed!', job.s3Url);
      return job;
    }
    
    if (job.status === 'failed') {
      console.error('❌ Job failed:', job.error);
      throw new Error(job.error);
    }
    
    console.log('⏳ Job pending, waiting...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    attempts++;
  }
  
  throw new Error('Job polling timeout');
}
```

## Related Endpoints
- **POST** `/api/v1/matches/:matchId/video-link` - Submit video link for download
- **POST** `/api/v1/webhooks/streaming` - Webhook endpoint for status updates

## Environment Variables
Ensure the following environment variable is set in your `.env` file:

```
API_KEY=your-secure-api-key-here
```

Or alternatively:
```
PADELIZE_API_KEY=your-secure-api-key-here
```

## Implementation Details

### Files Created
1. **Middleware**: `/src/middleware/apiKeyAuth.js` - API key authentication
2. **Controller**: `/src/controllers/jobController.js` - Job status logic
3. **Routes**: `/src/routes/jobRoutes.js` - Route definitions
4. **Integration**: Routes registered in `/app.js`

### Database
The endpoint queries the `Match` collection using the `streamingJobId` field. No separate Job collection is needed as jobs are inherently tied to matches.

## Testing
Run the test suite:
```bash
node test_job_status.js
```

This will test:
- ✅ 401 error for missing API key
- ✅ 403 error for invalid API key
- ✅ 404 error for non-existent job
- Manual test required for existing job

## Security Notes
- API keys should be kept secure and not committed to version control
- Use HTTPS in production to protect API keys in transit
- Rotate API keys periodically
- Consider rate limiting for production use
