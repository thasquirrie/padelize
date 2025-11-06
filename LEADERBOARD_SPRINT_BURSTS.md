# Leaderboard Sprint Bursts Update

## Changes Made

Added `total_sprint_bursts` tracking to all leaderboard endpoints.

### New Fields in Leaderboard Response

Each leaderboard entry now includes:

```json
{
  "user_id": "...",
  "name": "...",
  "total_matches": 10,
  "total_distance_km": 2.5,
  "avg_speed_kmh": 15.2,

  // NEW FIELDS
  "total_sprint_bursts": 42,
  "avg_sprint_bursts_per_match": 4.2,

  "shot_breakdown": { ... },
  "period": { ... }
}
```

### Affected Endpoints

1. **Platform Leaderboard** (`GET /api/v1/leaderboards/platform`)

   - Shows top players globally with sprint burst stats

2. **Network Leaderboard** (`GET /api/v1/leaderboards/network/:userId`)

   - Shows followers/following with sprint burst stats

3. **Multiple Leaderboards** (`GET /api/v1/leaderboards/multiple/:userId`)

   - Combined view with sprint burst stats

4. **Trending Players** (`GET /api/v1/leaderboards/trending`)
   - Most improved players with sprint burst tracking

### Field Descriptions

- **`total_sprint_bursts`** (Integer): Total number of sprint bursts across all matches
- **`avg_sprint_bursts_per_match`** (Float): Average sprint bursts per match (rounded to 2 decimals)

### Data Source

These fields aggregate from `player_analytics.players[].total_sprint_bursts` in the Analysis collection.

### Backward Compatibility

- If `total_sprint_bursts` is not present in older analyses, it defaults to 0
- Existing leaderboard functionality remains unchanged
- New fields are additive only

## Example Response

```json
{
  "status": "success",
  "data": {
    "leaderboard": {
      "metric": "distance",
      "total_users": 50,
      "leaderboard": [
        {
          "rank": 1,
          "user_id": "123...",
          "name": "John Doe",
          "username": "johndoe",
          "total_matches": 15,
          "total_distance_km": 3.2456,
          "avg_distance_per_match": 0.2164,
          "avg_speed_kmh": 16.23,
          "total_sprint_bursts": 68,
          "avg_sprint_bursts_per_match": 4.53,
          "shot_breakdown": {
            "forehand": 120,
            "backhand": 95,
            "volley": 45,
            "smash": 12
          }
        }
      ]
    }
  }
}
```

## Testing

To verify sprint bursts appear in leaderboards, query any leaderboard endpoint after analyses with `total_sprint_bursts` data have been created.

## Sprint Bursts as a Ranking Metric

You can now rank players by sprint bursts! Use the `metric` query parameter:

```bash
# Rank by total sprint bursts
GET /api/v1/leaderboards/platform?metric=sprint_bursts

# Or use the full field name
GET /api/v1/leaderboards/platform?metric=total_sprint_bursts
```

This works for all leaderboard endpoints:

- Platform leaderboard
- Network leaderboard
- Multiple leaderboards
- Trending players (most improved by sprint bursts)

## Available Metrics

The `sprint_bursts` metric is now included in the available metrics list:

```json
{
  "sprint_bursts": {
    "field": "total_sprint_bursts",
    "name": "Total Sprint Bursts",
    "unit": "bursts",
    "description": "Total number of sprint bursts across all matches",
    "available": true
  }
}
```

## Files Modified

- `src/services/leaderboardService.js`
  - Updated `getPlatformLeaderboard()` aggregation pipeline
  - Updated `getLeaderboardForUsers()` aggregation pipeline
  - Both pipelines now:
    - Aggregate `total_sprint_bursts` with `$sum`
    - Calculate `avg_sprint_bursts_per_match` with `$avg`
    - Include both fields in `$project` stage
  - Added `sprint_bursts` to `getSortField()` method
  - Added `sprint_bursts` to `getAvailableMetrics()` method
  - Added `sprint_bursts` availability check in `getAvailableMetricsWithAvailability()`

## Usage Examples

### 1. Get Top Sprint Burst Leaders

```bash
GET /api/v1/leaderboards/platform?metric=sprint_bursts&limit=10
```

Response:

```json
{
  "status": "success",
  "data": {
    "leaderboard": {
      "metric": "sprint_bursts",
      "total_users": 50,
      "leaderboard": [
        {
          "rank": 1,
          "user_id": "...",
          "name": "Speed Demon",
          "total_sprint_bursts": 156,
          "avg_sprint_bursts_per_match": 5.2,
          "total_matches": 30
        },
        {
          "rank": 2,
          "user_id": "...",
          "name": "Fast Player",
          "total_sprint_bursts": 142,
          "avg_sprint_bursts_per_match": 4.7,
          "total_matches": 30
        }
      ]
    },
    "available_metrics": {
      "sprint_bursts": {
        "field": "total_sprint_bursts",
        "name": "Total Sprint Bursts",
        "unit": "bursts",
        "description": "Total number of sprint bursts across all matches",
        "available": true
      }
    }
  }
}
```

### 2. Get Network Leaderboard by Sprint Bursts

```bash
GET /api/v1/leaderboards/network/:userId?metric=sprint_bursts
```

### 3. Get Trending Players (Most Improved Sprint Bursts)

```bash
GET /api/v1/leaderboards/trending?metric=sprint_bursts&days=30
```

This will show players who have improved their sprint burst count the most over the last 30 days.

### 4. All Available Metrics

```bash
GET /api/v1/leaderboards/available-metrics
```

Will now include `sprint_bursts` in the response.
