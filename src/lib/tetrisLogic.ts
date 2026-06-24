import {
	TETROMINO_KEYS_DARK,
	TETROMINO_KEYS_LIGHT,
	TETROMINOES_DARK,
	TETROMINOES_LIGHT,
} from "@/components/Tetris/Tetromino";
import type { TetrisData } from "@/core/websocket/models";

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const INITIAL_DROP_TIME = 1000;
export const LEVEL_UP_LINES = 10;
export const POINTS_PER_LINE = [0, 40, 100, 300, 1200];
export const LINE_CLEAR_ANIMATION_DURATION = 500;

export type TetrominoShape = (0 | 1)[][];

export interface TetrominoPiece {
	shape: TetrominoShape;
	color: string;
	key: string;
}

export interface Tetrominoes {
	[key: string]: Omit<TetrominoPiece, "key">;
}

export interface Position {
	x: number;
	y: number;
}

export type BoardCell = 0 | string;
export type Board = BoardCell[][];

export interface GameState {
	board: Board;
	currentPiece: TetrominoPiece | null;
	nextPiece: TetrominoPiece | null;
	heldPiece: TetrominoPiece | null;
	canHold: boolean;
	position: Position;
	score: number;
	lines: number;
	level: number;
	gameOver: boolean;
	gameActive: boolean;
	isFirstRender: boolean;
	dropTime: number;
	clearedLines: number[];
	isRotating: boolean;
	isDark: boolean;
}

// Actions the reducer can handle
export type GameAction =
	| { type: "START_GAME" }
	| { type: "GIVE_UP" }
	| { type: "PAUSE_TOGGLE" }
	| { type: "MOVE"; dx: number; dy: number }
	| { type: "NEW_DATA"; data: TetrisData }
	| { type: "ROTATE" }
	| { type: "HARD_DROP" }
	| { type: "HOLD" }
	| { type: "GAME_TICK" }
	| { type: "LOAD_HIGH_SCORE"; score: number }
	| { type: "END_CLEAR_ANIMATION" }
	| { type: "SET_DARK"; isDark: boolean };

export const createEmptyBoard = (): Board =>
	Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));

export const randomTetromino = (isDark: boolean): TetrominoPiece => {
	if (isDark) {
		const key =
			TETROMINO_KEYS_DARK[
				Math.floor(Math.random() * TETROMINO_KEYS_DARK.length)
			];
		const tetromino = TETROMINOES_DARK[key];
		return { ...tetromino, key: key };
	}

	const key =
		TETROMINO_KEYS_LIGHT[
			Math.floor(Math.random() * TETROMINO_KEYS_LIGHT.length)
		];
	const tetromino = TETROMINOES_LIGHT[key];
	return { ...tetromino, key: key };
};

// Check for collisions
export const checkCollision = (
	piece: TetrominoPiece,
	pos: Position,
	board: Board,
): boolean => {
	for (let y = 0; y < piece.shape.length; y++) {
		for (let x = 0; x < piece.shape[y].length; x++) {
			if (piece.shape[y][x] !== 0) {
				const boardY = y + pos.y;
				const boardX = x + pos.x;

				if (
					boardY >= BOARD_HEIGHT || // Check bottom boundary
					boardX < 0 || // Check left boundary
					boardX >= BOARD_WIDTH || // Check right boundary
					(boardY >= 0 && board[boardY]?.[boardX] !== 0) // Check occupied cell on board (allow checks above board)
				) {
					return true;
				}
			}
		}
	}
	return false;
};

// Rotate tetromino shape
export const rotate = (shape: TetrominoShape): TetrominoShape => {
	// Rotate clockwise: transpose then reverse rows
	const size = shape.length;
	const newShape = Array.from({ length: size }, () => Array(size).fill(0));
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			newShape[x][size - 1 - y] = shape[y][x];
		}
	}
	return newShape;
};

// Calculate shadow position
export const calculateShadowPosition = (
	currentPiece: TetrominoPiece | null,
	position: Position,
	board: Board,
): Position | null => {
	if (!currentPiece) return null;
	let shadowY = position.y;
	while (
		!checkCollision(currentPiece, { x: position.x, y: shadowY + 1 }, board)
	) {
		shadowY += 1;
	}
	return { x: position.x, y: shadowY };
};

