# Player Averages Endpoint - Enhanced Metrics

## Endpoint
```
GET /api/v1/analysis/average?startDate=<date>&endDate=<date>
```

## New Metrics Added

### 1. Speed Metrics (Enhanced)
- **`peak_speed_kmh`** - Average of peak speeds across all matches
- **`max_peak_speed_kmh`** - Highest peak speed recorded across all matches

### 2. Court Positioning Metrics (NEW)
- **`net_dominance_percentage`** - Average percentage of time spent at the net
- **`dead_zone_presence_percentage`** - Average percentage of time spent in dead zones
- **`baseline_play_percentage`** - Average percentage of time spent at baseline

### 3. Sprint Burst Statistics (NEW)
- **`total_sprint_bursts`** - Total sprint bursts across all matches in the period
- **`avg_sprint_bursts_per_match`** - Average sprint bursts per match

## Complete Response Structure

```json
{
  "status": "success",
  "data": {
    "summary": {
      "total_analyses": 15,
      "unique_matches": 15,
      "total_duration_minutes": 450,
      "avg_duration_minutes": 30,
      "date_range": {
        "from": "2025-10-01T00:00:00.000Z",
        "to": "2025-11-04T00:00:00.000Z"
      }
    },
    "player_averages": {
      "total_analyses": 15,
      "date_range": {
        "from": "2025-10-01T00:00:00.000Z",
        "to": "2025-11-04T00:00:00.000Z"
      },
      
      "performance_averages": {
        "speed_kmh": 15.23,
        "peak_speed_kmh": 18.45,              // NEW
        "max_peak_speed_kmh": 22.10,          // NEW - Highest recorded
        "total_distance_km": 0.2856,
        "distance_from_center_km": 0.000012,
        "calories_burned": 125.50
      },
      
      "positioning_averages": {                // NEW SECTION
        "net_dominance_percentage": 35.20,
        "dead_zone_presence_percentage": 28.50,
        "baseline_play_percentage": 36.30
      },
      
      "sprint_burst_stats": {                  // NEW SECTION
        "total_sprint_bursts": 68,
        "avg_sprint_bursts_per_match": 4.53
      },
      
      "shot_totals": {
        "total_shots": 450,
        "forehand": 180,
        "backhand": 150,
        "volley": 80,
        "smash": 40,
        "successful_shots": 360,
        "overall_success_rate": 80.00
      },
      
      "shot_averages_per_match": {
        "shots_per_match": 30.00,
        "forehand_per_match": 12.00,
        "backhand_per_match": 10.00,
        "volley_per_match": 5.33,
        "smash_per_match": 2.67,
        "success_rate_per_match": 80.00
      }
    }
  }
}
```

## Query Parameters

- **`startDate`** (optional) - Filter by start date (ISO 8601 format)
- **`endDate`** (optional) - Filter by end date (ISO 8601 format)
- **`matchIds`** (optional) - Comma-separated list of specific match IDs

## Examples

### 1. Get averages for last 30 days
```bash
GET /api/v1/analysis/average?startDate=2025-10-05&endDate=2025-11-04
```

### 2. Get averages for specific matches
```bash
GET /api/v1/analysis/average?matchIds=match1,match2,match3
```

### 3. Get all-time averages
```bash
GET /api/v1/analysis/average
```

## Metrics Summary Table

| Category | Metric | Type | Description |
|----------|--------|------|-------------|
| **Speed** | `speed_kmh` | Average | Average speed across matches |
| **Speed** | `peak_speed_kmh` | Average | Average of peak speeds |
| **Speed** | `max_peak_speed_kmh` | Maximum | Highest peak speed recorded |
| **Distance** | `total_distance_km` | Average | Average distance per match |
| **Distance** | `distance_from_center_km` | Average | Average distance from center |
| **Energy** | `calories_burned` | Average | Average calories per match |
| **Positioning** | `net_dominance_percentage` | Average | Time at net (%) |
| **Positioning** | `dead_zone_presence_percentage` | Average | Time in dead zones (%) |
| **Positioning** | `baseline_play_percentage` | Average | Time at baseline (%) |
| **Performance** | `total_sprint_bursts` | Sum | Total sprint bursts |
| **Performance** | `avg_sprint_bursts_per_match` | Average | Sprint bursts per match |
| **Shots** | `total_shots` | Sum | Total shots across all matches |
| **Shots** | `shots_per_match` | Average | Average shots per match |
| **Shots** | `overall_success_rate` | Percentage | Overall success rate |

## Use Cases

1. **Performance Tracking** - Monitor improvement over time
2. **Training Analysis** - Identify areas for improvement (e.g., low net dominance)
3. **Fitness Metrics** - Track sprint bursts and physical performance
4. **Playing Style** - Understand positioning preferences (baseline vs net)
5. **Comparison** - Compare different time periods to see progress

## Files Modified

- `src/services/analysisService.js`
  - Updated `getPlayerAverages()` method
  - Added aggregation for peak speed, positioning metrics, and sprint bursts
  - Enhanced projection to include new metric groups

## Backward Compatibility

- All new fields gracefully handle missing data (defaults to 0 or null)
- Existing response structure unchanged
- New fields are purely additive
- Works with analyses that don't have the new fields
