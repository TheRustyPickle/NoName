"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	RotateCcw,
} from "lucide-react";
import { redirect } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	createInitialPoints,
	createTwo048EndMessage,
	createTwo048Message,
	type Two048Data,
} from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import { noZoom } from "@/hooks/noZoom";

const GRID_SIZE = 4;
const MIN_SWIPE_DISTANCE = 40;

const tilePoints: Map<number, number> = new Map([
	[8, 40],
	[16, 80],
	[32, 150],
	[64, 300],
	[128, 600],
	[256, 1200],
	[512, 3000],
	[1024, 7500],
	[2048, 10000],
	[4096, 20000],
	[8192, 50000],
]);

type Board = number[][];

const createEmptyBoard = (): Board =>
	Array(GRID_SIZE)
		.fill(null)
		.map(() => Array(GRID_SIZE).fill(0));

const addRandomTile = (board: Board): Board => {
	const newBoard = board.map((row) => [...row]);
	const emptyCells: { r: number; c: number }[] = [];
	for (let r = 0; r < GRID_SIZE; r++) {
		for (let c = 0; c < GRID_SIZE; c++) {
			if (newBoard[r][c] === 0) {
				emptyCells.push({ r, c });
			}
		}
	}
	if (emptyCells.length > 0) {
		const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
		newBoard[r][c] = Math.random() < 0.9 ? 2 : 4;
	}
	return newBoard;
};

const boardsAreEqual = (board1: Board, board2: Board): boolean => {
	for (let r = 0; r < GRID_SIZE; r++) {
		for (let c = 0; c < GRID_SIZE; c++) {
			if ((board1?.[r]?.[c] ?? 0) !== (board2?.[r]?.[c] ?? 0)) {
				return false;
			}
		}
	}
	return true;
};

const isGameOver = (board: Board): boolean => {
	for (let r = 0; r < GRID_SIZE; r++) {
		for (let c = 0; c < GRID_SIZE; c++) {
			if (board[r][c] === 0) return false;
			if (c < GRID_SIZE - 1 && board[r][c] === board[r][c + 1]) return false;
			if (r < GRID_SIZE - 1 && board[r][c] === board[r + 1][c]) return false;
		}
	}
	return true;
};

const calculateMaxTile = (board: Board): number => {
	let maxTile = 0;
	for (let r = 0; r < GRID_SIZE; r++) {
		for (let c = 0; c < GRID_SIZE; c++) {
			if (board[r][c] > maxTile) {
				maxTile = board[r][c];
			}
		}
	}

	if (maxTile === 2 || maxTile === 4) {
		return 0;
	}
	return maxTile;
};

const rotateBoard = (board: Board): Board => {
	const newBoard = createEmptyBoard();
	for (let r = 0; r < GRID_SIZE; r++) {
		for (let c = 0; c < GRID_SIZE; c++) {
			newBoard[c][GRID_SIZE - 1 - r] = board[r][c];
		}
	}
	return newBoard;
};

const processRow = (row: number[]): { newRow: number[] } => {
	const filteredRow = row.filter((tile) => tile !== 0);
	for (let i = 0; i < filteredRow.length - 1; i++) {
		if (filteredRow[i] === filteredRow[i + 1]) {
			filteredRow[i] *= 2;
			filteredRow.splice(i + 1, 1);
		}
	}
	const newRow = Array(GRID_SIZE).fill(0);
	for (let i = 0; i < filteredRow.length; i++) {
		newRow[i] = filteredRow[i];
	}
	return { newRow };
};