// --- INITIAL STATE ---
export const initialState: GameState = {
	board: createEmptyBoard(),
	currentPiece: null,
	nextPiece: null,
	heldPiece: null,
	canHold: true,
	position: { x: Math.floor(BOARD_WIDTH / 2) - 1, y: 0 }, // Initial position might be adjusted on spawn
	score: 0,
	lines: 0,
	level: 1,
	gameOver: true,
	gameActive: false,
	isFirstRender: true,
	dropTime: INITIAL_DROP_TIME,
	clearedLines: [],
	isRotating: false,
	isDark: false,
};

function handlePieceLock(
	currentState: GameState,
	lockedBoard: Board,
	isDark: boolean,
): GameState {
	const { nextPiece, level, lines, score } = currentState;

	// 1. Calculate score/level based on cleared lines from the locked board
	const completedRows: number[] = [];
	for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
		if (y < lockedBoard.length && lockedBoard[y].every((cell) => cell !== 0)) {
			// Add bounds check for y
			completedRows.push(y);
		}
	}

	let newScore = score;
	let newLines = lines;
	let newLevel = level;
	let newDropTime = currentState.dropTime;

	if (completedRows.length > 0) {
		const linesCleared = completedRows.length;
		// Ensure index is within bounds for POINTS_PER_LINE
		const pointsIndex = Math.min(linesCleared, POINTS_PER_LINE.length - 1);
		const points = POINTS_PER_LINE[pointsIndex] * level;
		newScore += points;
		newLines += linesCleared;
		newLevel = Math.floor(newLines / LEVEL_UP_LINES) + 1;
		newDropTime = INITIAL_DROP_TIME / Math.max(1, 1 + (newLevel - 1) * 0.2); // Ensure divisor > 0
	}

	// 2. Prepare the next piece
	const newCurrentPiece = nextPiece;
	if (!newCurrentPiece) {
		// Should not happen in normal flow if nextPiece is always generated
		console.error("Error: nextPiece is null during piece lock handling.");
		// Attempt recovery or force game over
		return {
			...currentState,
			board: lockedBoard,
			gameOver: true,
			gameActive: false,
			score: newScore,
		};
	}
	const newNextPiece = randomTetromino(isDark);
	// Adjust starting position based on the *new* current piece's width
	const startX =
		Math.floor(BOARD_WIDTH / 2) -
		Math.floor(newCurrentPiece.shape[0].length / 2);
	const startPos = { x: startX, y: 0 };

	// *** 3. GAME OVER CHECK ON SPAWN ***
	// Check collision for the *new* piece at the starting position on the board *after* the previous piece locked.
	if (checkCollision(newCurrentPiece, startPos, lockedBoard)) {
		console.error("GAME OVER: Spawn Collision Detected!");
		// Return state showing the final board state that caused the game over
		return {
			...currentState,
			board: lockedBoard,
			gameOver: true,
			gameActive: false,
			score: newScore,
			level: newLevel,
			lines: newLines,
			currentPiece: null,
			clearedLines: [],
		};
	}

	return {
		...currentState,
		board: lockedBoard, // Board with merged piece, BEFORE rows are removed by animation
		clearedLines: completedRows, // Signal animation if lines were cleared
		score: newScore,
		lines: newLines,
		level: newLevel,
		dropTime: newDropTime,
		currentPiece: newCurrentPiece, // The piece that just spawned successfully
		nextPiece: newNextPiece,
		position: startPos, // Use calculated starting position
		canHold: true,
	};
}

