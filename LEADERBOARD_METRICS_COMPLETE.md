'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''# Complete Leaderboard Metrics System

This document provides a comprehensive overview of all available leaderboard metrics, including the newly added performance metrics.

## Available Ranking Metrics

The leaderboard system now supports **10 ranking metrics** that users can choose from to sort the leaderboard:

### 1. Distance (`distance`)

- **Field**: `total_distance_km`
- **Unit**: km
- **Description**: Total distance covered across all matches
- **Sort By**: Total cumulative distance

### 2. Speed (`speed`)

- **Field**: `avg_speed_kmh`
- **Unit**: km/h
- **Description**: Average speed across all matches
- **Sort By**: Average speed

### 3. Peak Speed (`peak_speed`) ⭐ NEW

- **Field**: `max_peak_speed_kmh`
- **Unit**: km/h
- **Description**: Maximum peak speed achieved across all matches
- **Sort By**: Highest peak speed recorded

### 4. Success Rate (`success_rate`)

- **Field**: `overall_success_rate`
- **Unit**: %
- **Description**: Overall shot success rate
- **Sort By**: Success percentage

### 5. Calories (`calories`)

- **Field**: `total_calories`
- **Unit**: cal
- **Description**: Total calories burned across all matches
- **Sort By**: Total calories burned

### 6. Shots (`shots`)

- **Field**: `total_shots`
- **Unit**: shots
- **Description**: Total number of shots played across all matches
- **Sort By**: Total shot count

### 7. Sprint Bursts (`sprint_bursts`)

- **Field**: `total_sprint_bursts`
- **Unit**: bursts
- **Description**: Total number of sprint bursts across all matches
- **Sort By**: Total sprint burst count

### 8. Net Dominance (`net_dominance`) ⭐ NEW

- **Field**: `avg_net_dominance`
- **Unit**: %
- **Description**: Average percentage of time spent near the net
- **Sort By**: Average net presence

### 9. Baseline Play (`baseline_play`) ⭐ NEW

- **Field**: `avg_baseline_play`
- **Unit**: %
- **Description**: Average percentage of time spent at the baseline
- **Sort By**: Average baseline presence

### 10. Matches Played (`matches`) ⭐ NEW

- **Field**: `total_matches`
- **Unit**: matches
- **Description**: Total number of matches played
- **Sort By**: Match count

## Response Structure

All leaderboard endpoints now return these fields in their response:

```json
{
  "user_id": "ObjectId",
  "rank": 1,
  "name": "John Doe",
  "username": "johndoe",
  "email": "john@example.com",
  "profile_image": "url",
  "total_matches": 25,

  // Distance metrics
  "total_distance_km": 123.45,
  "avg_distance_per_match": 4.938,

  // Speed metrics
  "avg_speed_kmh": 8.5,
  "max_speed_kmh": 15.3,
  "avg_peak_speed_kmh": 18.7, // ⭐ NEW
  "max_peak_speed_kmh": 22.4, // ⭐ NEW

  // Court positioning metrics ⭐ NEW
  "avg_net_dominance": 35.2,
  "avg_baseline_play": 45.8,
  "avg_dead_zone_presence": 19.0,

  // Performance metrics
  "overall_success_rate": 78.5,
  "avg_success_rate": 76.2,
  "total_calories": 15340,
  "avg_calories_per_match": 613.6,

  // Shot statistics
  "total_shots": 1250,
  "total_successful_shots": 981,
  "shot_breakdown": {
    "forehand": 450,
    "backhand": 380,
    "volley": 280,
    "smash": 140
  },

  // Sprint statistics
  "total_sprint_bursts": 156,
  "avg_sprint_bursts_per_match": 6.24,

  // Time period
  "period": {
    "from": "2024-01-01T00:00:00.000Z",
    "to": "2024-11-04T12:00:00.000Z"
  }
}
```

## API Endpoints

### Platform Leaderboard

```
GET /api/v1/leaderboard/platform
```

Query Parameters:

- `metric`: One of the 10 ranking metrics above (default: `distance`)
- `limit`: Number of users to return (default: 50)
- `minMatches`: Minimum matches required (default: 1)
- `startDate`: Filter by start date (optional)
- `endDate`: Filter by end date (optional)

### Network Leaderboard

```
GET /api/v1/leaderboard/network/:userId
```

Shows leaderboard for users in the specified user's network (following/followers).

Query Parameters: Same as platform leaderboard

### Custom User Set Leaderboard

```
POST /api/v1/leaderboard/users
```

Request Body:

```json
{
  "userIds": ["userId1", "userId2", "userId3"],
  "metric": "peak_speed",
  "limit": 50,
  "minMatches": 1
}
```

## Implementation Details

### Aggregation Pipeline

Both `getPlatformLeaderboard()` and `getLeaderboardForUsers()` use MongoDB aggregation pipelines that:

