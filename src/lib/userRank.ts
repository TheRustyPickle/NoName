type LevelInfo = {
	level: number;
	currentLevelPoints: number;
	nextLevelPoints: number;
	progress: number;
};

export function getLevelInfo(points: number): LevelInfo {
	const base = 100;
	const multiplier = 1.2;

	let level = 1;
	let threshold = base;
	let previousThreshold = 0;

	while (points >= threshold) {
		level++;
		previousThreshold = threshold;
		threshold += base * multiplier ** (level - 2);
	}

	const currentLevelPoints = Math.floor(points - previousThreshold);
	const nextLevelPoints = Math.floor(threshold - previousThreshold);
	const progress = currentLevelPoints / nextLevelPoints;

	return {
		level,
		currentLevelPoints,
		nextLevelPoints,
		progress: Math.min(progress, 1),
	};
}