export function gameReducer(state: GameState, action: GameAction): GameState {
	switch (action.type) {
		case "LOAD_HIGH_SCORE":
			return { ...state };

		case "START_GAME": {
			const firstPiece = randomTetromino(state.isDark);
			const secondPiece = randomTetromino(state.isDark);
			// Adjust starting position based on the first piece's width
			const startX =
				Math.floor(BOARD_WIDTH / 2) -
				Math.floor(firstPiece.shape[0].length / 2);
			const startPos = { x: startX, y: 0 };
			const emptyBoard = createEmptyBoard();

			// Check for immediate game over on start (unlikely with empty board, but good practice)
			if (checkCollision(firstPiece, startPos, emptyBoard)) {
				return {
					...initialState,
					board: emptyBoard,
					gameOver: true,
					gameActive: false,
					isFirstRender: false,
					isDark: state.isDark,
				};
			}

			return {
				...initialState,
				board: emptyBoard,
				currentPiece: firstPiece,
				nextPiece: secondPiece,
				position: startPos,
				gameOver: false,
				gameActive: true,
				isFirstRender: false,
				isDark: state.isDark,
			};
		}
		case "SET_DARK": {
			return {
				...state,
				isDark: action.isDark,
			};
		}

		case "NEW_DATA": {
			const new_score = action.data.points;
			const new_lines = action.data.lines;
			const newLevel = action.data.level;

			return {
				...state,
				score: new_score,
				lines: new_lines,
				level: newLevel,
			};
		}

		case "GIVE_UP": {
			return {
				...initialState,
				score: state.score,
				board: createEmptyBoard(),
				gameOver: true,
				gameActive: false,
				isFirstRender: false,
				isDark: state.isDark,
			};
		}

		case "PAUSE_TOGGLE": {
			if (state.gameOver) {
				// Let the component handle dispatching START_GAME via the button logic
				return state; // No change if game over
			}
			return { ...state, gameActive: !state.gameActive };
		}

		case "MOVE": {
			if (!state.gameActive || !state.currentPiece) return state;
			// Reset rotation flag on any move
			const stateWithoutRotationFlag = { ...state, isRotating: false };
			const newPos = {
				x: state.position.x + action.dx,
				y: state.position.y + action.dy,
			};
			if (!checkCollision(state.currentPiece, newPos, state.board)) {
				return { ...stateWithoutRotationFlag, position: newPos };
			}
			return stateWithoutRotationFlag; // Return state without rotation flag even if move failed
		}

		case "ROTATE": {
			if (!state.gameActive || !state.currentPiece) return state;
			if (state.currentPiece.key === "O") return state; // O-piece doesn't rotate

			const rotatedPiece = {
				...state.currentPiece,
				shape: rotate(state.currentPiece.shape),
			};
			const positionToTest = state.position;

			// Try standard rotation
			if (!checkCollision(rotatedPiece, positionToTest, state.board)) {
				return { ...state, currentPiece: rotatedPiece, isRotating: true };
			}

			// Basic Wall Kicks
			const kicks: Position[] = [
				{ x: 1, y: 0 },
				{ x: -1, y: 0 },
				{ x: 2, y: 0 },
				{ x: -2, y: 0 },
				{ x: 0, y: -1 },
			];
			for (const kick of kicks) {
				const kickedPos = {
					x: state.position.x + kick.x,
					y: state.position.y + kick.y,
				};
				if (!checkCollision(rotatedPiece, kickedPos, state.board)) {
					return {
						...state,
						currentPiece: rotatedPiece,
						position: kickedPos,
						isRotating: true,
					};
				}
			}
			return { ...state, isRotating: false }; // Rotation failed, ensure flag is false
		}

		case "HARD_DROP": {
			if (!state.gameActive || !state.currentPiece) return state;

			let finalY = state.position.y;
			while (
				!checkCollision(
					state.currentPiece,
					{ x: state.position.x, y: finalY + 1 },
					state.board,
				)
			) {
				finalY++;
			}

			const dropPoints =
				finalY > state.position.y ? finalY - state.position.y : 0;

			let final_points = state.score + dropPoints;

			if (state.lines === 0) {
				final_points = 0;
			}

			// No points if there is 0 line completed
			const stateBeforeLock = {
				...state,
				position: { ...state.position, y: finalY },
				score: final_points,
				isRotating: false,
			}; // Ensure rotating flag is off

			// Merge piece at final position
			const newBoard = state.board.map((row) => [...row]);
			let isLockAboveBoard = false;
			state.currentPiece.shape.forEach((row, y) => {
				row.forEach((cell, x) => {
					if (cell !== 0) {
						const boardY = y + finalY;
						const boardX = x + state.position.x;
						if (
							boardY >= 0 &&
							boardY < BOARD_HEIGHT &&
							boardX >= 0 &&
							boardX < BOARD_WIDTH
						) {
							// biome-ignore lint/style/noNonNullAssertion: safe
							newBoard[boardY][boardX] = state.currentPiece!.color;
						} else if (boardY < 0) {
							// Check if any part tried to lock above board
							isLockAboveBoard = true;
						}
					}
				});
			});

			// Immediate Game Over if piece locked above board
			if (isLockAboveBoard) {
				console.error("GAME OVER: Hard Drop Lock Above Board");
				return {
					...stateBeforeLock,
					board: newBoard,
					gameOver: true,
					gameActive: false,
					currentPiece: null,
				};
			}

			// Use the helper function to handle locking, scoring, line clearing, and the crucial spawn check
			return handlePieceLock(stateBeforeLock, newBoard, state.isDark);
		}

		case "HOLD": {
			if (!state.gameActive || !state.canHold || !state.currentPiece)
				return state;

			const pieceToHold = state.currentPiece;
			const pieceFromHold = state.heldPiece; // Could be null

			const newCurrentPiece = pieceFromHold ?? state.nextPiece; // Use held piece, or next piece if hold empty
			const newNextPiece = pieceFromHold
				? state.nextPiece
				: randomTetromino(state.isDark); // Get new next only if hold was empty

			if (!newCurrentPiece) {
				// This case should be rare (e.g., if nextPiece was also somehow null)
				console.error(
					"Error: Cannot determine piece to become current during HOLD.",
				);
				return state; // Or potentially game over?
			}

			// Calculate starting position for the piece *leaving* hold (or the next piece)
			const startX =
				Math.floor(BOARD_WIDTH / 2) -
				Math.floor(newCurrentPiece.shape[0].length / 2);
			const startPos = { x: startX, y: 0 };

			if (checkCollision(newCurrentPiece, startPos, state.board)) {
				console.error("GAME OVER: Collision on Hold Swap!");
				return {
					...state,
					gameOver: true,
					gameActive: false,
					currentPiece: null,
				};
			}

			return {
				...state,
				heldPiece: pieceToHold,
				currentPiece: newCurrentPiece,
				nextPiece: newNextPiece,
				position: startPos,
				canHold: false,
				isRotating: false,
			};
		}

		case "GAME_TICK": {
			if (!state.gameActive || !state.currentPiece) return state;
			const stateWithoutRotationFlag = { ...state, isRotating: false }; // Reset rotation flag on tick
			const newPos = { ...state.position, y: state.position.y + 1 };

			if (!checkCollision(state.currentPiece, newPos, state.board)) {
				// Can move down
				return { ...stateWithoutRotationFlag, position: newPos };
			}
			{
				// Collision detected: Lock piece
				const { currentPiece, position, board } = stateWithoutRotationFlag;

				// Merge piece onto board
				const newBoard = board.map((row) => [...row]);
				let isLockAboveBoard = false;
				currentPiece?.shape.forEach((row, y) => {
					row.forEach((cell, x) => {
						if (cell !== 0) {
							const boardY = y + position.y;
							const boardX = x + position.x;
							if (
								boardY >= 0 &&
								boardY < BOARD_HEIGHT &&
								boardX >= 0 &&
								boardX < BOARD_WIDTH
							) {
								newBoard[boardY][boardX] = currentPiece?.color;
							} else if (boardY < 0) {
								isLockAboveBoard = true; // Piece locked partially/fully above board
							}
						}
					});
				});

				// Immediate Game Over check if lock occurred above board
				if (isLockAboveBoard) {
					console.error("GAME OVER: Tick Lock Above Board");
					return {
						...stateWithoutRotationFlag,
						board: newBoard,
						gameOver: true,
						gameActive: false,
						currentPiece: null,
					};
				}

				// Use helper for locking, scoring, clearing, and spawn check
				return handlePieceLock(
					stateWithoutRotationFlag,
					newBoard,
					state.isDark,
				);
			}
		}

		case "END_CLEAR_ANIMATION": {
			if (state.clearedLines.length === 0) return state;

			const boardAfterClear = state.board.map((row) => [...row]);
			const sortedRows = [...state.clearedLines].sort((a, b) => a - b);

			// Remove rows from bottom up
			for (let i = sortedRows.length - 1; i >= 0; i--) {
				if (sortedRows[i] < boardAfterClear.length) {
					// Bounds check before splice
					boardAfterClear.splice(sortedRows[i], 1);
				}
			}
			// Add new empty rows at the top
			for (let i = 0; i < sortedRows.length; i++) {
				boardAfterClear.unshift(Array(BOARD_WIDTH).fill(0));
			}

			return {
				...state,
				board: boardAfterClear,
				clearedLines: [], // Reset cleared lines state
			};
		}

		default:
			return state;
	}
}
