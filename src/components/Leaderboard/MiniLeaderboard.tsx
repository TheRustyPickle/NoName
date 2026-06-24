"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, motion } from "framer-motion";
import { Award, Medal, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { UserDetails } from "@/core/websocket/models";

interface LeaderboardProps {
	users: UserDetails[];
	publicKeyString?: string;
}

interface AnimatedUserDetails extends UserDetails {
	previousPoints?: number;
	previousRank?: number;
}

export default function Leaderboard({ users }: LeaderboardProps) {
	const [animatedUsers, setAnimatedUsers] = useState<AnimatedUserDetails[]>([]);
	const [pointChanges, setPointChanges] = useState<Record<string, number>>({});
	const { publicKey } = useWallet();
	const pointTimers = useRef<Record<string, NodeJS.Timeout>>({});

	useEffect(() => {
		setAnimatedUsers((prevUsers) => {
			const newPointChanges: Record<string, number> = {};

			const updatedUsers = users.map((user, index) => {
				const prevUser = prevUsers.find((u) => u.user_id === user.user_id);
				const pointDiff = prevUser ? user.points - prevUser.points : 0;

				if (pointDiff !== 0) {
					newPointChanges[user.user_id] = pointDiff;

					// Cancel any previous timer
					if (pointTimers.current[user.user_id]) {
						clearTimeout(pointTimers.current[user.user_id]);
					}

					// Set a new timer
					pointTimers.current[user.user_id] = setTimeout(() => {
						setPointChanges((prev) => {
							const updated = { ...prev };
							delete updated[user.user_id];
							return updated;
						});
					}, 1500);
				}

				return {
					...user,
					previousPoints: prevUser?.points,
					previousRank: prevUser
						? prevUsers.findIndex((u) => u.user_id === user.user_id)
						: index,
				};
			});

			setPointChanges((prev) => ({
				...prev,
				...newPointChanges,
			}));

			return updatedUsers;
		});
	}, [users]);

	const getRankIcon = (rank: number) => {
		switch (rank) {
			case 0:
				return <Trophy className="w-5 h-5 text-yellow-500" />;
			case 1:
				return <Medal className="w-5 h-5 text-gray-400" />;
			case 2:
				return <Award className="w-5 h-5 text-amber-600" />;
			default:
				return (
					<div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
						{rank + 1}
					</div>
				);
		}
	};

	const getRankColors = (rank: number) => {
		switch (rank) {
			case 0:
				return "bg-gradient-to-r from-yellow-50 to-yellow-100 border-yellow-200";
			case 1:
				return "bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200";
			case 2:
				return "bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200";
			default:
				return "bg-background border-border";
		}
	};

	return (
		<div className="w-full mx-auto space-y-2">
			<AnimatePresence mode="popLayout">
				{animatedUsers.map((user, index) => (
					<motion.div
						key={user.user_id}
						layout
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -20 }}
						transition={{
							layout: { duration: 0.5, ease: "easeInOut" },
							opacity: { duration: 0.3 },
							y: { duration: 0.3 },
						}}
					>
						<Card
							className={`${getRankColors(index)} transition-colors duration-300`}
						>
							<CardContent className="p-1">
								<div className="ml-2 flex items-center gap-3">
									{/* Rank Icon */}
									<motion.div
										initial={false}
										animate={{
											scale:
												user.previousRank !== undefined &&
												user.previousRank !== index
													? [1, 1.2, 1]
													: 1,
										}}
										transition={{ duration: 0.3 }}
									>
										{getRankIcon(index)}
									</motion.div>

									{/* Avatar */}
									<Avatar className="w-10 h-10">
										<AvatarImage
											src={user.photo_url || "/placeholder.svg"}
											alt={user.username || "User"}
										/>
										<AvatarFallback>
											{user.username?.charAt(0).toUpperCase() || "U"}
										</AvatarFallback>
									</Avatar>

									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<p className="font-semibold truncate">
												{user.username || "Anonymous"}
											</p>

											{publicKey &&
												user.sol_wallet === publicKey.toBase58() && (
													<Badge
														variant="secondary"
														className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
													>
														You
													</Badge>
												)}
										</div>

										<p className="text-sm text-muted-foreground truncate">
											{user.sol_wallet
												? `${user.sol_wallet.slice(0, 6)}...${user.sol_wallet.slice(-4)}`
												: "No wallet"}
										</p>
									</div>

									{/* Points */}
									<div className="text-right relative mr-2">
										<motion.div
											className="font-bold text-lg"
											animate={
												pointChanges[user.user_id] ? { scale: [1, 1.2, 1] } : {}
											}
											transition={{ duration: 0.5 }}
										>
											{user.points.toLocaleString()}
										</motion.div>

										{/* Point Change Animation */}
										<AnimatePresence>
											{pointChanges[user.user_id] && (
												<motion.div
													initial={{ opacity: 0, y: 0, scale: 0.8 }}
													animate={{ opacity: 1, y: -20, scale: 1 }}
													exit={{ opacity: 0, y: -30 }}
													transition={{ duration: 1.5, ease: "easeOut" }}
													className="absolute -top-6 right-0"
												>
													<Badge
														variant={
															pointChanges[user.user_id] > 0
																? "default"
																: "destructive"
														}
														className="text-xs"
													>
														{pointChanges[user.user_id] > 0 ? "+" : ""}
														{pointChanges[user.user_id]}
													</Badge>
												</motion.div>
											)}
										</AnimatePresence>

										<p className="text-xs text-muted-foreground">points</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}
