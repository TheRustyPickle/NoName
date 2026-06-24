import { motion } from "framer-motion";
import { useMemo } from "react";
import {
	BOARD_HEIGHT,
	BOARD_WIDTH,
	type Board,
	calculateShadowPosition,
	type Position,
	type TetrominoPiece,
} from "@/lib/tetrisLogic";

interface DisplayBoardCell {
	color: string;
	isShadow?: boolean;
	isClearing?: boolean;
	isRotating?: boolean;
}
type DisplayBoard = (DisplayBoardCell | null)[][];

interface GameBoardProps {
	board: Board;
	currentPiece: TetrominoPiece | null;
	position: Position;
	clearedLines: number[];
	gameActive: boolean;
	isRotating: boolean;
	isDark: boolean;
}

export function GameBoard({
	board,
	currentPiece,
	position,
	clearedLines,
	gameActive,
	isRotating,
	isDark,
}: GameBoardProps) {
	// Calculate shadow position memoized
	const shadowPosition = useMemo(() => {
		if (!gameActive || !currentPiece) return null;
		return calculateShadowPosition(currentPiece, position, board);
	}, [currentPiece, position, board, gameActive]);

	// Create Display Board (memoized for performance)
	const displayBoard = useMemo((): DisplayBoard => {
		const newDisplayBoard: DisplayBoard = Array(BOARD_HEIGHT)
			.fill(null)
			.map(() => Array(BOARD_WIDTH).fill(null));

		// 1. Add static pieces from the board state
		for (let y = 0; y < BOARD_HEIGHT; y++) {
			for (let x = 0; x < BOARD_WIDTH; x++) {
				if (board[y][x] !== 0) {
					newDisplayBoard[y][x] = {
						color: board[y][x] as string,
						isClearing: clearedLines.includes(y),
					};
				} else if (clearedLines.includes(y)) {
					// Ensure empty cells in clearing lines also flash potentially
					// Or adjust logic if only filled cells should flash
					// newDisplayBoard[y][x] = { color: 'bg-white', isClearing: true };
				}
			}
		}

		// 2. Add shadow piece (only render if cell is currently empty)
		if (shadowPosition && currentPiece && gameActive) {
			currentPiece.shape.forEach((row, y) => {
				row.forEach((cell, x) => {
					if (cell !== 0) {
						const boardY = shadowPosition.y + y;
						const boardX = shadowPosition.x + x;
						if (
							boardY >= 0 &&
							boardY < BOARD_HEIGHT &&
							boardX >= 0 &&
							boardX < BOARD_WIDTH &&
							!newDisplayBoard[boardY][boardX]
						) {
							newDisplayBoard[boardY][boardX] = {
								color: "bg-gray-400 opacity-30", // Shadow color/style
								isShadow: true,
							};
						}
					}
				});
			});
		}

		// 3. Add active piece (overwrites shadow or static if necessary)
		if (currentPiece && gameActive) {
			currentPiece.shape.forEach((row, y) => {
				row.forEach((cell, x) => {
					if (cell !== 0) {
						const boardY = position.y + y;
						const boardX = position.x + x;
						if (
							boardY >= 0 &&
							boardY < BOARD_HEIGHT &&
							boardX >= 0 &&
							boardX < BOARD_WIDTH
						) {
							newDisplayBoard[boardY][boardX] = {
								color: currentPiece.color,
								isRotating: isRotating, // Pass rotation hint
							};
						}
					}
				});
			});
		}

		return newDisplayBoard;
	}, [
		board,
		currentPiece,
		position,
		shadowPosition,
		clearedLines,
		gameActive,
		isRotating,
	]);

	return (
		<div
			className={`grid grid-cols-10 gap-px ${
				isDark ? "bg-gray-800 border-gray-700" : "bg-gray-200 border-gray-300"
			} border-2 relative overflow-hidden`}
		>
			{displayBoard.flat().map((cell, index) => {
				const y = Math.floor(index / BOARD_WIDTH);
				const x = index % BOARD_WIDTH;
				const key = `${x}-${y}`;

				if (!cell) {
					return (
						<div
							key={key}
							className={`w-6 h-6 sm:w-7 sm:h-7 ${
								isDark ? "bg-gray-900" : "bg-gray-100"
							}`}
						/>
					);
				}

				if (cell.isClearing) {
					return (
						<motion.div
							key={`${key}-clearing`}
							className={`w-6 h-6 sm:w-7 sm:h-7 ${
								isDark ? "bg-gray-300" : "bg-gray-600"
							}`}
							initial={{ opacity: 1 }}
							animate={{ opacity: [1, 0.5, 1, 0.5, 1, 0] }}
							transition={{ duration: 0.5 }}
						/>
					);
				}

				if (!cell.isShadow && !cell.isClearing && gameActive && currentPiece) {
					let isActivePieceCell = false;
					currentPiece.shape.forEach((row, sy) => {
						row.forEach((scell, sx) => {
							if (
								scell !== 0 &&
								position.y + sy === y &&
								position.x + sx === x
							) {
								isActivePieceCell = true;
							}
						});
					});

					if (isActivePieceCell) {
						const uniqueKey = `${key}-active-${currentPiece?.key}-${position.x}-${position.y}-${currentPiece?.shape.toString()}`;
						return (
							<motion.div
								key={uniqueKey}
								className={`w-6 h-6 sm:w-7 sm:h-7 ${cell.color} ${
									cell.isRotating ? "animate-pulse" : ""
								}`}
								initial={{ opacity: 0.7, y: -3 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.1, ease: "easeOut" }}
							/>
						);
					}
				}

				return (
					<div key={key} className={`w-6 h-6 sm:w-7 sm:h-7 ${cell.color}`} />
				);
			})}
		</div>
	);
}
