// Alternatives of required checklist items; null means gear absent from the checklist.
export const MOVEMENT_EQUIPMENT: Record<string, readonly (readonly string[])[] | null> = {
  "Back Squat": [["Barbell", "Plates", "Rack"]],
  "Front Squat": [["Barbell", "Plates", "Rack"]],
  "Overhead Squat": [["Barbell", "Plates"]],
  "Deadlift": [["Barbell", "Plates"]],
  "Sumo Deadlift High Pull": [["Barbell", "Plates"]],
  "Strict Press": [["Barbell", "Plates"]],
  "Push Press": [["Barbell", "Plates"]],
  "Push Jerk": [["Barbell", "Plates"]],
  "Split Jerk": [["Barbell", "Plates"]],
  "Bench Press": null,
  "Power Clean": [["Barbell", "Plates"]],
  "Squat Clean": [["Barbell", "Plates"]],
  "Hang Power Clean": [["Barbell", "Plates"]],
  "Clean and Jerk": [["Barbell", "Plates"]],
  "Power Snatch": [["Barbell", "Plates"]],
  "Squat Snatch": [["Barbell", "Plates"]],
  "Hang Power Snatch": [["Barbell", "Plates"]],
  "Thruster": [["Barbell", "Plates"]],
  "Clusters": [["Barbell", "Plates"]],
  "Kettlebell Swing": [["Kettlebells"]],
  "Goblet Squat": [["Kettlebells"], ["Dumbbells"]],
  "Dumbbell Snatch": [["Dumbbells"]],
  "Dumbbell Thruster": [["Dumbbells"]],
  "Wall Ball": null,
  "Front Rack Lunge": [["Barbell", "Plates"]],
  "Turkish Get-Up": [["Kettlebells"], ["Dumbbells"]],
  "Pull-Up": [["Pull-up bar"]],
  "Chest-to-Bar Pull-Up": [["Pull-up bar"]],
  "Bar Muscle-Up": [["Pull-up bar"]],
  "Ring Muscle-Up": [["Rings"]],
  "Ring Row": [["Rings"]],
  "Toes-to-Bar": [["Pull-up bar"]],
  "Knees-to-Elbows": [["Pull-up bar"]],
  "Push-Up": [[]],
  "Hand-Release Push-Up": [[]],
  "Ring Dip": [["Rings"]],
  "Handstand Push-Up": [[]],
  "Strict Handstand Push-Up": [[]],
  "Handstand Walk": [[]],
  "Pistol": [[]],
  "Air Squat": [[]],
  "Burpee": [[]],
  "Burpee Box Jump-Over": [["Box"]],
  "Box Jump": [["Box"]],
  "Box Step-Up": [["Box"]],
  "Sit-Up": [[]],
  "GHD Sit-Up": null,
  "Rope Climb": null,
  "Walking Lunge": [[]],
  "Plank": [[]],
  "Run": [[]],
  "Row": [["Rower"]],
  "Bike Erg": [["Bike"]],
  "Assault Bike": [["Bike"]],
  "Ski Erg": null,
  "Double-Under": [["Jump rope"]],
  "Single-Under": [["Jump rope"]],
  "Swim": null,
  "Sled Push": null,
  "Farmers Carry": [["Dumbbells"], ["Kettlebells"]],
  "Sandbag Carry": null,
  "Med Ball Clean": null,
};

export function filterMovementsByEquipment<T extends { id: string; name: string; easier_movement_id?: string | null; harder_movement_id?: string | null }>(
  library: T[], location: string, equipment: string[],
) {
  const fullyEquipped = location === "gym" && equipment.length === 0;
  const available = new Set(equipment);
  const filtered = library.filter((movement) => {
    const requirements = Object.hasOwn(MOVEMENT_EQUIPMENT, movement.name) ? MOVEMENT_EQUIPMENT[movement.name] : undefined;
    return fullyEquipped || requirements === undefined || requirements?.some((items) => items.every((item) => available.has(item)));
  });
  const allowed = new Set(filtered.map((movement) => movement.id));
  return filtered.map((movement) => ({
    ...movement,
    ...(!Object.hasOwn(MOVEMENT_EQUIPMENT, movement.name) ? { equipment_status: "equipment unknown" } : {}),
    ...(movement.easier_movement_id && !allowed.has(movement.easier_movement_id) ? { easier_movement_id: null } : {}),
    ...(movement.harder_movement_id && !allowed.has(movement.harder_movement_id) ? { harder_movement_id: null } : {}),
  }));
}
