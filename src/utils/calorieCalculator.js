/**
 * Calculate calories burned during padel match using distance-based formula
 * Formula: Calories = (Distance(km) × Weight(kg) × 0.9 × Intensity_Multiplier) + (Sprint_Count × 5)
 *
 * @param {Object} params - Calculation parameters
 * @param {Number} params.distance_km - Total distance covered in km
 * @param {Number} params.avg_speed_kmh - Average speed in km/h
 * @param {Number} params.total_sprints - Total sprint bursts
 * @param {Number} params.weight_kg - Player weight in kg (default: 80)
 * @returns {Number} - Estimated calories burned (rounded to 2 decimals)
 */
export const calculateCaloriesBurned = ({
  distance_km,
  avg_speed_kmh,
  total_sprints = 0,
  weight_kg = 80,
}) => {
  // Validate inputs
  if (!distance_km || !avg_speed_kmh) {
    return 0;
  }

  // Determine intensity multiplier based on average speed
  let intensity_multiplier;
  if (avg_speed_kmh < 3) {
    intensity_multiplier = 1.2; // Light intensity
  } else if (avg_speed_kmh < 5) {
    intensity_multiplier = 1.5; // Moderate intensity
  } else if (avg_speed_kmh < 7) {
    intensity_multiplier = 1.8; // Vigorous intensity
  } else {
    intensity_multiplier = 2.2; // High intensity
  }

  // Calculate base calories using distance-based formula
  // Base formula: Distance × Weight × 0.9 (standard running coefficient for padel)
  const base_calories = distance_km * weight_kg * 0.9 * intensity_multiplier;

  // Add sprint bonus (5 calories per sprint burst)
  const sprint_bonus = total_sprints * 5;

  // Total calories
  const total_calories = base_calories + sprint_bonus;

  // Round to 2 decimal places
  return Math.round(total_calories * 100) / 100;
};

/**
 * Get intensity level description based on average speed
 * @param {Number} avg_speed_kmh - Average speed in km/h
 * @returns {String} - Intensity level description
 */
export const getIntensityLevel = (avg_speed_kmh) => {
  if (avg_speed_kmh < 3) return 'light';
  if (avg_speed_kmh < 5) return 'moderate';
  if (avg_speed_kmh < 7) return 'vigorous';
  return 'high';
};

/**
 * Get intensity multiplier for distance-based calculation
 * @param {Number} avg_speed_kmh - Average speed in km/h
 * @returns {Number} - Intensity multiplier
 */
export const getIntensityMultiplier = (avg_speed_kmh) => {
  if (avg_speed_kmh < 3) return 1.2;
  if (avg_speed_kmh < 5) return 1.5;
  if (avg_speed_kmh < 7) return 1.8;
  return 2.2;
};
