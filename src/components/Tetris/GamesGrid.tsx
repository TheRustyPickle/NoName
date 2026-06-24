"use client";

import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	Blocks,
	HandIcon,
	Package,
	Puzzle,
	RotateCw,
	SnailIcon as Snake,
} from "lucide-react";
import { redirect } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface Game {
	id: string;
	name: string;
	icon: React.ReactNode;
	color: string;
	gradient: string;
	description: string;
	popular?: boolean;
	new?: boolean;
	highScore: number;
	redirect: string;
}

interface GamesGridProps {
	limit?: number;
	featured?: boolean;
}

export default function GamesGrid({ limit, featured = false }: GamesGridProps) {
	const [selectedGame, setSelectedGame] = useState<string | null>(null);

	const isDark = false;

	const games: Game[] = [
		{
			id: "tetris",
			name: "Tetris",
			icon: <Blocks className="w-8 h-8" />,
			color: isDark
				? "bg-purple-900 text-purple-300"
				: "bg-purple-100 text-purple-600",
			gradient: isDark
				? "from-purple-800 to-indigo-900"
				: "from-purple-500 to-indigo-600",
			description: "Stack blocks and clear lines in this classic puzzle game",
			popular: true,
			highScore: 0,
			redirect: "/tetris",
		},
		{
			id: "2048",
			name: "2048",
			icon: <Puzzle className="w-8 h-8" />,
			color: isDark ? "bg-blue-900 text-blue-300" : "bg-blue-100 text-blue-600",
			gradient: isDark
				? "from-blue-800 to-cyan-900"
				: "from-blue-500 to-cyan-600",
			description:
				"Combine tiles to reach the 2048 tile in this addictive puzzle game",
			popular: true,
			highScore: 0,
			redirect: "/2048",
		},
		{
			id: "snake",
			name: "Snake",
			icon: <Snake className="w-8 h-8" />,
			color: isDark
				? "bg-green-900 text-green-300"
				: "bg-green-100 text-green-600",
			gradient: isDark
				? "from-green-800 to-emerald-900"
				: "from-green-500 to-emerald-600",
			description: "Guide the snake to eat food and grow without hitting walls",
			highScore: 0,
			redirect: "/snake",
		},
		{
			id: "flappy",
			name: "Flappy Birds",
			icon: <HandIcon className="w-8 h-8" />,
			color: isDark
				? "bg-amber-900 text-amber-300"
				: "bg-amber-100 text-amber-600",
			gradient: isDark
				? "from-amber-800 to-orange-900"
				: "from-amber-500 to-orange-600",
			description: "Navigate through pipes in this challenging arcade game",
			new: true,
			highScore: 0,
			redirect: "/flappy",
		},
	];

	// Filter games for featured section
	const displayedGames = featured
		? games
				.filter((game) => game.popular || game.new)
				.slice(0, limit || games.length)
		: limit
			? games.slice(0, limit)
			: games;

	if (selectedGame) {
		const game = games.find((g) => g.id === selectedGame);
		if (!game) return null;

		return (
			<div className="space-y-4">
				<Card className={`bg-gradient-to-r ${game.gradient} text-white`}>
					<CardHeader className="p-6 pb-0">
						<div className="flex items-center mb-4">
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setSelectedGame(null)}
								className="mr-2 text-white hover:bg-white/20"
							>
								<ArrowLeft className="w-5 h-5" />
							</Button>
							<h3 className="text-xl font-bold">{game.name}</h3>
						</div>

						<div className="flex items-center justify-between mb-4">
							<div className="p-3 rounded-full bg-white/20">{game.icon}</div>
							<div className="space-y-1 text-sm">
								<div className="flex items-center">
									{/* <Trophy className="w-4 h-4 mr-1" /> */}
									{/* <span>High Score: {game.highScore.toLocaleString()}</span> */}
								</div>
							</div>
						</div>
					</CardHeader>

					<CardContent className="p-6 pt-0">
						<p className="mb-4 text-white/80">{game.description}</p>
						<Button
							className="w-full bg-white/20 hover:bg-white/30 text-white"
							onClick={() => redirect(game.redirect)}
						>
							Play Now
						</Button>
					</CardContent>
				</Card>

				<Card className={isDark ? "bg-gray-800" : "bg-white"}>
					<CardHeader>
						<h4
							className={`text-lg font-medium ${
								isDark ? "text-white" : "text-gray-800"
							}`}
						>
							How to Play
						</h4>
					</CardHeader>
					<CardContent>
						<div className={isDark ? "text-gray-300" : "text-gray-600"}>
							{game.id === "tetris" && (
								<>
									<p>
										Arrange falling blocks to create complete rows. Clear lines
										to score points and prevent the blocks from stacking to the
										top.
									</p>

									<p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
										Keyboard Controls:
									</p>
									<ul className="text-sm text-gray-500 dark:text-gray-400 list-disc list-inside space-y-1">
										<li>
											<strong>← →</strong>: Move block left/right
										</li>
										<li>
											<strong>↑</strong>: Rotate block
										</li>
										<li>
											<strong>↓</strong>: Soft drop (move down one row)
										</li>
										<li>
											<strong>Space</strong>: Hard drop (instantly place block)
										</li>
										<li>
											<strong>C</strong>: Hold/swap current block
										</li>
									</ul>

									<p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
										Touch Controls:
									</p>
									<ul className="text-sm text-gray-500 dark:text-gray-400 list-disc list-inside space-y-1">
										<li>
											<ArrowLeft className="inline w-4 h-4 mr-1" /> Move Left
										</li>
										<li>
											<RotateCw className="inline w-4 h-4 mr-1" /> Rotate
										</li>
										<li>
											<ArrowRight className="inline w-4 h-4 mr-1" /> Move Right
										</li>
										<li>
											<ArrowDown className="inline w-4 h-4 mr-1" /> Hard Drop
										</li>
										<li>
											<Package className="inline w-4 h-4 mr-1" /> Hold/swap
											current block
										</li>
									</ul>
								</>
							)}
							{game.id === "2048" && (
								<>
									<p>
										Swipe or use arrow keys to move tiles. When two tiles with
										the same number collide, they merge into one. Try to reach
										the <strong>2048</strong> tile!
									</p>
									<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
										Higher tiles give more points. Keep combining for higher
										scores!
									</p>
									<p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
										Controls:
									</p>
									<ul className="text-sm text-gray-500 dark:text-gray-400 list-disc list-inside space-y-1">
										<li>
											<strong>← → ↑ ↓</strong>: Move tiles
										</li>
										<li>Touch buttons or swipe gestures also work on mobile</li>
									</ul>
								</>
							)}

							{game.id === "snake" && (
								<>
									<p>
										Control the snake using swipe gestures or arrow keys. Eat
										food to grow longer, but avoid hitting walls or your own
										tail!
									</p>
									<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
										The more food you eat, the longer the snake gets — and the
										more points you score!
									</p>
									<p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
										Controls:
									</p>
									<ul className="text-sm text-gray-500 dark:text-gray-400 list-disc list-inside space-y-1">
										<li>
											<strong>← → ↑ ↓</strong>: Move snake
										</li>
										<li>Touch buttons or swipe gestures also work on mobile</li>
									</ul>
								</>
							)}
							{game.id === "flappy" && (
								<>
									<p>
										Tap or press to make the bird fly and navigate through the
										pipes. Avoid hitting the pipes or the ground!
									</p>
									<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
										The more pipes you pass, the more points you earn.
									</p>
									<p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
										Controls:
									</p>
									<ul className="text-sm text-gray-500 dark:text-gray-400 list-disc list-inside space-y-1">
										<li>
											<strong>Space</strong>: Jump (Desktop)
										</li>
										<li>
											<strong>Mouse click</strong> or <strong>Touch</strong>:
											Jump
										</li>
										<li>
											<strong>Repeated taps</strong>: Control height
										</li>
									</ul>
								</>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
			{displayedGames.map((game) => (
				<Card
					key={game.id}
					className={`overflow-hidden transition-all shadow-sm hover:shadow-md hover:scale-95 ${
						isDark ? "bg-gray-700" : "bg-white"
					}`}
					onClick={() => {
						setSelectedGame(game.id);
					}}
				>
					<CardContent className="p-0">
						<div className={`h-2 bg-gradient-to-r ${game.gradient}`}></div>
						<div className="flex flex-col items-center p-4 text-center">
							<div className={`p-3 rounded-full mb-2 ${game.color}`}>
								{game.icon}
							</div>
							<h3
								className={`font-medium ${isDark ? "text-white" : "text-gray-800"}`}
							>
								{game.name}
							</h3>

							<div className="flex mt-2 space-x-1">
								{game.popular && (
									<Badge
										variant="outline"
										className={`text-xs ${
											isDark
												? "bg-purple-900 border-purple-700 text-purple-300"
												: "bg-purple-50 border-purple-200 text-purple-700"
										}`}
									>
										Popular
									</Badge>
								)}
								{game.new && (
									<Badge
										variant="outline"
										className={`text-xs ${
											isDark
												? "bg-green-900 border-green-700 text-green-300"
												: "bg-green-50 border-green-200 text-green-700"
										}`}
									>
										New
									</Badge>
								)}
							</div>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
