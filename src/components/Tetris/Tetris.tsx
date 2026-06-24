"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Play, X } from "lucide-react";
import { redirect } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Controls } from "@/components/Tetris/Controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	createInitialPoints,
	createTetrisEndMessage,
	createTetrisMessage,
	type TetrisData,
} from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import { noZoom } from "@/hooks/noZoom";
import {
	gameReducer,
	initialState,
	LINE_CLEAR_ANIMATION_DURATION,
} from "@/lib/tetrisLogic";
import { GameBoard } from "./GameBoard";

const KEY_LEFT = "ArrowLeft";
const KEY_RIGHT = "ArrowRight";
const KEY_DOWN = "ArrowDown";
const KEY_UP = "ArrowUp";
const KEY_SPACE = " ";
const KEY_C_LOWER = "c";
const KEY_C_UPPER = "C";
const KEY_P_LOWER = "p";
const KEY_P_UPPER = "P";

const StatItem = ({
	label,
	value,
	darkMode,
}: {
	label: string;
	value: number | string;
	darkMode: boolean;
}) => (
	<motion.div
		className="flex flex-col items-center"
		initial={{ opacity: 0 }}
		animate={{ opacity: 1 }}
		transition={{ delay: 0.1 }}
	>
		<p
			className={`text-xs sm:text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-400"} uppercase tracking-wider`}
		>
			{label}
		</p>
		<div className="relative overflow-hidden h-6 flex items-center justify-center">
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.p
					key={`${label}-${value}`}
					className={`text-lg sm:text-xl font-bold ${darkMode ? "text-gray-100" : "text-gray-800"} w-full text-center`}
					initial={{ y: "100%", opacity: 0 }}
					animate={{ y: "0%", opacity: 1 }}
					exit={{ y: "-100%", opacity: 0 }}
					transition={{ duration: 0.5, ease: "easeOut" }}
				>
					{value}
				</motion.p>
			</AnimatePresence>
		</div>
	</motion.div>
);

