# Creator Player Index - Mobile Integration Guide

## Problem Context

The AI server returns player analytics with keys like `"a"`, `"b"`, `"c"`:

```json
{
  "results": {
    "a": { "Distance Covered": "25.586 Meters", ... },
    "b": { "Distance Covered": "22.134 Meters", ... }
  }
}
```

The backend needs to know **which player is the match creator** to show their stats correctly in aggregations.

## Solution: Mobile Sends Creator Index

### Why Mobile Should Send the Index

✅ **Mobile knows best**: The logged-in user creating the match knows which position they selected
✅ **Source of truth**: Mobile app is where user interaction happens
✅ **No ID matching needed**: Works regardless of whether other players have accounts
✅ **Guest player compatible**: Works even when other players are just names
✅ **Most reliable**: No complex backend searching or ID matching

### API Request Format

**Endpoint**: `POST /api/v1/matches/analyze/:matchId`

**Before (Old Format):**

```json
{
  "playersData": [
    { "name": "Guest Player", "color": "red", "position": "left" },
    {
      "player_id": "507f1f77bcf86cd799439011",
      "name": "Creator Name",
      "color": "blue",
      "position": "right"
    }
  ]
}
```

**After (Recommended Format):**

```json
{
  "playersData": [
    { "name": "Guest Player", "color": "red", "position": "left" },
    {
      "player_id": "507f1f77bcf86cd799439011",
      "name": "Creator Name",
      "color": "blue",
      "position": "right"
    }
  ],
  "creatorPlayerIndex": 1 // ⬅️ ADD THIS: 0-based index where creator appears
}
```

### How to Determine Creator Index

The creator is the **logged-in user** who created the match. When they confirm player positions:

```javascript
// Example: User selects themselves as player at position 1
const playersData = [
  { name: 'Guest Partner', color: 'red', position: 'left' },
  {
    player_id: currentUser._id,
    name: currentUser.name,
    color: 'blue',
    position: 'right',
  }, // Creator here
  { name: 'Opponent 1', color: 'green', position: 'left' },
  { name: 'Opponent 2', color: 'yellow', position: 'right' },
];

// Find which index has the creator
const creatorPlayerIndex = playersData.findIndex(
  (player) => player.player_id === currentUser._id
);

// Send to API
fetch(`/api/v1/matches/analyze/${matchId}`, {
  method: 'POST',
  body: JSON.stringify({
    playersData: playersData,
    creatorPlayerIndex: creatorPlayerIndex, // Will be 1 in this example
  }),
});
```

### Mobile Implementation Pseudocode

```javascript
// When user confirms player positions after AI detection
function confirmPlayerPositions(matchId, confirmedPlayers, currentUserId) {
  // Map AI player keys (a, b, c) to actual player data
  const playersData = confirmedPlayers.map((player) => {
    if (player.isCreator) {
      // This is the logged-in user
      return {
        player_id: currentUserId,
        name: currentUser.name,
        color: player.color,
        position: player.position,
      };
    } else if (player.isRegistered) {
      // Player with account
      return {
        player_id: player.userId,
        name: player.name,
        color: player.color,
        position: player.position,
      };
    } else {
      // Guest player (no account)
      return {
        name: player.name,
        color: player.color,
        position: player.position,
      };
    }
  });

  // Find creator's position in the array
  const creatorPlayerIndex = playersData.findIndex(
    (player) => player.player_id === currentUserId
  );

  // Send to backend
  return apiClient.post(`/matches/analyze/${matchId}`, {
    playersData: playersData,
    creatorPlayerIndex: creatorPlayerIndex, // IMPORTANT: Add this!
  });
}
```

## Backend Handling (Already Implemented)

The backend uses a **fallback strategy** for maximum compatibility:

### Priority 1: Use Explicit Index (RECOMMENDED)

```javascript
if (req.body.creatorPlayerIndex !== undefined) {
  match.creatorPlayerIndex = req.body.creatorPlayerIndex;
}
```

### Priority 2: Find by ID Matching (Fallback)

```javascript
else {
  const creatorIndex = playersData.findIndex(
    player => player.player_id === match.creator
  );
  if (creatorIndex !== -1) {
    match.creatorPlayerIndex = creatorIndex;
  }
}
```

### Priority 3: Default to 0 (Backward Compatible)

