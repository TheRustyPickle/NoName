"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { redirect } from "next/navigation";
import { memo, Suspense, useEffect, useRef, useState } from "react";
import MiniLeaderboard from "@/components/Leaderboard/MiniLeaderboard";
import Tasks from "@/components/Tasks";
import GamesGrid from "@/components/Tetris/GamesGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
	createLeaderboardIn,
	createMe,
	type UserDetails,
} from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import { getLevelInfo } from "@/lib/userRank";
import { nameToUse } from "@/lib/utils";

const MemoLeaderboard = memo(MiniLeaderboard);

export default function HomePage() {
	const isFirstVisit = false;
	const [user, setUser] = useState<UserDetails | null>(null);

	const [users, setUsers] = useState<UserDetails[]>([]);

	const leaderboardReqSent = useRef(false);

	useEffect(() => {
		if (!leaderboardReqSent.current) {
			ws.sendMessage(createLeaderboardIn());
			leaderboardReqSent.current = true;
		}
	}, []);

	useEffect(() => {
		const unsubLeaderboard = ws.subscribeToLeaderboard((data) => {
			setUsers(data);
		});

		const unsubMe = ws.subscribeToMe((data) => {
			setUser(data);
		});

		return () => {
			unsubLeaderboard();
			unsubMe();
		};
	}, []);

	useEffect(() => {
		ws.sendMessage(createMe());
	}, []);

	if (!user) {
		return <div>{"Loading"}</div>;
	}

	const user_level = getLevelInfo(user.points);

	return (
		<AnimatePresence mode="wait">
			<motion.div
				key="home-content"
				initial={isFirstVisit ? { opacity: 0 } : false}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.5 }}
				className="p-4 space-y-6 bg-gray-50/50"
			>
				{/* Hero Section with Points */}
				<motion.div
					whileHover={{ scale: 1.01 }}
					transition={{ type: "spring", stiffness: 100, damping: 15 }}
				>
					<Card className="relative overflow-hidden shadow-lg bg-linear-to-r from-violet-500 to-purple-600 text-white border-0">
						<CardContent className="relative p-6">
							<div className="flex items-center justify-between">
								<div>
									<h2 className="text-xl font-bold">
										Welcome, {nameToUse(user)}!
									</h2>
									<p className="text-white/80">Ready to play?</p>
								</div>
								<Button
									variant="ghost"
									size="icon"
									className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 cursor-pointer"
									onClick={() => redirect("/profile")}
								>
									{user && (
										<Image
											width={32}
											height={32}
											src={user.photo_url}
											alt={user.username || "User Image"}
											className="w-8 h-8 rounded-full"
										/>
									)}
								</Button>
							</div>

							<div className="flex items-end justify-between mt-6">
								<div>
									<p className="text-sm text-white/70">Your Points</p>
									<motion.div
										className="flex items-baseline"
										transition={{ duration: 0.3 }}
									>
										<span className="text-3xl font-bold">
											{user?.points.toLocaleString()}
										</span>
										<span className="ml-2 text-sm text-white/70">pts</span>
									</motion.div>
								</div>
								<div className="text-right">
									<p className="text-sm font-bold text-white/80">Level</p>
									<div className="flex items-center">
										<Badge
											variant="secondary"
											className="w-8 h-8 mr-2 text-sm font-bold rounded-full flex items-center justify-center bg-white/30 text-white shadow-sm backdrop-blur-sm"
										>
											{user_level.level}
										</Badge>

										{/* Progress Bar */}
										<div className="flex flex-col gap-0.5 w-full">
											<Progress
												value={user_level.progress * 100}
												className="h-3 w-30 bg-white/20 [&>div]:bg-linear-to-r [&>div]:from-rose-400 [&>div]:to-orange-500"
											/>
											<span className="font-bold text-sm text-white/80">
												{user_level.currentLevelPoints} /{" "}
												{user_level.nextLevelPoints} XP
											</span>
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</motion.div>

				{/* Featured Games */}
				<Suspense fallback={<Skeleton className="h-39 w-full rounded-xl" />}>
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.3, delay: 0.1 }}
					>
						<Card>
							<CardHeader className="flex flex-row items-center justify-between">
								<CardTitle className="text-lg">Featured Games</CardTitle>
								<Button
									variant="ghost"
									size="sm"
									className="text-sm text-violet-600"
								>
									See All
								</Button>
							</CardHeader>
							<CardContent>
								<GamesGrid featured={true} limit={3} />
							</CardContent>
						</Card>
					</motion.div>
				</Suspense>

				{/* Daily Challenges */}
				<Suspense fallback={<Skeleton className="h-39 w-full rounded-xl" />}>
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.3, delay: 0.3 }}
					>
						<Card>
							<CardHeader className="flex flex-row items-center justify-between">
								<CardTitle className="text-lg">Tasks</CardTitle>
								<Button
									variant="ghost"
									size="sm"
									className="text-sm text-violet-600"
									onClick={() => redirect("/tasks")}
								>
									See All
								</Button>
							</CardHeader>
							<CardContent>
								<div className="w-full justify-center item-center flex">
									<Tasks mini={true} addPadding={false}></Tasks>
								</div>
							</CardContent>
						</Card>
					</motion.div>
				</Suspense>

				{/* Top Players */}
				<Suspense fallback={<Skeleton className="h-39 w-full rounded-xl" />}>
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.3, delay: 0.4 }}
					>
						<Card>
							<CardHeader className="flex flex-row items-center justify-between">
								<CardTitle className="text-lg">Top Players</CardTitle>
								<Button
									variant="ghost"
									size="sm"
									className="text-sm text-violet-600"
									onClick={() => redirect("/leaderboard")}
								>
									See All
								</Button>
							</CardHeader>
							<CardContent>
								<MemoLeaderboard users={users} />
							</CardContent>
						</Card>
					</motion.div>
				</Suspense>
			</motion.div>
		</AnimatePresence>
	);
}
