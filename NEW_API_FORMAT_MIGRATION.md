# New API Format Migration

## Overview
Updated the system to handle the new AI server API response format with changed units and new fields.

## Changes Made

### 1. Unit Changes
The AI server API has changed the units for some metrics:

| Metric | Old Format | New Format |
|--------|-----------|-----------|
| Distance | Miles | **Meters** |
| Speed (Average) | Miles per Hour | **Kilometers per Hour** |
| Speed (Peak) | Miles per Hour | **Kilometers per Hour** |

### 2. New Fields Added

#### Player Schema (`src/models/Analysis.js`)
- **`total_sprint_bursts`**: Number of sprint bursts detected (Integer)
- **`player_heatmap`**: URL to the player's heatmap image (String)

#### API Response Format
```json
{
  "status": "success",
  "job_id": "66ba603e-2aab-4143-a60d-0bc24ad6ab3c",
  "analysis_status": "completed",
  "results": {
    "a": {
      "Distance Covered": "25.586 Meters",
      "Average Speed": "14.47575 Kilometers per Hour",
      "Peak Speed": "16.344 Kilometers per Hour",
      "Net Dominance": "35.0 %",
      "Dead Zone Presence": "31.08 %",
      "Baseline Play": "33.92%",
      "Total Sprint Bursts": "4",
      "Player Heatmap": "https://padelizeresources.s3.amazonaws.com/a.jpg"
    },
    "b": { ... }
  }
}
```

### 3. Files Modified

#### `src/utils/analysisFormatter.js`
- Updated `transformNewAnalysisResults()` function to:
  - Parse new unit format (Meters → km, Kilometers per Hour → km/h)
  - Extract `Total Sprint Bursts` field
  - Extract `Player Heatmap` URL
  - Assign distinct colors to players (a=red, b=blue, c=green, d=orange)
  - Add helper function `parseValueWithUnit()` for safe numeric parsing

#### `src/models/Analysis.js`
- Added `total_sprint_bursts` field to player schema (optional, default: 0)
- Made `player_heatmap` field optional

### 4. Backward Compatibility
The transformation function maintains backward compatibility:
- Old format responses are passed through unchanged
- New format is detected by checking for `results` object and `job_id`
- Original response is preserved in `_original_new_format` field

### 5. Testing
Created `test-new-api-format.js` to verify the transformation:
```bash
node test-new-api-format.js
```

Expected output shows:
- ✅ Successful transformation
- Correct unit conversions (Meters → km)
- All new fields properly extracted
- Proper color assignment per player

## Usage

The transformation happens automatically in the analysis pipeline:

1. **When AI server returns results** → `transformNewAnalysisResults()` is called
2. **Response is normalized** → Internal format with correct units
3. **Saved to MongoDB** → Analysis model accepts all new fields
4. **Frontend receives** → Consistent format regardless of API version

## Verification

To test with your own data:
```javascript
import { transformNewAnalysisResults } from './src/utils/analysisFormatter.js';

const apiResponse = {
  status: "success",
  job_id: "some-uuid",
  analysis_status: "completed",
  results: { /* your data */ }
};

const transformed = transformNewAnalysisResults(apiResponse);
console.log(transformed);
```

## Notes

- **Distance values**: API sends in Meters, we convert to km by dividing by 1000
- **Speed values**: Already in km/h from API, no conversion needed
- **Percentage values**: Parsing handles both "35.0 %" and "33.92%" formats
- **Player IDs**: Maintained as 'a', 'b', 'c', 'd' from API response
- **Missing fields**: Default to 0 or null (shots data, calories, etc.)

## Migration Path

No database migration needed - new fields are optional in the schema. Existing analyses will continue to work, and new analyses will include the additional fields when available.