export default function Two048() {
	noZoom();

	const isDark = false;

	const [board, setBoard] = useState<Board>(createEmptyBoard);
	const [score, setScore] = useState(0);
	const [isOver, setIsOver] = useState(false);
	const [mainPoints, setMainPoints] = useState(0);
	const [maxTile, setMaxTile] = useState(0);

	const [noSend, setNoSend] = useState(false);
	const [toSend, setToSend] = useState<Two048Data | null>(null);

	const touchStartRef = useRef<{ x: number; y: number } | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: shut it
	useEffect(() => {
		initializeGame();
	}, []);

	useEffect(() => {
		ws.sendMessage(createInitialPoints());
	}, []);

	useEffect(() => {
		if (!toSend || noSend) return;

		ws.sendMessage(createTwo048Message(toSend));
	}, [toSend, noSend]);

	useEffect(() => {
		const unsubNewTwo048 = ws.subscribeToNewTwo048((data) => {
			setScore(data.points);
			setBoard(data.board);
			setNoSend(true);
			setToSend(data);
		});

		const unsubInitialPoint = ws.subscribeToUpdatedPoints((initial_point) => {
			setMainPoints(initial_point);
		});

		return () => {
			unsubNewTwo048();
			unsubInitialPoint();
		};
	}, []);

	const initializeGame = useCallback(() => {
		let initialBoard = createEmptyBoard();
		initialBoard = addRandomTile(initialBoard);
		initialBoard = addRandomTile(initialBoard);
		setBoard(initialBoard);
		setScore(0);
		setMaxTile(calculateMaxTile(initialBoard));
		setIsOver(false);
		setToSend(null);
		setNoSend(false);

		ws.sendMessage(createTwo048EndMessage());
		ws.sendMessage(createInitialPoints());
	}, []);

	const handleMove = useCallback(
		(direction: "Up" | "Down" | "Left" | "Right") => {
			if (isOver) return;

			const currentBoard = board.map((row) => [...row]);
			let rotatedBoard = currentBoard;
			let rotations = 0;

			switch (direction) {
				case "Up":
					rotations = 3;
					break;
				case "Right":
					rotations = 2;
					break;
				case "Down":
					rotations = 1;
					break;
				default:
					rotations = 0;
					break;
			}

			for (let i = 0; i < rotations; i++) {
				rotatedBoard = rotateBoard(rotatedBoard);
			}

			const processedBoard = createEmptyBoard();

			for (let r = 0; r < GRID_SIZE; r++) {
				const { newRow } = processRow(rotatedBoard[r]);
				processedBoard[r] = newRow;
			}

			let nextBoard = processedBoard;
			const rotationsBack = (4 - rotations) % 4;
			for (let i = 0; i < rotationsBack; i++) {
				nextBoard = rotateBoard(nextBoard);
			}

			if (!boardsAreEqual(currentBoard, nextBoard)) {
				const boardWithNewTile = addRandomTile(nextBoard);
				const maxTileGotten = calculateMaxTile(boardWithNewTile);
				let scoreToUse = score;

				if (maxTile !== maxTileGotten) {
					const newScore = tilePoints.get(maxTileGotten);
					if (newScore) {
						setScore(score + newScore);
						scoreToUse += newScore;
					}
				}
				setMaxTile(maxTileGotten);

				if (maxTileGotten === 8192) {
					setIsOver(true);
				}

				setToSend((prevData) => {
					const timeNow = new Date().toISOString();

					const newData: Two048Data = {
						timestamp: timeNow,
						prev_timestamp: prevData?.timestamp ?? timeNow,
						board: boardWithNewTile,
						prev_board: prevData?.board ?? board,
						direction: direction,
						points: scoreToUse,
						prev_points: prevData?.points ?? scoreToUse,
						highest_number: maxTileGotten,
						prev_highest_number: prevData?.highest_number ?? maxTileGotten,
					};

					if (
						prevData &&
						prevData.points === newData.points &&
						prevData.board === newData.board &&
						prevData.highest_number === newData.highest_number
					) {
						return prevData;
					}

					return newData;
				});
				setNoSend(false);

				setBoard(boardWithNewTile);

				if (isGameOver(boardWithNewTile)) {
					setIsOver(true);
				}
			}
		},
		[board, isOver, score, maxTile],
	);

	// Handle keyboard controls
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
				e.preventDefault();
			}
			switch (e.key) {
				case "ArrowUp":
					handleMove("Up");
					break;
				case "ArrowDown":
					handleMove("Down");
					break;
				case "ArrowLeft":
					handleMove("Left");
					break;
				case "ArrowRight":
					handleMove("Right");
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleMove]);

	const handleTouchStart = useCallback((e: TouchEvent) => {
		if (e.touches.length === 1) {
			touchStartRef.current = {
				x: e.touches[0].clientX,
				y: e.touches[0].clientY,
			};
		} else {
			touchStartRef.current = null;
		}
	}, []);

	const handleTouchMove = useCallback((e: TouchEvent) => {
		if (!touchStartRef.current || e.touches.length !== 1) {
			// If tracking was active but multi-touch occurred, stop tracking
			if (touchStartRef.current && e.touches.length > 1) {
				touchStartRef.current = null;
			}
			return;
		}

		const touch = e.touches[0];
		const deltaX = touch.clientX - touchStartRef.current.x;
		const deltaY = touch.clientY - touchStartRef.current.y;
		const absDeltaX = Math.abs(deltaX);
		const absDeltaY = Math.abs(deltaY);

		if (Math.max(absDeltaX, absDeltaY) > MIN_SWIPE_DISTANCE / 2) {
			e.preventDefault(); // Prevent browser pull-down-to-refresh or scrolling
		}
	}, []);

	const handleTouchEnd = useCallback(
		(e: TouchEvent) => {
			if (!touchStartRef.current || e.changedTouches.length !== 1) {
				touchStartRef.current = null;
				return;
			}

			const touchEndX = e.changedTouches[0].clientX;
			const touchEndY = e.changedTouches[0].clientY;
			const deltaX = touchEndX - touchStartRef.current.x;
			const deltaY = touchEndY - touchStartRef.current.y;

			// Reset touchStartRef immediately after calculating delta
			touchStartRef.current = null;

			// Trigger move only if the swipe distance threshold is met
			if (
				Math.abs(deltaX) > MIN_SWIPE_DISTANCE ||
				Math.abs(deltaY) > MIN_SWIPE_DISTANCE
			) {
				// Determine if it was a horizontal or vertical swipe
				if (Math.abs(deltaX) > Math.abs(deltaY)) {
					handleMove(deltaX > 0 ? "Right" : "Left");
				} else {
					handleMove(deltaY > 0 ? "Down" : "Up");
				}
			}
		},
		[handleMove],
	); // handleMove and MIN_SWIPE_DISTANCE are dependencies

	// --- Add Global Touch Listeners using useEffect ---
	useEffect(() => {
		// Add event listeners to the window object
		window.addEventListener("touchstart", handleTouchStart, { passive: true });
		window.addEventListener("touchmove", handleTouchMove, { passive: false });
		window.addEventListener("touchend", handleTouchEnd, { passive: true });

		// Clean up event listeners on component unmount
		return () => {
			window.removeEventListener("touchstart", handleTouchStart);
			window.removeEventListener("touchmove", handleTouchMove);
			window.removeEventListener("touchend", handleTouchEnd);
		};
	}, [handleTouchStart, handleTouchMove, handleTouchEnd]);

	const gap = "0.75rem";
	const boardPadding = "0.75rem";
	const totalGap = `(${GRID_SIZE - 1} * ${gap})`;
	const cellSizePercent = `(100% - ${totalGap}) / ${GRID_SIZE}`;

	const mainTextColor = isDark ? "text-gray-200" : "text-gray-900";
	const boardBgColor = isDark ? "bg-gray-900" : "bg-gray-200";
	const boardBorderColor = isDark ? "border-purple-500" : "border-fuchsia-500";
	const headerSubtitleColor = isDark ? "text-purple-400" : "text-fuchsia-600";

	const scoreColor = isDark ? "text-teal-300" : "text-cyan-600";
	const scoreContainerBg = isDark ? "bg-gray-900" : "bg-white";
	const scoreContainerBorder = isDark
		? "border-purple-500"
		: "border-fuchsia-500";
	const scoreContainerShadow = isDark ? "0 0 8px #ff00ff" : "0 0 8px #d946ef";
	const scoreLabelColor = isDark ? "text-purple-400" : "text-fuchsia-600";

	const cellBgColor = isDark ? "bg-gray-800" : "bg-gray-200";
	const cellShadow = isDark
		? "inset 0 1px 3px rgba(0,0,0,0.5)"
		: "inset 0 1px 3px rgba(0,0,0,0.2)";

	const kbdBorder = isDark ? "border-purple-600" : "border-fuchsia-600";
	const kbdBg = isDark ? "bg-gray-800" : "bg-gray-300";

	const dialogBg = isDark ? "bg-gray-900" : "bg-white";
	const dialogBorder = isDark ? "border-purple-500" : "border-fuchsia-500";
	const dialogShadow = isDark ? "0 0 25px #ff00ff" : "0 0 25px #d946ef";
	const gameOverTitleColor = isDark ? "text-white" : "text-gray-800";
	const gameOverTitleShadow = isDark
		? "0 0 8px #fff, 0 0 15px #ff00ff"
		: "0 0 5px #d946ef, 0 0 10px #c026d3";
	const gameOverLabelColor = isDark ? "text-purple-300" : "text-fuchsia-600";

	const buttonBg = isDark ? "bg-purple-700" : "bg-fuchsia-600";
	const buttonHover = isDark ? "hover:bg-purple-600" : "hover:bg-fuchsia-500";
	const buttonActive = isDark
		? "active:bg-purple-800"
		: "active:bg-fuchsia-700";
	const buttonText = isDark ? "text-white" : "text-gray-900";
	const buttonBorder = isDark ? "border-purple-400" : "border-fuchsia-400";
	const buttonShadow = isDark ? "0 0 10px #ff00ff" : "0 0 10px #d946ef";
	const boardShadow = isDark ? "0 0 15px #ff00ff" : "0 0 15px #d946ef";

	const TILE_BASE_COLORS: { [key: number]: string } = {
		2: "#ff1493",
		4: "#ff00ff",
		8: "#9400d3",
		16: "#4b0082",
		32: "#0000ff",
		64: "#00ffff",
		128: "#00ff00",
		256: "#ffff00",
		512: "#ff7f00",
		1024: "#ff0000",
		2048: "#ffffff",
		4096: "#ffc0cb",
		8192: "#e6e6fa",
		16384: "#ffdab9",
	};

	const getTileStyle = (
		r: number,
		c: number,
		value: number,
		isDark: boolean,
	) => {
		const neonColor = TILE_BASE_COLORS[value] || (isDark ? "#ccc" : "#333");
		const xOffset = `calc(${c} * (${cellSizePercent} + ${gap}))`;
		const yOffset = `calc(${r} * (${cellSizePercent} + ${gap}))`;
		let fontSize = "1.8rem";
		if (value >= 10000) fontSize = "1rem";
		else if (value >= 1000) fontSize = "1.2rem";
		else if (value >= 100) fontSize = "1.5rem";

		if (isDark) {
			return {
				position: "absolute" as const,
				top: yOffset,
				left: xOffset,
				width: `calc(${cellSizePercent})`,
				height: `calc(${cellSizePercent})`,
				backgroundColor: "#1a1a1a",
				color: neonColor,
				boxShadow: `0 0 12px ${neonColor}`,
				fontSize: fontSize,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				borderRadius: "0.375rem",
				fontWeight: "bold",
				border: `2px solid ${neonColor}`,
				userSelect: "none" as const,
				WebkitUserSelect: "none" as const,
			};
		}

		const lightBgColor = "#ffffff";
		const darkTextColor = "#1a1a1a";

		return {
			position: "absolute" as const,
			top: yOffset,
			left: xOffset,
			width: `calc(${cellSizePercent})`,
			height: `calc(${cellSizePercent})`,
			backgroundColor: lightBgColor,
			color: darkTextColor,
			boxShadow: `0 0 8px ${neonColor}`,
			fontSize: fontSize,
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			borderRadius: "0.375rem",
			fontWeight: "bold",
			border: `2px solid ${neonColor}`,
			userSelect: "none" as const,
			WebkitUserSelect: "none" as const,
		};
	};

	// --- Render Logic ---
	return (
		<div className="flex flex-col items-center justify-center font-sans">
			<div className="w-full max-w-sm relative">
				<div className="flex justify-center items-center mb-4 px-1">
					<div className="flex flex-row items-center gap-2">
						{/* Back Button */}
						<button
							type="button"
							onClick={() => {
								redirect("/games");
							}}
							className={`flex items-center justify-center h-14 ${buttonBg} ${buttonHover} ${buttonActive} ${buttonText} ${buttonBorder} font-bold py-2 px-3 rounded-md`}
							style={{ boxShadow: buttonShadow }}
						>
							<ArrowLeft />
							Back
						</button>

						{/* Score */}
						<div
							className={`${scoreContainerBg} ${scoreContainerBorder} rounded-md h-14 min-w-25 px-4 py-1.5 text-center`}
							style={{ boxShadow: scoreContainerShadow }}
						>
							<p
								className={`text-xs ${scoreLabelColor} uppercase tracking-wider`}
							>
								Score
							</p>
							<motion.p
								key={score}
								initial={{ y: 10, opacity: 0 }}
								animate={{ y: 0, opacity: 1 }}
								exit={{ y: -10, opacity: 0 }}
								transition={{ type: "spring", stiffness: 300, damping: 20 }}
								className={`text-xl font-bold ${scoreColor}`}
							>
								{score}
							</motion.p>
						</div>

						{/* Points */}
						<div
							className={`${scoreContainerBg} ${scoreContainerBorder} h-14 min-w-25 rounded-md px-4 py-1.5 text-center`}
							style={{ boxShadow: scoreContainerShadow }}
						>
							<p
								className={`text-xs ${scoreLabelColor} uppercase tracking-wider`}
							>
								Points
							</p>
							<motion.p
								key={score}
								initial={{ y: 10, opacity: 0 }}
								animate={{ y: 0, opacity: 1 }}
								exit={{ y: -10, opacity: 0 }}
								transition={{ type: "spring", stiffness: 300, damping: 20 }}
								className={`text-xl font-bold ${scoreColor}`}
							>
								{mainPoints + score}
							</motion.p>
						</div>

						{/* Give Up Button */}
						<button
							type="button"
							onClick={() => setIsOver(true)}
							className={`flex items-center justify-center h-14 max-w-20 ${buttonBg} ${buttonHover} ${buttonActive} ${buttonText} ${buttonBorder} ${buttonText} font-bold py-2 px-3 rounded-md`}
							style={{ boxShadow: buttonShadow }}
						>
							<RotateCcw /> Give Up
						</button>
					</div>
				</div>

				{/* Game Board Area - Removed touch handlers */}
				<div
					className={`${boardBgColor} rounded-lg ${boardBorderColor} relative select-none`}
					style={{
						padding: boardPadding,
						boxShadow: boardShadow,
					}}
				>
					<div className="relative w-full aspect-square">
						{/* Background Cells */}
						<div className="absolute inset-0 grid grid-cols-4 gap-3">
							{Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => (
								<div
									key={`cell-${
										// biome-ignore lint/suspicious/noArrayIndexKey: shut it
										index
									}`}
									className={`${cellBgColor} rounded-md w-full aspect-square`}
									style={{ boxShadow: cellShadow }}
								/>
							))}
						</div>

						{/* Animated Tiles */}
						<AnimatePresence initial={false}>
							{board.flatMap((row, r) =>
								row.map((value, c) =>
									value > 0 ? (
										<motion.div
											key={`tile-${r}-${c}-${value}`}
											layoutId={`tile-${r}-${c}`}
											initial={{ scale: 0.6, opacity: 0 }}
											animate={{ scale: 1, opacity: 1 }}
											exit={{ scale: 0.6, opacity: 0 }}
											style={getTileStyle(r, c, value, isDark)}
											className="absolute"
										>
											{value}
										</motion.div>
									) : null,
								),
							)}
						</AnimatePresence>
					</div>
				</div>

				<div className={`mt-4 ${headerSubtitleColor} text-xs text-center px-2`}>
					<p>
						Use{" "}
						<kbd
							className={`px-1.5 py-0.5 ${kbdBorder} rounded ${kbdBg} text-xs`}
						>
							Arrow Keys
						</kbd>{" "}
						or <span className="font-semibold">Swipe</span> to move tiles.
						Combine tiles to reach 2048!
					</p>
				</div>

				<div className="mt-5 grid grid-cols-3 gap-2 px-4">
					<div className="col-start-2">
						<button
							type="button"
							onClick={() => handleMove("Up")}
							disabled={isOver}
							className={`rounded-md w-full ${buttonBg} ${buttonHover} ${buttonActive} ${buttonText} ${buttonBorder}    py-3 px-4 rounded flex items-center justify-center disabled:opacity-50`}
							style={{ boxShadow: buttonShadow }}
						>
							<ArrowUp className="w-5 h-5" />
						</button>
					</div>
					<div className="col-start-1 row-start-2">
						<button
							type="button"
							onClick={() => handleMove("Left")}
							disabled={isOver}
							className={`rounded-md w-full ${buttonBg} ${buttonHover} ${buttonActive} ${buttonText} ${buttonBorder}    py-3 px-4 rounded flex items-center justify-center disabled:opacity-50`}
							style={{ boxShadow: buttonShadow }}
						>
							<ArrowLeft className="w-5 h-5" />
						</button>
					</div>
					<div className="col-start-2 row-start-2">
						<button
							type="button"
							onClick={() => handleMove("Down")}
							disabled={isOver}
							className={`rounded-md w-full ${buttonBg} ${buttonHover} ${buttonActive} ${buttonText} ${buttonBorder}   py-3 px-4 rounded flex items-center justify-center disabled:opacity-50`}
							style={{ boxShadow: buttonShadow }}
						>
							<ArrowDown className="w-5 h-5" />
						</button>
					</div>
					<div className="col-start-3 row-start-2">
						<button
							type="button"
							onClick={() => handleMove("Right")}
							disabled={isOver}
							className={`rounded-md w-full ${buttonBg} ${buttonHover} ${buttonActive} ${buttonText} ${buttonBorder}   py-3 px-4 rounded flex items-center justify-center disabled:opacity-50`}
							style={{ boxShadow: buttonShadow }}
						>
							<ArrowRight className="w-5 h-5" />
						</button>
					</div>
				</div>

				{/* Game over overlay */}
				<AnimatePresence>
					{isOver && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.3 }}
							className="absolute inset-0 flex items-center justify-center z-10 p-4"
						>
							<motion.div
								initial={{ scale: 0.7, y: 50 }}
								animate={{ scale: 1, y: 0 }}
								exit={{ scale: 0.7, y: 50, opacity: 0 }}
								transition={{ type: "spring", stiffness: 250, damping: 18 }}
								className={`${dialogBg} p-6 rounded-lg text-center ${dialogBorder} w-full max-w-xs`}
								style={{ boxShadow: dialogShadow }}
							>
								<h2
									className={`text-2xl font-bold mb-3 ${gameOverTitleColor}`}
									style={{ textShadow: gameOverTitleShadow }}
								>
									{" "}
									Game Over!{" "}
								</h2>
								{/* --- Score Display Change --- */}
								<p className={`text-lg mb-5 ${gameOverLabelColor}`}>
									{" "}
									Score:{" "}
									<span className={`font-bold ${mainTextColor}`}>
										{score}
									</span>{" "}
								</p>
								<button
									type="button"
									onClick={initializeGame}
									className={`${buttonBg} ${buttonHover} ${buttonActive} ${buttonText} ${buttonBorder}  font-bold py-2.5 px-6 rounded w-full`}
									style={{ boxShadow: buttonShadow }}
								>
									{" "}
									Play Again{" "}
								</button>
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
