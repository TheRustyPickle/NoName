import type { Tetrominoes } from "@/lib/tetrisLogic";

export const TETROMINOES_LIGHT: Tetrominoes = {
	I: {
		shape: [
			[0, 0, 0, 0],
			[1, 1, 1, 1],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		],
		color: "bg-cyan-600",
	},
	J: {
		shape: [
			[1, 0, 0],
			[1, 1, 1],
			[0, 0, 0],
		],
		color: "bg-blue-600",
	},
	L: {
		shape: [
			[0, 0, 1],
			[1, 1, 1],
			[0, 0, 0],
		],
		color: "bg-orange-600",
	},
	O: {
		shape: [
			[1, 1],
			[1, 1],
		],
		color: "bg-yellow-500",
	},
	S: {
		shape: [
			[0, 1, 1],
			[1, 1, 0],
			[0, 0, 0],
		],
		color: "bg-green-600",
	},
	T: {
		shape: [
			[0, 1, 0],
			[1, 1, 1],
			[0, 0, 0],
		],
		color: "bg-purple-600",
	},
	Z: {
		shape: [
			[1, 1, 0],
			[0, 1, 1],
			[0, 0, 0],
		],
		color: "bg-red-600",
	},
};

export const TETROMINOES_DARK: Tetrominoes = {
	I: {
		shape: [
			[0, 0, 0, 0],
			[1, 1, 1, 1],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		],
		color: "bg-cyan-400",
	},
	J: {
		shape: [
			[1, 0, 0],
			[1, 1, 1],
			[0, 0, 0],
		],
		color: "bg-blue-400",
	},
	L: {
		shape: [
			[0, 0, 1],
			[1, 1, 1],
			[0, 0, 0],
		],
		color: "bg-orange-400",
	},
	O: {
		shape: [
			[1, 1],
			[1, 1],
		],
		color: "bg-yellow-300",
	},
	S: {
		shape: [
			[0, 1, 1],
			[1, 1, 0],
			[0, 0, 0],
		],
		color: "bg-green-400",
	},
	T: {
		shape: [
			[0, 1, 0],
			[1, 1, 1],
			[0, 0, 0],
		],
		color: "bg-purple-400",
	},
	Z: {
		shape: [
			[1, 1, 0],
			[0, 1, 1],
			[0, 0, 0],
		],
		color: "bg-red-400",
	},
};

export const TETROMINO_KEYS_LIGHT = Object.keys(TETROMINOES_LIGHT);
export const TETROMINO_KEYS_DARK = Object.keys(TETROMINOES_DARK);
