# Calorie Calculation Implementation

## Overview

Implemented automatic calorie calculation for padel matches using **distance-based formula** with sprint bonus adjustment. No duration required!

## Formula

```
Calories = (Distance(km) × Weight(kg) × 0.9 × Intensity_Multiplier) + (Sprint_Count × 5)
```

## Intensity Multipliers (Based on Average Speed)

- **< 3 km/h**: 1.2 (Light intensity)
- **3-5 km/h**: 1.5 (Moderate intensity)
- **5-7 km/h**: 1.8 (Vigorous intensity)
- **> 7 km/h**: 2.2 (High intensity)

## Default Values

- **Weight**: 80 kg (configurable, can be added to User model later)
- **Duration**: Not needed! Uses distance and speed only

## Why Distance-Based?

- ✅ More accurate - based on actual movement
- ✅ No estimation needed - uses real metrics from AI analysis
- ✅ Accounts for intensity via speed multipliers
- ✅ Sprint bonus adds high-intensity burst calories

## Implementation Details

### Files Modified

1. **`src/utils/calorieCalculator.js`** (NEW)

   - `calculateCaloriesBurned()` - Distance-based calculation function
   - `getIntensityLevel()` - Returns intensity description
   - `getIntensityMultiplier()` - Returns multiplier for given speed

2. **`src/utils/analysisFormatter.js`** (MODIFIED)
   - Import calorie calculator utility
   - Calculate calories for each player using distance and speed
   - Store calculated calories in `player.calories_burned` field

### Database Schema

- `calories_burned` field already exists in Analysis.playerSchema
- Field is now automatically populated during analysis processing

## Example Calculations

### Moderate Intensity Match

- Distance: 2.0 km
- Average Speed: 4.0 km/h
- Sprint Bursts: 15
- Weight: 80 kg
- **Result**: 291 calories
  - Base: 2.0 × 80 × 0.9 × 1.5 = 216
  - Sprint bonus: 15 × 5 = 75

### High Intensity Match (Real Data)

- Distance: 2.21 km
- Average Speed: 12.45 km/h
- Sprint Bursts: 18
- Weight: 80 kg
- **Result**: 440 calories
  - Base: 2.21 × 80 × 0.9 × 2.2 = 350
  - Sprint bonus: 18 × 5 = 90

## Future Enhancements

1. Add `weight` field to User model for personalized calculations
2. Provide calorie breakdown (base + sprint bonus) in API response
3. Add calorie goals and tracking features
4. Compare calories across matches in leaderboard
5. Add calorie trends over time

## Testing

Run `node test_calorie_calculation.js` to verify calculations across all intensity levels.

## API Response

When fetching analysis, `calories_burned` is now automatically included in player analytics:

```json
{
  "player_analytics": {
    "players": [
      {
        "player_id": "a",
        "total_distance_km": 2.21,
        "average_speed_kmh": 12.45,
        "total_sprint_bursts": 18,
        "calories_burned": 440.06,
        ...
      }
    ]
  }
}
```

## Benefits Over MET-Based Calculation

- ✅ No duration estimation needed
- ✅ Based on actual player movement data
- ✅ More accurate for varying match lengths
- ✅ Simpler to understand and explain to users