1. **Match**: Filter completed analyses
2. **Add Fields**: Extract first player from player_analytics array
3. **Group**: Aggregate metrics by user (created_by)
   - Sum total values (distance, shots, calories, sprint_bursts)
   - Average speed metrics (avg, max, peak)
   - Average positioning metrics (net, baseline, dead_zone)
   - Calculate success rates
4. **Filter**: Apply minimum matches threshold
5. **Lookup**: Join with User collection for profile data
6. **Project**: Shape final response with rounded values
7. **Sort**: Order by selected metric
8. **Rank**: Add rank position

### Sort Field Mapping

The `getSortField()` function maps user-friendly metric names to database fields:

```javascript
{
  distance: "total_distance_km",
  speed: "avg_speed_kmh",
  peak_speed: "max_peak_speed_kmh",        // NEW
  success_rate: "overall_success_rate",
  calories: "total_calories",
  shots: "total_shots",
  sprint_bursts: "total_sprint_bursts",
  net_dominance: "avg_net_dominance",      // NEW
  baseline_play: "avg_baseline_play",      // NEW
  matches: "total_matches"                 // NEW
}
```

### Metric Availability

The `getAvailableMetricsWithAvailability()` function checks the database to determine which metrics have actual data:

```javascript
GET / api / v1 / leaderboard / metrics;
```

Response:

```json
{
  "distance": {
    "field": "total_distance_km",
    "name": "Total Distance",
    "unit": "km",
    "description": "Total distance covered across all matches",
    "available": true
  },
  "peak_speed": {
    "field": "max_peak_speed_kmh",
    "name": "Peak Speed",
    "unit": "km/h",
    "description": "Maximum peak speed achieved across all matches",
    "available": true
  }
  // ... other metrics
}
```

This allows the frontend to dynamically show only metrics that have data.

## Integration with Player Averages

The metrics added to leaderboards are also available in the player averages endpoint:

```
GET /api/v1/analysis/average?userId=xxx&startDate=xxx&endDate=xxx
```

This endpoint provides per-player breakdowns including:

- Peak speed statistics (average and max)
- Court positioning percentages
- Sprint burst totals and averages

## Frontend Usage Examples

### Request leaderboard by peak speed

```javascript
const response = await fetch(
  '/api/v1/leaderboard/platform?metric=peak_speed&limit=20'
);
```

### Request leaderboard by net dominance

```javascript
const response = await fetch(
  '/api/v1/leaderboard/platform?metric=net_dominance&limit=10&minMatches=5'
);
```

### Request leaderboard by matches played

```javascript
const response = await fetch(
  '/api/v1/leaderboard/platform?metric=matches&limit=100'
);
```

## Testing

To verify the new metrics are working:

1. Ensure you have analysis data with the new fields:

   - `peak_speed_kmh`
   - `net_dominance_percentage`
   - `baseline_play_percentage`
   - `dead_zone_presence_percentage`

2. Query the leaderboard with new metrics:

```bash
curl "http://localhost:5000/api/v1/leaderboard/platform?metric=peak_speed"
curl "http://localhost:5000/api/v1/leaderboard/platform?metric=net_dominance"
curl "http://localhost:5000/api/v1/leaderboard/platform?metric=matches"
```

3. Verify the response includes all new fields

4. Check metric availability:

```bash
curl "http://localhost:5000/api/v1/leaderboard/metrics"
```

## Summary of Changes

### Files Modified

- `src/services/leaderboardService.js`

### Changes Made

1. **getPlatformLeaderboard() Pipeline**:

   - Added `avg_peak_speed_kmh` and `max_peak_speed_kmh` aggregation
   - Added `avg_net_dominance`, `avg_baseline_play`, `avg_dead_zone_presence` aggregation
   - Added all new fields to projection with rounding

2. **getLeaderboardForUsers() Pipeline**:

   - Applied same aggregation changes as platform leaderboard
   - Ensures network leaderboards have parity with platform leaderboards

3. **getSortField()**:

   - Added mappings for: `peak_speed`, `net_dominance`, `baseline_play`, `matches`

4. **getAvailableMetrics()**:

   - Added metadata for 4 new metrics with proper descriptions

5. **getAvailableMetricsWithAvailability()**:
   - Added existence checks for new fields in Analysis collection
   - Ensures frontend only shows metrics with actual data

## Performance Considerations

- All metrics use MongoDB aggregation with proper indexes
- Aggregations leverage existing indexes on `created_by` and `status`
- Consider adding compound indexes if queries become slow:
  ```javascript
  db.analyses.createIndex({ status: 1, created_by: 1, createdAt: -1 });
  ```

## Future Enhancements

Potential metrics to add:

- Shot variety score (diversity of shot types)
- Consistency score (standard deviation of performance)
- Improvement rate (trend over time)
- Head-to-head win rate (requires match opponent tracking)
- Tournament performance (requires tournament system)