export default function Tetris() {
	const [gameState, dispatch] = useReducer(gameReducer, initialState);
	const gameLoopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const lineClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const isDark = false;

	const [tetrisData, setTetrisData] = useState<TetrisData | null>(null);
	const [noSend, setNoSend] = useState(false);
	const [mainPoints, setMainPoints] = useState(0);

	noZoom();

	const moveLeft = useCallback(
		() => dispatch({ type: "MOVE", dx: -1, dy: 0 }),
		[],
	);
	const moveRight = useCallback(
		() => dispatch({ type: "MOVE", dx: 1, dy: 0 }),
		[],
	);
	const rotate = useCallback(() => dispatch({ type: "ROTATE" }), []);
	const hardDrop = useCallback(() => dispatch({ type: "HARD_DROP" }), []);
	const hold = useCallback(() => dispatch({ type: "HOLD" }), []);

	const startGame = useCallback(() => {
		ws.sendMessage(createInitialPoints());
		ws.sendMessage(createTetrisEndMessage());
		dispatch({ type: "START_GAME" });
	}, []);

	const giveUp = useCallback(() => dispatch({ type: "GIVE_UP" }), []);

	const newData = useCallback(
		(data: TetrisData) => dispatch({ type: "NEW_DATA", data }),
		[],
	);

	const pauseToggle = useCallback(() => {
		if (gameState.gameOver) {
			startGame();
		} else {
			dispatch({ type: "PAUSE_TOGGLE" });
		}
	}, [gameState.gameOver, startGame]);

	// Sent Tetris Data to WebSocket
	useEffect(() => {
		if (!tetrisData || noSend) return;

		ws.sendMessage(createTetrisMessage(tetrisData));
	}, [tetrisData, noSend]);

	useEffect(() => {
		ws.sendMessage(createInitialPoints());
	}, []);

	useEffect(() => {
		const unsubNewTetris = ws.subscribeToNewTetris((data) => {
			setNoSend(true);
			setTetrisData(data);
			newData(data);
		});
		const ubsubInitialPoint = ws.subscribeToUpdatedPoints((initial_point) => {
			setMainPoints(initial_point);
		});

		return () => {
			unsubNewTetris();
			ubsubInitialPoint();
		};
	}, [newData]);

	// Determine whether to set new Tetris Data for sending via ws
	useEffect(() => {
		setTetrisData((prevData) => {
			if (gameState.score === 0 || gameState.lines === 0) {
				return null;
			}

			const timeNow = new Date().toISOString();

			const data: TetrisData = {
				timestamp: timeNow,
				prev_timestamp: prevData ? prevData.timestamp : timeNow,
				points: gameState.score,
				prev_points: prevData ? prevData.points : 0,
				lines: gameState.lines,
				prev_lines: prevData ? prevData.lines : 0,
				level: gameState.level,
				prev_level: prevData ? prevData.level : 1,
			};

			if (
				prevData &&
				prevData.points === data.points &&
				prevData.lines === data.lines
			) {
				return prevData;
			}

			setNoSend(false);
			return data;
		});
	}, [gameState.lines, gameState.score, gameState.level]);

	// useEffect(() => {
	// 	dispatch({ type: "SET_DARK", isDark: isDark });
	// }, [isDark]);

	// Game Loop Timer
	useEffect(() => {
		if (gameLoopTimeoutRef.current) {
			clearInterval(gameLoopTimeoutRef.current);
		}
		if (gameState.gameActive && !gameState.gameOver) {
			gameLoopTimeoutRef.current = setInterval(() => {
				dispatch({ type: "GAME_TICK" });
			}, gameState.dropTime);
		}
		return () => {
			if (gameLoopTimeoutRef.current) {
				clearInterval(gameLoopTimeoutRef.current);
			}
		};
	}, [gameState.gameActive, gameState.gameOver, gameState.dropTime]);

	// Line Clear Animation End Timer
	useEffect(() => {
		if (lineClearTimeoutRef.current) {
			clearTimeout(lineClearTimeoutRef.current);
		}
		if (gameState.clearedLines.length > 0) {
			lineClearTimeoutRef.current = setTimeout(() => {
				dispatch({ type: "END_CLEAR_ANIMATION" });
			}, LINE_CLEAR_ANIMATION_DURATION);
		}
		return () => {
			if (lineClearTimeoutRef.current) {
				clearTimeout(lineClearTimeoutRef.current);
			}
		};
	}, [gameState.clearedLines]);

	// Keyboard Controls
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (
				gameState.gameOver &&
				e.key !== KEY_P_LOWER &&
				e.key !== KEY_P_UPPER
			) {
				return;
			}
			if (e.key === KEY_P_LOWER || e.key === KEY_P_UPPER) {
				e.preventDefault();
				pauseToggle();
				return;
			}
			if (!gameState.gameActive) return;
			switch (e.key) {
				case KEY_LEFT:
					e.preventDefault();
					moveLeft();
					break;
				case KEY_RIGHT:
					e.preventDefault();
					moveRight();
					break;
				case KEY_DOWN:
					e.preventDefault();
					dispatch({ type: "GAME_TICK" });
					break;
				case KEY_UP:
					e.preventDefault();
					rotate();
					break;
				case KEY_SPACE:
					e.preventDefault();
					hardDrop();
					break;
				case KEY_C_LOWER:
				case KEY_C_UPPER:
					e.preventDefault();
					hold();
					break;
				default:
					break;
			}
		},
		[
			gameState.gameActive,
			gameState.gameOver,
			moveLeft,
			moveRight,
			rotate,
			hardDrop,
			hold,
			pauseToggle,
		],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleKeyDown]);

	useEffect(() => {
		if (gameState.gameOver && !gameState.isFirstRender && gameState.score > 0) {
		}
	}, [gameState.gameOver, gameState.isFirstRender, gameState.score]);

	return (
		<motion.div
			className="flex justify-center items-start p-1"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.3 }}
		>
			<Card
				className={`w-full max-w-md ${isDark ? "bg-gray-950" : "bg-white"} border-gray-800 shadow-xl ${isDark ? "text-white" : "text-black"} relative overflow-hidden`}
			>
				<CardContent className="flex flex-col">
					<div className="flex justify-center items-center gap-4">
						<StatItem label="Score" value={gameState.score} darkMode={isDark} />
						<StatItem
							label="Points"
							value={gameState.score + mainPoints}
							darkMode={isDark}
						/>
						<StatItem label="Lines" value={gameState.lines} darkMode={isDark} />
					</div>

					<div className="flex flex-col items-center relative">
						<GameBoard
							board={gameState.board}
							currentPiece={gameState.currentPiece}
							position={gameState.position}
							clearedLines={gameState.clearedLines}
							gameActive={gameState.gameActive}
							isRotating={gameState.isRotating}
							isDark={isDark}
						/>

						{/* Game Over Overlay */}
						<AnimatePresence>
							{gameState.gameOver && !gameState.isFirstRender && (
								<motion.div
									key="game-over-overlay"
									className={`absolute inset-0 ${isDark ? "bg-black bg-opacity-75" : "bg-white bg-opacity-75"} flex flex-col justify-center items-center z-10`}
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{ duration: 0.3 }}
								>
									<motion.p
										className={`text-3xl font-bold ${isDark ? "text-red-500" : "text-red-700"} mb-2`}
										initial={{ y: -20, opacity: 0 }}
										animate={{ y: 0, opacity: 1 }}
										transition={{ delay: 0.1, type: "spring" }}
									>
										Game Over!
									</motion.p>
									<motion.p
										className={`text-xl mb-4 ${isDark ? "text-gray-300" : "text-gray-600"}`}
										initial={{ y: 20, opacity: 0 }}
										animate={{ y: 0, opacity: 1 }}
										transition={{ delay: 0.2, type: "spring" }}
									>
										Final Score: {gameState.score}
									</motion.p>
									<motion.div
										className="flex items-center gap-4"
										initial={{ scale: 0.8, opacity: 0 }}
										animate={{ scale: 1, opacity: 1 }}
										transition={{ delay: 0.3 }}
									>
										<Button
											onClick={() => redirect("/games")}
											variant="outline"
											className={`h-full ${isDark ? "border-gray-700 bg-transparent text-white hover:bg-gray-700 hover:text-white" : "border-gray-300 bg-transparent text-black hover:bg-gray-200 hover:text-black"}`}
										>
											<ArrowLeft className="h-4 w-4 mr-2" />
											Back
										</Button>
										<Button
											onClick={startGame}
											className={`bg-gradient-to-r ${isDark ? "from-purple-600 to-blue-600" : "from-purple-500 to-blue-500"} hover:from-purple-700 hover:to-blue-700 px-6 py-2`}
										>
											Play Again
										</Button>
									</motion.div>
								</motion.div>
							)}
						</AnimatePresence>

						{/* Main Play/Pause/Start Button Area */}
						{!gameState.gameActive && (
							<div className="mt-4 w-[260px] sm:w-[290px] h-10">
								{!gameState.gameOver && (
									<div className="flex h-full flex-1 justify-center items-center gap-2">
										<motion.div
											whileHover={{ scale: 1.05 }}
											whileTap={{ scale: 0.95 }}
										>
											<Button
												onClick={() => redirect("/games")}
												variant="outline"
												className={`h-full p-2.5 ${isDark ? "border-gray-700 bg-transparent text-white hover:bg-gray-700 hover:text-white" : "border-gray-300 bg-transparent text-black hover:bg-gray-200 hover:text-black"}`}
												aria-label={"Go Back"}
											>
												<ArrowLeft className="h-5 w-5" />
											</Button>
										</motion.div>
										<motion.div
											className="flex-1"
											whileHover={{ scale: 1.05 }}
											whileTap={{ scale: 0.95 }}
										>
											<Button
												onClick={pauseToggle}
												variant="outline"
												className={`h-full w-full ${isDark ? "border-gray-700 bg-transparent text-white hover:bg-gray-700 hover:text-white" : "border-gray-300 bg-transparent text-black hover:bg-gray-200 hover:text-black"}`}
												aria-label={"Resume Game"}
											>
												<Play className="h-4 w-4 mr-2" />
												{"Resume"}
											</Button>
										</motion.div>
										<motion.div
											whileHover={{ scale: 1.05 }}
											whileTap={{ scale: 0.95 }}
										>
											<Button
												onClick={giveUp}
												variant="outline"
												className={`h-full p-2.5 ${isDark ? "border-red-500/50 bg-transparent text-red-500/80 hover:bg-red-500/20 hover:text-red-500" : "border-red-500/50 bg-transparent text-red-600/80 hover:bg-red-500/10 hover:text-red-600"}`}
												aria-label={"Give Up"}
											>
												<X className="h-5 w-5" />
											</Button>
										</motion.div>
									</div>
								)}
								{gameState.gameOver && gameState.isFirstRender && (
									<div className="flex items-center gap-2 w-full h-full">
										<motion.div
											whileHover={{ scale: 1.05 }}
											whileTap={{ scale: 0.95 }}
										>
											<Button
												onClick={() => redirect("/games")}
												variant="outline"
												className={`h-full p-2.5 ${isDark ? "border-gray-700 bg-transparent text-white hover:bg-gray-700 hover:text-white" : "border-gray-300 bg-transparent text-black hover:bg-gray-200 hover:text-black"}`}
												aria-label={"Go Back"}
											>
												<ArrowLeft />
											</Button>
										</motion.div>
										<motion.div
											className="flex-1 h-full"
											whileHover={{ scale: 1.05 }}
											whileTap={{ scale: 0.95 }}
										>
											<Button
												onClick={startGame}
												className={`w-full h-full bg-gradient-to-r ${isDark ? "from-purple-600 to-blue-600" : "from-purple-500 to-blue-500"} hover:from-purple-700 hover:to-blue-700`}
											>
												Play Tetris
											</Button>
										</motion.div>
									</div>
								)}
								{gameState.gameOver && !gameState.isFirstRender && (
									<div className="h-10" />
								)}
							</div>
						)}

						{gameState.gameActive && !gameState.gameOver && (
							<div className="w-[260px] sm:w-[290px]">
								<Controls
									onMoveLeft={moveLeft}
									onMoveRight={moveRight}
									onRotate={rotate}
									onHardDrop={hardDrop}
									onHold={hold}
									onPauseToggle={pauseToggle}
									isDark={isDark}
								/>
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</motion.div>
	);
}