```javascript
// If nothing works, default to 0
// Schema has: creatorPlayerIndex: { type: Number, default: 0 }
```

## Testing Scenarios

### Scenario 1: Singles Match - Creator vs Guest

```json
{
  "playersData": [
    { "name": "Guest Player", "color": "blue" },
    { "player_id": "creator_id", "name": "Creator", "color": "red" }
  ],
  "creatorPlayerIndex": 1
}
```

✅ Creator stats shown correctly (from position 1)

### Scenario 2: Doubles - Creator as First Player

```json
{
  "playersData": [
    { "player_id": "creator_id", "name": "Creator", "color": "red" },
    { "name": "Partner", "color": "orange" },
    { "name": "Opponent 1", "color": "blue" },
    { "name": "Opponent 2", "color": "green" }
  ],
  "creatorPlayerIndex": 0
}
```

✅ Creator stats shown correctly (from position 0)

### Scenario 3: Doubles - Creator in Middle

```json
{
  "playersData": [
    { "name": "Opponent 1", "color": "blue" },
    { "player_id": "creator_id", "name": "Creator", "color": "red" },
    { "name": "Partner", "color": "orange" },
    { "name": "Opponent 2", "color": "green" }
  ],
  "creatorPlayerIndex": 1
}
```

✅ Creator stats shown correctly (from position 1)

## Migration Path

### Phase 1: Add Support (Current)

- ✅ Backend accepts `creatorPlayerIndex` field
- ✅ Backend has fallbacks for old clients
- ✅ No breaking changes

### Phase 2: Update Mobile App

- 📱 Mobile team adds `creatorPlayerIndex` to API calls
- 📱 Use creator finding logic shown above
- 📱 Test thoroughly before release

### Phase 3: Monitor

- 📊 Check logs to see if index is being set correctly
- 📊 Verify aggregations return correct creator stats
- 📊 Monitor for any edge cases

## Validation Rules

Mobile should validate before sending:

```javascript
function validateCreatorIndex(playersData, creatorPlayerIndex, currentUserId) {
  // 1. Index must be within bounds
  if (creatorPlayerIndex < 0 || creatorPlayerIndex >= playersData.length) {
    throw new Error('Creator index out of bounds');
  }

  // 2. Player at that index should be the creator
  const playerAtIndex = playersData[creatorPlayerIndex];
  if (playerAtIndex.player_id !== currentUserId) {
    throw new Error('Creator index does not match creator user ID');
  }

  return true;
}
```

## API Response

Backend will save the index and return success:

```json
{
  "status": "success",
  "message": "Match analysis started",
  "data": {
    "match": {
      "_id": "match_id",
      "creator": "creator_id",
      "players": [...],
      "creatorPlayerIndex": 1,  // ⬅️ Saved successfully
      "formattedPlayerData": true,
      "analysisStatus": "pending"
    }
  }
}
```

## Benefits Summary

### For Mobile Team:

✅ Simple logic - just find index where creator appears
✅ Works with any player ID format
✅ No complex ID matching needed
✅ Easy to test and validate

### For Backend:

✅ Reliable data directly from source
✅ No ambiguity in player identification
✅ Backward compatible with old clients
✅ Works perfectly with guest players

### For Users:

✅ Always see their own stats correctly
✅ Works regardless of player positions
✅ Consistent experience

## Backward Compatibility

Old mobile app versions that DON'T send `creatorPlayerIndex` will:

1. Fall back to ID matching (if player_id is provided)
2. Fall back to index 0 (if ID matching fails)
3. Still work, but might show wrong player in some cases

**Recommendation**: Update mobile app to send `creatorPlayerIndex` explicitly for best reliability.

## Questions for Mobile Team

1. **Can you identify which player position the logged-in user selected?**

   - If yes: Send that index directly ✅
   - If no: We need to add this tracking in mobile

2. **Do you currently store the creator's user ID with player data?**

   - If yes: Use it to find the index
   - If no: Track which UI element/position the user selected for themselves

3. **Testing**: Can you test with:
   - Creator as first player (index 0)
   - Creator as last player (index 3 in doubles)
   - Creator in middle positions
   - Singles and doubles matches

---

**Status**: ✅ Backend implementation complete and backward compatible
**Next Step**: Mobile team adds `creatorPlayerIndex` to analyze match API call
**Priority**: High - Ensures correct stats display for all users
