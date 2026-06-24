"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { redirect } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	createInitialPoints,
	createSnakeEndMessage,
	createSnakeMessage,
	type SnakeData,
} from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import { noZoom } from "@/hooks/noZoom";

const BASE_HUE = 185;
const HUE_SHIFT_PER_SEGMENT = 5;

const TOUCH_SWIPE_THRESHOLD = 30;
const GRID_SIZE = 18;
const CELL_SIZE_PX = 20;
const BASE_GAME_SPEED_MS = 200;
const STAGGER_CHILDREN_FACTOR = 0.015;
const BASE = 24;
const MULTIPLIER = 0.12;
const MILESTONE_BONUS = 100;
const LEVEL_INTERVAL = 10;

type Coordinate = { x: number; y: number };
type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

function useInterval(callback: () => void, delay: number | null) {
	const savedCallback = useRef<(() => void) | null>(null);

	useEffect(() => {
		savedCallback.current = callback;
	}, [callback]);

	useEffect(() => {
		function tick() {
			savedCallback.current?.();
		}
		if (delay !== null) {
			const id = setInterval(tick, delay);
			return () => clearInterval(id);
		}
	}, [delay]);
}

const isOppositeDirection = (dir1: Direction, dir2: Direction): boolean => {
	return (
		(dir1 === "UP" && dir2 === "DOWN") ||
		(dir1 === "DOWN" && dir2 === "UP") ||
		(dir1 === "LEFT" && dir2 === "RIGHT") ||
		(dir1 === "RIGHT" && dir2 === "LEFT")
	);
};

const getRandomFoodPosition = (snakeBody: Coordinate[]): Coordinate => {
	let newFoodPos: Coordinate;
	const occupied = new Set(snakeBody.map((seg) => `${seg.x}-${seg.y}`));
	do {
		newFoodPos = {
			x: Math.floor(Math.random() * GRID_SIZE),
			y: Math.floor(Math.random() * GRID_SIZE),
		};
	} while (occupied.has(`${newFoodPos.x}-${newFoodPos.y}`));
	return newFoodPos;
};

