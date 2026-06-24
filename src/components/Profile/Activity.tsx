import { AnimatePresence, motion } from "framer-motion";
import {
	Blocks,
	Clock,
	Gamepad,
	HandIcon,
	Puzzle,
	SnailIcon,
	Trophy,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	createGetActivity,
	type GameSession,
	type GameType,
} from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import { getPlayDuration } from "@/lib/utils";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";

function getIconForGame(gameType: GameType) {
	switch (gameType) {
		case "Flappy":
			return <HandIcon className="w-5 h-5 text-orange-500" />;
		case "Snake":
			return <SnailIcon className="w-5 h-5 text-green-500" />;
		case "Tetris":
			return <Blocks className="w-5 h-5 text-purple-500" />;
		case "Two048":
			return <Puzzle className="w-5 h-5 text-blue-500" />;
		default:
			return <Gamepad className="w-5 h-5 text-blue-500" />;
	}
}

function getGameLabel(gameType: GameType): string {
	switch (gameType) {
		case "Two048":
			return "2048";
		default:
			return gameType;
	}
}

export default function Activity() {
	const [activity, setActivity] = useState<GameSession[]>([]);

	useEffect(() => {
		const unsubGameSessions = ws.subscribeToGameSessions((data) => {
			setActivity(data);
		});

		return () => {
			unsubGameSessions();
		};
	}, []);

	useEffect(() => {
		ws.sendMessage(createGetActivity());
	}, []);

	const isDark = false;

	if (activity.length === 0) {
		return (
			<div className="flex justify-center items-center">
				No activity. Play a game
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<AnimatePresence>
				{activity.map((session: GameSession, index) => (
					<motion.div
						key={`activity-${session.start_time}-${session.end_time}-${index}`}
						initial={{ opacity: 0, x: -20 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: 20 }}
						transition={{ duration: 0.3, delay: index * 0.05 }}
					>
						<Card
							className={`shadow-sm ${isDark ? "bg-gray-800 text-white" : ""}`}
						>
							<CardHeader className="flex flex-row items-center space-y-0 gap-3 pb-2">
								<div
									className={`p-2 rounded-full ${isDark ? "bg-gray-700" : "bg-gray-100"}`}
								>
									{getIconForGame(session.game_type)}
								</div>
								<div className="flex-1">
									<CardTitle className="text-base">
										Played {getGameLabel(session.game_type)}
									</CardTitle>
									<CardDescription className="text-xs mt-0.5">
										Ended at {new Date(session.end_time).toLocaleString()}
									</CardDescription>
								</div>
								<div className="text-sm font-medium flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
									<Trophy className="w-4 h-4" />
									{session.final_score}
								</div>
							</CardHeader>
							<CardContent className="text-xs text-muted-foreground flex items-center gap-2">
								<Clock className="w-3 h-3" />
								Played for{" "}
								{getPlayDuration(session.start_time, session.end_time)}
							</CardContent>
						</Card>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}
