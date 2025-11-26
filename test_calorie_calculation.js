import {
  calculateCaloriesBurned,
  getIntensityLevel,
  getIntensityMultiplier,
} from './src/utils/calorieCalculator.js';

console.log('=== Distance-Based Calorie Calculation Tests ===\n');

// Test Case 1: Light intensity (avg_speed < 3 km/h)
const test1 = {
  distance_km: 1.5,
  avg_speed_kmh: 2.5,
  total_sprints: 10,
  weight_kg: 80,
};
console.log('Test 1 - Light Intensity:');
console.log('Input:', test1);
console.log('Intensity Level:', getIntensityLevel(test1.avg_speed_kmh));
console.log(
  'Intensity Multiplier:',
  getIntensityMultiplier(test1.avg_speed_kmh)
);
console.log('Calories Burned:', calculateCaloriesBurned(test1));
console.log('Expected: ~(1.5 × 80 × 0.9 × 1.2) + 50 = 180 calories\n');

// Test Case 2: Moderate intensity (3-5 km/h)
const test2 = {
  distance_km: 2.0,
  avg_speed_kmh: 4.0,
  total_sprints: 15,
  weight_kg: 80,
};
console.log('Test 2 - Moderate Intensity:');
console.log('Input:', test2);
console.log('Intensity Level:', getIntensityLevel(test2.avg_speed_kmh));
console.log(
  'Intensity Multiplier:',
  getIntensityMultiplier(test2.avg_speed_kmh)
);
console.log('Calories Burned:', calculateCaloriesBurned(test2));
console.log('Expected: ~(2.0 × 80 × 0.9 × 1.5) + 75 = 291 calories\n');

// Test Case 3: Vigorous intensity (5-7 km/h)
const test3 = {
  distance_km: 2.5,
  avg_speed_kmh: 6.0,
  total_sprints: 20,
  weight_kg: 80,
};
console.log('Test 3 - Vigorous Intensity:');
console.log('Input:', test3);
console.log('Intensity Level:', getIntensityLevel(test3.avg_speed_kmh));
console.log(
  'Intensity Multiplier:',
  getIntensityMultiplier(test3.avg_speed_kmh)
);
console.log('Calories Burned:', calculateCaloriesBurned(test3));
console.log('Expected: ~(2.5 × 80 × 0.9 × 1.8) + 100 = 424 calories\n');

// Test Case 4: High intensity (> 7 km/h)
const test4 = {
  distance_km: 3.0,
  avg_speed_kmh: 8.5,
  total_sprints: 25,
  weight_kg: 80,
};
console.log('Test 4 - High Intensity:');
console.log('Input:', test4);
console.log('Intensity Level:', getIntensityLevel(test4.avg_speed_kmh));
console.log(
  'Intensity Multiplier:',
  getIntensityMultiplier(test4.avg_speed_kmh)
);
console.log('Calories Burned:', calculateCaloriesBurned(test4));
console.log('Expected: ~(3.0 × 80 × 0.9 × 2.2) + 125 = 600 calories\n');

// Test Case 5: Real data from your analysis (distance: 2.21km, avg_speed: 12.45 km/h)
const test5 = {
  distance_km: 2.21,
  avg_speed_kmh: 12.45,
  total_sprints: 18,
  weight_kg: 80,
};
console.log('Test 5 - Real Analysis Data:');
console.log('Input:', test5);
console.log('Intensity Level:', getIntensityLevel(test5.avg_speed_kmh));
console.log(
  'Intensity Multiplier:',
  getIntensityMultiplier(test5.avg_speed_kmh)
);
console.log('Calories Burned:', calculateCaloriesBurned(test5));
console.log('Expected: ~(2.21 × 80 × 0.9 × 2.2) + 90 = 440 calories\n');

// Test Case 6: Missing distance (should return 0)
const test6 = {
  distance_km: 0,
  avg_speed_kmh: 5.0,
  total_sprints: 10,
  weight_kg: 80,
};
console.log('Test 6 - Missing Distance:');
console.log('Input:', test6);
console.log('Calories Burned:', calculateCaloriesBurned(test6));
console.log('Expected: 0 (invalid distance)\n');

console.log('=== Summary ===');
console.log(
  'Formula: Calories = (Distance(km) × Weight(kg) × 0.9 × Intensity_Multiplier) + (Sprint_Count × 5)'
);
console.log('Intensity Multipliers:');
console.log('  < 3 km/h: 1.2 (Light)');
console.log('  3-5 km/h: 1.5 (Moderate)');
console.log('  5-7 km/h: 1.8 (Vigorous)');
console.log('  > 7 km/h: 2.2 (High)');
console.log('Sprint Bonus: 5 calories per sprint burst');
console.log('Default Weight: 80kg');
console.log('✅ NO DURATION NEEDED - Uses distance and speed only!');