export default function Snake() {
	noZoom();

	const isDark = false;

	const [justAte, setJustAte] = useState(false);
	const [lastEaten, setLastEaten] = useState<{ x: number; y: number } | null>(
		null,
	);

	const [noSend, setNoSend] = useState(false);
	const [mainPoints, setMainPoints] = useState(0);

	const [snakeData, setSnakeData] = useState<SnakeData | null>(null);
	const [snakeLength, setSnakeLength] = useState<number>(1);

	const [snake, setSnake] = useState<Coordinate[]>([{ x: 10, y: 10 }]);
	const [food, setFood] = useState<Coordinate>(() =>
		getRandomFoodPosition([{ x: 10, y: 10 }]),
	);
	const [direction, setDirection] = useState<Direction>("RIGHT");
	const directionRef = useRef<Direction>(direction);
	const inputQueueRef = useRef<Direction[]>([]);
	const [isGameOver, setIsGameOver] = useState<boolean>(false);
	const [score, setScore] = useState<number>(0);
	const [level, setLevel] = useState<number>(1);
	const [isRunning, setIsRunning] = useState<boolean>(false);
	const [gameSpeed, setGameSpeed] = useState<number>(BASE_GAME_SPEED_MS);
	const [shockwave, setShockwave] = useState<{
		x: number;
		y: number;
		key: number;
	} | null>(null);

	const touchStartRef = useRef<{ x: number; y: number } | null>(null);

	useEffect(() => {
		ws.sendMessage(createInitialPoints());
	}, []);

	useEffect(() => {
		const unsubNewSnake = ws.subscribeToNewSnake((data) => {
			const new_score = data.points;
			const new_length = data.length;
			const newLevel = data.level;

			while (snake.length > new_length) {
				snake.pop();
			}

			setSnakeLength(new_length);
			setScore(new_score);
			setLevel(newLevel);
			setSnakeData(data);

			setNoSend(true);
		});

		const unsubInitialPoint = ws.subscribeToUpdatedPoints((initial_point) => {
			setMainPoints(initial_point);
		});

		return () => {
			unsubNewSnake();
			unsubInitialPoint();
		};
	}, [snake]);

	const handleStartRestart = useCallback(() => {
		const startPosition = [{ x: 10, y: 10 }];
		setSnake(startPosition);
		setFood(getRandomFoodPosition(startPosition));
		setDirection("RIGHT");
		directionRef.current = "RIGHT";
		inputQueueRef.current = [];
		setScore(0);
		setLevel(1);
		setSnakeData(null);
		setIsGameOver(false);
		setIsRunning(true);
		setGameSpeed(BASE_GAME_SPEED_MS);
		setShockwave(null);
		ws.sendMessage(createInitialPoints());
		ws.sendMessage(createSnakeEndMessage());
	}, []);

	const queueDirectionChange = useCallback(
		(newDirection: Direction) => {
			const lastQueuedDirection =
				inputQueueRef.current.length > 0
					? inputQueueRef.current[inputQueueRef.current.length - 1]
					: directionRef.current;

			if (
				newDirection !== lastQueuedDirection &&
				!isOppositeDirection(newDirection, lastQueuedDirection) &&
				inputQueueRef.current.length < 2
			) {
				inputQueueRef.current.push(newDirection);
			}

			if (!isRunning && !isGameOver) {
				setIsRunning(true);
			}
		},
		[isRunning, isGameOver],
	);

	const gameLoop = useCallback(() => {
		if (isGameOver || !isRunning) return;

		let processedInput = false;
		while (inputQueueRef.current.length > 0 && !processedInput) {
			const nextDirection = inputQueueRef.current.shift();
			if (
				nextDirection &&
				!isOppositeDirection(nextDirection, directionRef.current)
			) {
				directionRef.current = nextDirection;
				setDirection(nextDirection);
				processedInput = true;
			}
		}

		setSnake((prevSnake) => {
			const newSnake = [...prevSnake];
			const head = { ...newSnake[0] };

			switch (directionRef.current) {
				case "UP":
					head.y -= 1;
					break;
				case "DOWN":
					head.y += 1;
					break;
				case "LEFT":
					head.x -= 1;
					break;
				case "RIGHT":
					head.x += 1;
					break;
			}

			const isWallCollision =
				head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE;
			const isSelfCollision = newSnake.some(
				(segment) => segment.x === head.x && segment.y === head.y,
			);

			if (isWallCollision || isSelfCollision) {
				setIsGameOver(true);
				setIsRunning(false);
				inputQueueRef.current = [];
				return prevSnake;
			}

			newSnake.unshift(head);

			const ateFood = head.x === food.x && head.y === food.y;
			if (ateFood) {
				setJustAte(true);
				setLastEaten({ x: food.x, y: food.y });
			} else {
				newSnake.pop();
			}

			return newSnake;
		});
	}, [food, isGameOver, isRunning]);

	useInterval(gameLoop, isRunning ? gameSpeed : null);

	useEffect(() => {
		if (!justAte || !lastEaten) return;

		let bonus = 0;
		let currentLevel = level;

		if (snake.length % LEVEL_INTERVAL === 0) {
			setGameSpeed((prev) => Math.max(60, prev - 5));
			setLevel(Math.floor(snake.length / LEVEL_INTERVAL) + 1);
			bonus += MILESTONE_BONUS;
			currentLevel += 1;
		}

		const multiplier = 1 + currentLevel * MULTIPLIER;
		const pointsEarned = Math.floor(BASE * multiplier) + bonus;
		setScore((s) => s + pointsEarned);

		setFood(getRandomFoodPosition(snake));
		setShockwave({ ...lastEaten, key: Date.now() });

		setJustAte(false);
		setLastEaten(null);
		setSnakeLength(snake.length);
	}, [justAte, lastEaten, snake.length, snake, level]);

	useEffect(() => {
		if (snakeLength === 1 || score === 0) return;

		setSnakeData((prevData) => {
			const timeNow = new Date().toISOString();

			const newData: SnakeData = {
				timestamp: timeNow,
				prev_timestamp: prevData?.timestamp ?? timeNow,
				points: score,
				prev_points: prevData?.points ?? 0,
				length: snakeLength,
				prev_length: prevData?.length ?? 1,
				level,
				prev_level: prevData?.level ?? 1,
			};

			if (
				prevData &&
				prevData.points === newData.points &&
				prevData.length === newData.length &&
				prevData.level === newData.level
			) {
				return prevData;
			}

			setNoSend(false);

			return newData;
		});
	}, [snakeLength, score, level]);

	useEffect(() => {
		if (!snakeData || noSend) return;

		ws.sendMessage(createSnakeMessage(snakeData));
	}, [snakeData, noSend]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (isGameOver && e.key !== "Enter" && e.key !== " ") return;

			let newDirection: Direction | null = null;
			switch (e.key) {
				case "ArrowUp":
				case "w":
					newDirection = "UP";
					break;
				case "ArrowDown":
				case "s":
					newDirection = "DOWN";
					break;
				case "ArrowLeft":
				case "a":
					newDirection = "LEFT";
					break;
				case "ArrowRight":
				case "d":
					newDirection = "RIGHT";
					break;
				case " ":
					if (isGameOver) {
						handleStartRestart();
					} else {
						setIsRunning((prev) => !prev); // Toggle pause/resume
					}
					e.preventDefault();
					break;
				case "Enter":
					if (isGameOver) {
						handleStartRestart();
					}
					break;
				default:
					break;
			}

			if (newDirection) {
				queueDirectionChange(newDirection);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isGameOver, handleStartRestart, queueDirectionChange]);

	useEffect(() => {
		const handleTouchStart = (e: TouchEvent) => {
			if (e.touches.length === 1) {
				const touch = e.touches[0];
				touchStartRef.current = { x: touch.clientX, y: touch.clientY };
			}
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (!touchStartRef.current || e.touches.length !== 1) return;

			const touch = e.touches[0];
			const deltaX = touch.clientX - touchStartRef.current.x;
			const deltaY = touch.clientY - touchStartRef.current.y;
			const absDeltaX = Math.abs(deltaX);
			const absDeltaY = Math.abs(deltaY);

			if (Math.max(absDeltaX, absDeltaY) > TOUCH_SWIPE_THRESHOLD) {
				if (absDeltaX > absDeltaY) {
					queueDirectionChange(deltaX > 0 ? "RIGHT" : "LEFT");
				} else {
					queueDirectionChange(deltaY > 0 ? "DOWN" : "UP");
				}
				touchStartRef.current = { x: touch.clientX, y: touch.clientY };
			}
		};

		const handleTouchEnd = () => {
			touchStartRef.current = null;
		};

		window.addEventListener("touchstart", handleTouchStart, { passive: true });
		window.addEventListener("touchmove", handleTouchMove, { passive: false });
		window.addEventListener("touchend", handleTouchEnd, { passive: true });

		return () => {
			window.removeEventListener("touchstart", handleTouchStart);
			window.removeEventListener("touchmove", handleTouchMove);
			window.removeEventListener("touchend", handleTouchEnd);
		};
	}, [queueDirectionChange]);

	const animationDuration = (gameSpeed / 1000) * 0.95;

	const snakeContainerVariants: Variants = {
		animate: { transition: { staggerChildren: STAGGER_CHILDREN_FACTOR } },
	};

	type SnakeSegmentCustomData = {
		x: number;
		y: number;
		isHead: boolean;
		direction: Direction;
		index: number;
	};

	const snakeSegmentVariants: Variants = {
		animate: (customData: SnakeSegmentCustomData) => {
			const { x, y, isHead, direction, index } = customData;

			let headRotation = 0;
			if (isHead) {
				switch (direction) {
					case "UP":
						headRotation = -90;
						break;
					case "DOWN":
						headRotation = 90;
						break;
					case "LEFT":
						headRotation = 180;
						break;
					case "RIGHT":
						headRotation = 0;
						break;
				}
			}

			// Calculate color and glow based on segment index
			const hue = (BASE_HUE + index * HUE_SHIFT_PER_SEGMENT) % 360;
			const color = `hsl(${hue}, 100%, 55%)`;
			const colorLight = `hsl(${hue}, 95%, 65%)`;
			const neonGlow = `0 0 4px ${color}, 0 0 7px ${color}, 0 0 10px ${colorLight}`;

			return {
				x: x * CELL_SIZE_PX,
				y: y * CELL_SIZE_PX,
				scale: isHead ? 1.1 : 1, // Make head slightly larger
				rotate: headRotation, // Apply rotation only to head
				background: isHead
					? `radial-gradient(circle, ${colorLight}, ${color})` // Head gradient
					: `linear-gradient(to right bottom, ${color}, ${colorLight})`, // Body gradient
				boxShadow: neonGlow,
				transition: { duration: animationDuration, ease: "linear" }, // Linear ease for smooth movement
			};
		},

		initial: (customData: SnakeSegmentCustomData) => {
			const { x, y, isHead, index } = customData;
			const hue = (BASE_HUE + index * HUE_SHIFT_PER_SEGMENT) % 360;
			const color = `hsl(${hue}, 100%, 55%)`;
			const colorLight = `hsl(${hue}, 95%, 65%)`;

			return {
				x: x * CELL_SIZE_PX,
				y: y * CELL_SIZE_PX,
				scale: isHead ? 1.1 : 1,
				rotate: 0,
				background: isHead
					? `radial-gradient(circle, ${colorLight}, ${color})`
					: `linear-gradient(to right bottom, ${color}, ${colorLight})`,
				// Initial shadow might be less intense or omitted if desired
				boxShadow: `0 0 4px ${color}, 0 0 7px ${color}, 0 0 10px ${colorLight}`,
			};
		},
	};

	// --- Render ---
	const gridWidth = GRID_SIZE * CELL_SIZE_PX;
	const gridHeight = GRID_SIZE * CELL_SIZE_PX;

	const mainTextColor = isDark ? "text-gray-200" : "text-gray-800";
	const boardBgColor = isDark ? "#1f2937" : "#f9fafb";
	const gridColor = isDark
		? "rgba(75, 85, 99, 0.5)"
		: "rgba(209, 213, 219, 0.6)";
	const boardBorderColor = "#3b82f6";
	const overlayBg = isDark ? "bg-black/60" : "bg-gray-100/70";

	const scoreColor = isDark ? "text-teal-300" : "text-teal-500";
	const scoreTitleColor = isDark ? "text-teal-400" : "text-teal-400";
	const boardShadowColor1 = "#60a5fa";
	const boardShadowColor2 = "#3b82f6";
	const snakeEyeColor = "bg-white shadow-[0_0_3px_#fff,0_0_5px_#fff]";
	const foodColor1 = isDark ? "#6ee7b7" : "#34d399";
	const foodColor2 = isDark ? "#34d399" : "#10b981";
	const shockwaveColor = isDark ? "#6ee7b7" : "#34d399";
	const shockwaveShadowColor = isDark ? "#34d399" : "#10b981";
	const gameOverTextColor = isDark ? "text-red-500" : "text-red-700";
	const gameOverShadow = isDark
		? "0 0 5px #f00, 0 0 10px #f00"
		: "0 0 3px #fca5a5";
	const finalScoreTextColor = isDark ? "text-teal-300" : "text-teal-600";
	const finalScoreShadow = isDark ? "0 0 5px #06b6d4" : "0 0 3px #2dd4bf";
	const buttonStartBorder = "border-teal-400";
	const buttonStartText = "text-teal-300";
	const buttonBackground = isDark ? "bg-gray-900" : "bg-white";
	const buttonStartShadow = "shadow-[0_0_4px_#2dd4bf]";
	const buttonStartHoverBg = "hover:bg-teal-400";
	const buttonStartHoverText = "hover:text-teal-100";

	const scoreBoxBorder = "border-teal-400";
	const scoreBoxShadow = isDark ? "0 0 4px #2dd4bf" : "0 0 4px #0d9488";

	return (
		<div
			className={`flex flex-col items-center justify-center p-2 sm:p-4 font-sans overflow-hidden ${mainTextColor}`}
		>
			{/* Score Display */}
			<div className="flex flex-row gap-4 items-center mb-4">
				{/* Back Button */}
				<button
					type="button"
					onClick={() => {
						redirect("/games");
					}}
					className={`flex items-center justify-center h-15 w-20 rounded-md border ${buttonStartBorder} ${buttonBackground} ${buttonStartText} ${buttonStartShadow} ${buttonStartHoverBg} ${buttonStartHoverText} transition-all duration-150`}
					style={{ boxShadow: buttonStartShadow }}
				>
					<ArrowLeft />
					Back
				</button>

				{/* Score */}
				<div
					className={`flex flex-col items-center px-4 py-2 h-15 rounded-md border ${scoreBoxBorder} ${scoreColor} font-mono`}
					style={{ boxShadow: scoreBoxShadow }}
				>
					<p className={`${scoreTitleColor} text-xs uppercase tracking-wider`}>
						Score
					</p>
					<motion.p
						key={score}
						initial={{ scale: 1.5, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ type: "spring", stiffness: 300, damping: 15 }}
						className="text-lg font-bold"
					>
						{score}
					</motion.p>
				</div>

				{/* Points */}
				<div
					className={`flex flex-col items-center px-4 py-2 h-15 rounded-md border ${scoreBoxBorder} ${scoreColor} font-mono`}
					style={{ boxShadow: scoreBoxShadow }}
				>
					<p className={`${scoreTitleColor} text-xs uppercase tracking-wider`}>
						Points
					</p>
					<motion.p
						key={score + mainPoints}
						initial={{ scale: 1.5, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ type: "spring", stiffness: 300, damping: 15 }}
						className="text-lg font-bold"
					>
						{score + mainPoints}
					</motion.p>
				</div>

				{/* Foods */}
				<div
					className={`flex flex-col items-center px-4 py-2 h-15 rounded-md border ${scoreBoxBorder} ${scoreColor} font-mono`}
					style={{ boxShadow: scoreBoxShadow }}
				>
					<p className={`${scoreTitleColor} text-xs uppercase tracking-wider`}>
						Foods
					</p>
					<motion.p
						key={snake.length - 1}
						initial={{ scale: 1.5, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ type: "spring", stiffness: 300, damping: 15 }}
						className="text-lg font-bold"
					>
						{snake.length - 1}
					</motion.p>
				</div>
			</div>

			{/* Game Board Area */}
			<motion.div
				className="relative border-4 rounded-md overflow-hidden" // Classic border color applied via style
				style={{
					width: `${gridWidth}px`,
					height: `${gridHeight}px`,
					boxSizing: "content-box",
					backgroundColor: boardBgColor,
					backgroundImage: `linear-gradient(to right, ${gridColor} 1px, transparent 1px), linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)`,
					backgroundSize: `${CELL_SIZE_PX}px ${CELL_SIZE_PX}px`,
					borderColor: boardBorderColor,
				}}
				animate={{
					// Neon Pulsing Shadow
					boxShadow: [
						`0 0 10px ${boardShadowColor1}, 0 0 15px ${boardShadowColor1}`,
						`0 0 15px ${boardShadowColor2}, 0 0 25px ${boardShadowColor2}`,
						`0 0 10px ${boardShadowColor1}, 0 0 15px ${boardShadowColor1}`,
					],
				}}
				transition={{
					duration: 1.5,
					repeat: Number.POSITIVE_INFINITY,
					ease: "easeInOut",
				}}
			>
				{/* Snake Container */}
				<motion.div
					className="absolute inset-0"
					variants={snakeContainerVariants}
					initial={false}
					animate="animate"
				>
					{snake.map((segment, index) => {
						const isHead = index === 0;
						return (
							<motion.div
								// biome-ignore lint/suspicious/noArrayIndexKey: don't care
								key={index}
								className={`absolute rounded ${isHead ? "z-10 " : "z-0 "}`}
								variants={snakeSegmentVariants}
								custom={{
									x: segment.x,
									y: segment.y,
									isHead: isHead,
									direction: direction,
									index: index,
								}}
								initial="initial"
								animate="animate"
								style={{
									width: `${CELL_SIZE_PX}px`,
									height: `${CELL_SIZE_PX}px`,
								}}
							>
								{isHead && ( // Neon Eyes
									<div className="relative w-full h-full">
										<div
											className={`absolute rounded-full ${snakeEyeColor}`}
											style={{
												width: "4px",
												height: "4px",
												top: "4px",
												right: "4px",
											}}
										/>
										<div
											className={`absolute rounded-full ${snakeEyeColor}`}
											style={{
												width: "4px",
												height: "4px",
												bottom: "4px",
												right: "4px",
											}}
										/>
									</div>
								)}
							</motion.div>
						);
					})}
				</motion.div>

				{/* Food */}
				<motion.div
					key={`food-${food.x}-${food.y}`}
					className="absolute rounded-full" // Neon Food Style applied via animate
					initial={{ scale: 0, opacity: 0 }}
					animate={{
						x: food.x * CELL_SIZE_PX,
						y: food.y * CELL_SIZE_PX,
						scale: [1, 1.2, 1],
						opacity: 1,
						background: `radial-gradient(circle, ${foodColor1}, ${foodColor2})`, // Neon Gradient
						boxShadow: `0 0 8px ${foodColor1}, 0 0 12px ${foodColor1}, 0 0 16px ${foodColor2}`, // Neon Shadow
					}}
					transition={{
						// Animate position changes instantly (or very fast)
						x: { duration: 0.05 },
						y: { duration: 0.05 },
						// Opacity fade-in
						opacity: { duration: 0.2 },
						// Scale animation loop
						scale: {
							duration: 0.8,
							repeat: Number.POSITIVE_INFINITY,
							ease: "easeInOut",
							delay: 0.2,
						},
					}}
					style={{
						width: `${CELL_SIZE_PX}px`,
						height: `${CELL_SIZE_PX}px`,
						zIndex: 5,
					}}
				/>

				{/* Food Eat Shockwave */}
				<AnimatePresence>
					{shockwave && (
						<motion.div
							key={shockwave.key}
							className="absolute rounded-full border-2 pointer-events-none" // Neon Shockwave applied via initial/animate
							initial={{
								x: shockwave.x * CELL_SIZE_PX,
								y: shockwave.y * CELL_SIZE_PX,
								scale: 0,
								opacity: 0.8,
								borderColor: shockwaveColor,
								boxShadow: `0 0 10px ${shockwaveColor}`,
								width: CELL_SIZE_PX,
								height: CELL_SIZE_PX,
							}}
							animate={{
								scale: 4,
								opacity: 0,
								borderColor: shockwaveShadowColor,
								boxShadow: `0 0 30px ${shockwaveShadowColor}`,
							}}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.5, ease: "easeOut" }}
							style={{ transformOrigin: "center center", zIndex: 20 }}
						/>
					)}
				</AnimatePresence>

				{/* Overlays */}
				<AnimatePresence>
					{isGameOver && (
						<motion.div
							className={`absolute inset-0 ${overlayBg} backdrop-blur-sm flex flex-col items-center justify-center z-30`} // Classic Overlay BG
							initial={{ opacity: 0, scale: 0.7 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.7 }}
							transition={{ duration: 0.4, ease: "easeOut" }}
						>
							{/* Neon Game Over Text */}
							<motion.div
								className={`text-4xl sm:text-5xl font-bold mb-3 ${gameOverTextColor}`}
								style={{ textShadow: gameOverShadow }}
							>
								GAME OVER!
							</motion.div>
							<motion.div
								className={`text-2xl sm:text-3xl mb-8 ${finalScoreTextColor} font-mono`}
								style={{ textShadow: finalScoreShadow }}
							>
								Final Score: {score}
							</motion.div>
							{/* Neon Restart Button */}
							<Button
								onClick={handleStartRestart}
								size="lg"
								className={`${buttonStartBorder} ${buttonBackground} ${buttonStartText} ${buttonStartShadow} ${buttonStartHoverBg} ${buttonStartHoverText} transition-all duration-300 px-6 py-3 text-lg`}
							>
								RESTART
							</Button>
						</motion.div>
					)}
				</AnimatePresence>

				{!isRunning && !isGameOver && (
					<div
						className={`absolute inset-0 ${overlayBg} backdrop-blur-sm flex flex-col items-center justify-center z-30 text-center p-4`}
					>
						{score === 0 && snake.length === 1 ? (
							<>
								<div
									className={`text-2xl font-semibold mb-3 ${buttonStartText}`}
									style={{ textShadow: buttonStartShadow }}
								>
									Ready?
								</div>
								<div
									className={`text-md mb-4 ${isDark ? "text-gray-400" : "text-gray-600"}`}
								>
									Use Arrow Keys, WASD, or Swipe (Hold for continuous) to move.
								</div>
								<Button
									onClick={() => setIsRunning(true)}
									size="lg"
									className={`${buttonStartBorder} ${buttonBackground} ${buttonStartText} ${buttonStartShadow} ${buttonStartHoverBg} ${buttonStartHoverText} transition-colors px-5 py-2.5 text-base`}
								>
									Start Game
								</Button>
							</>
						) : (
							// Neon Paused Text
							<div
								className={`text-3xl font-semibold mb-5 ${buttonStartText}`}
								style={{ textShadow: buttonStartShadow }}
							>
								Paused
							</div>
						)}
					</div>
				)}
			</motion.div>

			{/* Controls Area */}
			<div className="mt-3 sm:mt-4 flex flex-col items-center space-y-3">
				<motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
					{!isGameOver && (
						// Neon Pause/Resume Buttons
						<Button
							onClick={() => setIsRunning((prev) => !prev)}
							className={`w-28 sm:w-32 transition-all duration-200 ${buttonBackground} ${buttonStartBorder} ${buttonStartText} ${buttonStartShadow} ${buttonStartHoverBg} ${buttonStartHoverText}`}
							disabled={isGameOver}
						>
							{isRunning ? "Pause" : "Resume"}
						</Button>
					)}
				</motion.div>
			</div>

			{isRunning && (
				<div className="mt-6 grid grid-cols-3 gap-2">
					<div className="col-start-2">
						<Button
							type="button"
							onClick={() => queueDirectionChange("UP")}
							className={`w-20 h-15   border rounded ${buttonBackground} ${buttonStartBorder} ${buttonStartText} ${buttonStartShadow} ${buttonStartHoverBg} ${buttonStartHoverText} transition-all duration-200 px-5 py-2.5 text-base`}
							disabled={isGameOver}
						>
							<ArrowUp className="w-6 h-6" />
						</Button>
					</div>
					<div className="col-start-1 row-start-2">
						<Button
							type="button"
							onClick={() => queueDirectionChange("LEFT")}
							className={`w-20 h-15  border rounded ${buttonBackground} ${buttonStartBorder} ${buttonStartText} ${buttonStartShadow} ${buttonStartHoverBg} ${buttonStartHoverText} transition-all duration-200 px-5 py-2.5 text-base`}
							disabled={isGameOver}
						>
							<ArrowLeft className="w-6 h-6" />
						</Button>
					</div>
					<div className="col-start-2 row-start-2">
						<Button
							type="button"
							onClick={() => queueDirectionChange("DOWN")}
							className={`w-20 h-15  border rounded ${buttonBackground} ${buttonStartBorder} ${buttonStartText} ${buttonStartShadow} ${buttonStartHoverBg} ${buttonStartHoverText} transition-all duration-200 px-5 py-2.5 text-base`}
							disabled={isGameOver}
						>
							<ArrowDown className="w-6 h-6" />
						</Button>
					</div>
					<div className="col-start-3 row-start-2">
						<Button
							type="button"
							onClick={() => queueDirectionChange("RIGHT")}
							className={`w-20 h-15 border rounded ${buttonBackground} ${buttonStartBorder} ${buttonStartText} ${buttonStartShadow} ${buttonStartHoverBg} ${buttonStartHoverText} transition-all duration-200 px-5 py-2.5 text-base`}
							disabled={isGameOver}
						>
							<ArrowRight className="w-6 h-6" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
