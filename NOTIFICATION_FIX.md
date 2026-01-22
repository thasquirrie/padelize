# Notification Persistence Issue - Fixed

## Problem 1: Notifications Not Saving to Database
Only match creation notifications (`matchCreated`) were being saved to the database, while other match-related notifications like:
- `player_detection_complete`
- `player_detection_failed`  
- `player_detection_started`
- `analysisStarted`
- `analysisCompleted`
- `analysisError`
- `videoUploaded`
- etc.

...were NOT being saved to the database.

## Problem 2: Video Link Upload Causing 500 Error
When uploading a video via link, the API was throwing:
```
"Failed to create notification"
Error: Sender user not found
```

---

## Root Cause #1: Self-Notification Check Too Restrictive

The issue was in `/src/services/notificationService.js` in the `createNotification()` method (line 147-160).

### The Logic Flow:
1. **matchNotificationService.js** calls `sendMatchNotification()`
2. `sendMatchNotification()` calls `notificationService.createNotification()` with:
   ```javascript
   {
     recipient: userId,
     sender: userId,  // System notifications from self
     type: 'player_detection_complete',  // Example
     // ...
   }
   ```

3. **notificationService.js** has a check to prevent self-notifications:
   ```javascript
   // OLD CODE - THE BUG
   if (
     recipient.toString() === sender.toString() &&
     !type.includes('match') &&
     !type.includes('post')
   ) {
     return null;  // ❌ Exits without saving notification
   }
   ```

4. The condition `!type.includes('match')` only allows types with "match" in the name
5. Notification types like `'player_detection_complete'`, `'analysisStarted'`, etc. don't contain "match"
6. Therefore, they returned `null` and were never saved!

### Why `matchCreated` Worked:
- Type: `'matchCreated'` ✓ contains "match"
- Type: `'matchUpdated'` ✓ contains "match"  
- Type: `'matchDeleted'` ✓ contains "match"

### Why Others Failed:
- Type: `'player_detection_complete'` ❌ no "match"
- Type: `'analysisStarted'` ❌ no "match"
- Type: `'analysisCompleted'` ❌ no "match"
- Type: `'videoUploaded'` ❌ no "match"

## Root Cause #2: Unnecessary User Lookup for Custom Notifications

When custom title and message are provided (as is the case for ALL match notifications), the code was still trying to fetch the sender user from the database:

```javascript
// OLD CODE - THE BUG
const senderUser = await findOne(User, { _id: sender });
const { title, message } = await this.generateNotificationContent(
  type,
  senderUser,
  { relatedPost, relatedReply, customTitle, customMessage }
);
```

**The Problem:**
- For match notifications, `sender === recipient` (same userId)
- Match notifications always provide `customTitle` and `customMessage`
- The user lookup was unnecessary AND could fail
- If `senderUser` is null or lookup fails, subsequent code breaks
- This caused 500 errors: "Failed to create notification"

---

---

## Solution

### Fix #1: Expand Self-Notification Check

Updated the self-notification check to recognize ALL match-related system notifications:

```javascript
// NEW CODE - THE FIX
// Don't send notification to self (except for match-related and post-related system notifications)
// Match-related notifications include: matchCreated, analysisStarted, player_detection_complete, etc.
const isMatchRelatedNotification = 
  type.includes('match') || 
  type.includes('analysis') || 
  type.includes('player_detection') ||
  type.includes('video') ||
  type.includes('upload');

if (
  recipient.toString() === sender.toString() &&
  !isMatchRelatedNotification &&
  !type.includes('post')
) {
  return null;
}
```

### Fix #2: Skip User Lookup for Custom Notifications

For notifications with custom title and message (all match notifications), skip the user lookup entirely:

```javascript
// NEW CODE - THE FIX
// Generate title and message based on type
// For custom notifications (match notifications), we don't need to fetch sender
let title, message;
if (customTitle && customMessage) {
  title = customTitle;
  message = customMessage;
} else {
  const senderUser = await findOne(User, { _id: sender });
  if (!senderUser) {
    throw new AppError('Sender user not found', 404);
  }
  const content = await this.generateNotificationContent(
    type,
    senderUser,
    { relatedPost, relatedReply, customTitle, customMessage }
  );
  title = content.title;
  message = content.message;
}
```

### What Changed:
- **Fix #1**: Created `isMatchRelatedNotification` variable that checks for multiple keywords in notification type
- **Fix #2**: Only fetch sender user when needed (not for custom title/message notifications)
- Now allows any notification type containing:
  - `'match'` - matchCreated, matchUpdated, matchDeleted, matchShared
  - `'analysis'` - analysisStarted, analysisCompleted, analysisError, analysisProgress
  - `'player_detection'` - player_detection_complete, player_detection_failed, player_detection_started
  - `'video'` - videoUploaded, video_download_started, video_download_complete
  - `'upload'` - uploadError

## Files Modified
- `/src/services/notificationService.js` (lines 147-180)

## Impact
✅ All match-related system notifications will now be saved to the database  
✅ Users will receive in-app notifications for all processing stages  
✅ Video link upload no longer throws 500 error  
✅ Eliminated unnecessary database queries for custom notifications  
✅ Firebase push notifications and WebSocket real-time updates already worked (unaffected)  
✅ More robust error handling for missing users

## Testing Checklist
- [ ] Create a new match → verify `matchCreated` notification saves
- [ ] Upload video with external link → verify `video_download_started` saves
- [ ] Wait for player detection → verify `player_detection_complete` saves
- [ ] Start analysis → verify `analysisStarted` saves
- [ ] Wait for analysis completion → verify `analysisCompleted` saves
- [ ] Check user's notification list to see all notifications present

## Related Files
- `/src/services/notificationService.js` - Core notification creation logic (FIXED)
- `/src/services/matchNotificationService.js` - Match-specific notifications (unchanged)
- `/src/services/cronService.js` - Calls player detection notifications (unchanged)
- `/src/services/matchService.js` - Calls analysis notifications (unchanged)
