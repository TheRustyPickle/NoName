"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { createLeaderboardIn, type UserDetails } from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import { noZoom } from "@/hooks/noZoom";
import { nameToUse } from "@/lib/utils";

const theme = {
	light: {
		bg: "bg-slate-50",
		header: "bg-gradient-to-r from-violet-500 to-purple-500 text-white",
		border: "border-white",
		topBorder: "border-yellow-400",
		pointsHighlight: "bg-yellow-300 text-yellow-800",
		ranks: {
			first: "bg-yellow-400 text-yellow-800",
			second: "bg-gray-200 text-gray-800",
			third: "bg-amber-700 text-amber-100",
		},
		label: "text-gray-500",
		scoreIncrease: "text-green-600 bg-green-100",
		highlightAnim: "rgba(236, 252, 203, 0.8)",
	},
	dark: {
		bg: "bg-slate-800",
		header: "bg-gradient-to-r from-violet-800 to-purple-900 text-gray-100",
		border: "border-gray-600",
		topBorder: "border-amber-500",
		pointsHighlight: "bg-amber-600 text-amber-100",
		ranks: {
			first: "bg-amber-500 text-amber-900",
			second: "bg-gray-600 text-gray-200",
			third: "bg-amber-800 text-amber-200",
		},
		label: "text-gray-400",
		scoreIncrease: "text-green-400 bg-green-900",
		highlightAnim: "rgba(133, 164, 83, 0.2)",
	},
};

export default function Leaderboard() {
	const { publicKey } = useWallet();
	const { address } = useAccount();

	const solKey = publicKey ? publicKey.toBase58() : "";
	const evmKey = address ? address : "";

	const isDark = false;
	const activeTheme = isDark ? theme.dark : theme.light;

	const [prevUsers, setPrevUsers] = useState<UserDetails[]>([]);
	const [prevPoints, setPrevPoints] = useState<Record<string, number>>({});

	// Track which users have increases to show
	const [activeIncreases, setActiveIncreases] = useState<
		Record<
			string,
			{
				active: boolean;
				amount: number;
			}
		>
	>({});

	// Store the initial render state to prevent animations on first render
	const [hasInitialRender, setHasInitialRender] = useState(false);

	// Use refs to manage timeouts
	const timeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

	const [users, setUsers] = useState<UserDetails[]>([]);

	const leaderboardReqSent = useRef(false);

	noZoom();

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

		return () => {
			unsubLeaderboard();
		};
	}, []);

	// Track user changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: shut it
	useEffect(() => {
		// Skip on first render
		if (prevUsers.length === 0) {
			const initialPoints = Object.fromEntries(
				users.map((user) => [user.user_id, user.points]),
			);
			setPrevPoints(initialPoints);
			setPrevUsers([...users]);
			setHasInitialRender(true);
			return;
		}

		const newIncreases: Record<string, { active: boolean; amount: number }> =
			{};

		for (const user of users) {
			const prevPoint = prevPoints[user.user_id] || user.points;
			const pointsDiff = user.points - prevPoint;

			if (pointsDiff > 0) {
				// Clear existing timeout
				if (timeoutsRef.current[user.user_id]) {
					clearTimeout(timeoutsRef.current[user.user_id]);
				}

				// Activate point box
				newIncreases[user.user_id] = { active: true, amount: pointsDiff };

				// Set timeout for removal
				timeoutsRef.current[user.user_id] = setTimeout(() => {
					setActiveIncreases((prev) => {
						const updated = { ...prev };
						delete updated[user.user_id]; // Completely remove instead of setting `active: false`
						return updated;
					});
				}, 3000);
			}
		}

		setActiveIncreases(newIncreases);
		setPrevPoints(
			Object.fromEntries(users.map((user) => [user.user_id, user.points])),
		);
		setPrevUsers([...users]);

		// Cleanup timeouts
		return () => {
			Object.values(timeoutsRef.current).forEach(clearTimeout);
		};
	}, [users]);

	const getRankChange = (userId: string) => {
		const currentRank = users.findIndex((u) => u.user_id === userId);
		const prevRank = prevUsers.findIndex((u) => u.user_id === userId);
		return (prevRank !== -1 ? prevRank : currentRank) - currentRank;
	};

	// Top 3 users get special treatment
	const topUsers = users.slice(0, 3);
	const otherUsers = users.slice(3);

	// Reusable top player component with key for stable identity
	const TopPlayer = ({
		user,
		rank,
		size = "md",
	}: {
		user: UserDetails;
		rank: number;
		size: "sm" | "md" | "lg";
	}) => {
		if (!user) return null;

		const sizeClasses = {
			sm: "w-16 h-16",
			md: "w-16 h-16",
			lg: "w-20 h-20",
		};

		const rankBadgeClasses = {
			1: activeTheme.ranks.first,
			2: activeTheme.ranks.second,
			3: activeTheme.ranks.third,
		};

		const rankBadgeSize = rank === 1 ? "w-7 h-7" : "w-6 h-6";
		const pointsIncreaseData = activeIncreases[user.user_id];
		const pointsIncreased = pointsIncreaseData?.active || false;
		const rankChange = getRankChange(user.user_id);

		const currentWallet = user.sol_wallet ?? user.evm_wallet;
		const isCurrentUser = currentWallet === (user.sol_wallet ? solKey : evmKey);

		return (
			<div
				className={`text-center ${rank === 1 ? "-mb-4" : ""}`}
				key={`top-player-${user.user_id}`}
			>
				{hasInitialRender ? (
					<div className={`relative ${sizeClasses[size]} mx-auto mb-2`}>
						<Image
							src={user.photo_url}
							alt={nameToUse(user)}
							fill
							sizes={size === "lg" ? "80px" : "64px"}
							priority={size === "lg"}
							className={`rounded-full ${rank === 1 ? `border-4 ${activeTheme.topBorder}` : `border-2 ${activeTheme.border}`} object-cover`}
						/>
						<div
							className={`absolute -bottom-2 left-1/2 transform -translate-x-1/2 ${rankBadgeClasses[rank as keyof typeof rankBadgeClasses]} rounded-full ${rankBadgeSize} flex items-center justify-center text-xs font-bold`}
						>
							{rank}
						</div>
						{rankChange > 0 && (
							<motion.div
								className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
								initial={{ scale: 0 }}
								animate={{ scale: 1 }}
								transition={{ duration: 0.3 }}
							>
								{rankChange}
							</motion.div>
						)}
					</div>
				) : (
					<motion.div
						className={`relative ${sizeClasses[size]} mx-auto mb-2`}
						initial={{ y: 20, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						transition={{
							type: "spring",
							stiffness: 200,
							damping: 25,
							delay: rank === 1 ? 0 : 0.1,
						}}
					>
						<Image
							src={user.photo_url}
							alt={nameToUse(user)}
							fill
							sizes={size === "lg" ? "80px" : "64px"}
							priority={size === "lg"}
							className={`rounded-full ${rank === 1 ? `border-4 ${activeTheme.topBorder}` : `border-2 ${activeTheme.border}`} object-cover`}
						/>
						<div
							className={`absolute -bottom-2 left-1/2 transform -translate-x-1/2 ${rankBadgeClasses[rank as keyof typeof rankBadgeClasses]} rounded-full ${rankBadgeSize} flex items-center justify-center text-xs font-bold`}
						>
							{rank}
						</div>
						{rankChange > 0 && (
							<motion.div
								className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
								initial={{ scale: 0 }}
								animate={{ scale: 1 }}
								transition={{ duration: 0.3 }}
							>
								{rankChange}
							</motion.div>
						)}
					</motion.div>
				)}
				<p
					className={`text-sm font-medium truncate max-w-[${rank === 1 ? "100" : "80"}px]`}
				>
					{nameToUse(user)}
				</p>
				<div className="relative h-10">
					<div className="absolute inset-0 flex flex-col items-center">
						<AnimatePresence>
							{pointsIncreased && (
								<motion.div
									key={`increase-${user.user_id}-${pointsIncreaseData.amount}`}
									initial={{ opacity: 0, y: 0, scale: 0.5 }}
									animate={{
										opacity: 1,
										y: -20,
										scale: 1,
										transition: { duration: 0.3 },
									}}
									exit={{
										opacity: 0,
										y: -30,
										transition: { duration: 0.2 },
									}}
									className={`absolute -top-1 left-1/2 transform -translate-x-1/2 ${activeTheme.pointsHighlight} px-3 py-1 rounded-full text-sm font-bold`}
								>
									+{pointsIncreaseData.amount}
								</motion.div>
							)}
						</AnimatePresence>
						<motion.p
							className={`font-bold ${rank === 1 ? "text-lg" : ""}`}
							animate={pointsIncreased ? { scale: 1.2 } : { scale: 1 }}
							transition={{
								type: "spring",
								stiffness: 300,
								damping: 10,
							}}
						>
							{user.points}
						</motion.p>
						{isCurrentUser && (
							<Badge
								variant="secondary"
								className="bg-blue-500 text-white mt-2"
							>
								You
							</Badge>
						)}
					</div>
				</div>
			</div>
		);
	};

	return (
		<motion.div
			className={`${activeTheme.bg} rounded-xl shadow-lg overflow-hidden`}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.4 }}
		>
			{/* Top 3 section */}
			<div className={`p-6 ${activeTheme.header}`}>
				<h2 className="text-xl font-bold text-center mb-6">Top Players</h2>

				<div className="flex justify-center items-end gap-4 mb-2">
					{/* Display positions in 2-1-3 order */}
					<div className="flex justify-center items-end gap-4 mb-2">
						{topUsers[1] && (
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.4, delay: 0.1 }}
							>
								<TopPlayer user={topUsers[1]} rank={2} size="md" />
							</motion.div>
						)}
						{topUsers[0] && (
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.4 }}
							>
								<TopPlayer user={topUsers[0]} rank={1} size="lg" />
							</motion.div>
						)}
						{topUsers[2] && (
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.4, delay: 0.2 }}
							>
								<TopPlayer user={topUsers[2]} rank={3} size="sm" />
							</motion.div>
						)}
					</div>
				</div>
			</div>

			{/* Other users */}
			<div className="p-4">
				{otherUsers.length > 0 && (
					<h3 className={`text-sm font-medium ${activeTheme.label} mb-2 px-2`}>
						Leaderboard
					</h3>
				)}
				<div className="space-y-2">
					{otherUsers.map((user, index) => {
						const rankChange = getRankChange(user.user_id);
						const pointsIncreaseData = activeIncreases[user.user_id];
						const pointsIncreased = pointsIncreaseData?.active || false;

						const currentWallet = user.sol_wallet ?? user.evm_wallet;
						const isCurrentUser =
							currentWallet === (user.sol_wallet ? solKey : evmKey);

						return (
							<motion.div
								key={`user-${user.user_id}`}
								layout
								initial={
									hasInitialRender
										? { opacity: 1, y: 0 }
										: { opacity: 0, y: 20 }
								}
								animate={{
									opacity: 1,
									y: 0,
									backgroundColor: pointsIncreased
										? [activeTheme.highlightAnim, "rgba(0, 0, 0, 0)"]
										: "rgba(0, 0, 0, 0)",
								}}
								transition={{
									opacity: hasInitialRender
										? { duration: 0 }
										: { duration: 0.3, delay: 0.3 + index * 0.03 },
									y: hasInitialRender
										? { duration: 0 }
										: { duration: 0.3, delay: 0.3 + index * 0.03 },
									backgroundColor: { duration: 1 },
									layout: { duration: 0.3 },
								}}
								className={`flex items-center p-3 rounded-lg ${
									isDark ? "hover:bg-slate-700" : "hover:bg-slate-100"
								}`}
							>
								<div
									className={`w-6 font-bold text-center ${activeTheme.label}`}
								>
									{index + 4}
								</div>

								<div className="w-8 h-8 relative mx-2">
									<Image
										src={user.photo_url}
										alt={nameToUse(user)}
										fill
										sizes="32px"
										className="rounded-full object-cover"
									/>
									{rankChange > 0 && (
										<motion.div
											className="absolute -bottom-1 -right-1 bg-green-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
											initial={{ scale: 0 }}
											animate={{ scale: 1 }}
											transition={{ duration: 0.3 }}
										>
											{rankChange}
										</motion.div>
									)}
								</div>

								<div className="flex-1 ml-2 flex items-center space-x-2">
									<div
										className={`font-medium text-sm ${isDark ? "text-gray-100" : ""}`}
									>
										{nameToUse(user)}
									</div>
									{isCurrentUser && (
										<Badge
											variant="secondary"
											className="bg-blue-500 text-white"
										>
											You
										</Badge>
									)}
								</div>

								<div className="flex items-center">
									<AnimatePresence>
										{pointsIncreased && (
											<motion.div
												key={`increase-points-${user.user_id}-${pointsIncreaseData.amount}`}
												initial={{ opacity: 0, y: 10, scale: 0.5 }}
												animate={{
													opacity: 1,
													y: 0,
													scale: 1,
													transition: {
														type: "spring",
														stiffness: 300,
														damping: 15,
													},
												}}
												exit={{
													opacity: 0,
													y: -10,
													transition: { duration: 0.2 },
												}}
												className={`${activeTheme.scoreIncrease} text-xs mr-2 px-1.5 py-0.5 rounded-full`}
											>
												+{pointsIncreaseData.amount}
											</motion.div>
										)}
									</AnimatePresence>
									<motion.div
										key={`points-value-${user.user_id}`}
										className={`font-bold ${isDark ? "text-gray-100" : ""}`}
										animate={
											pointsIncreased
												? { scale: 1.3, y: -3 }
												: { scale: 1, y: 0 }
										}
										transition={{
											type: "spring",
											stiffness: 300,
											damping: 10,
										}}
									>
										{user.points}
									</motion.div>
								</div>
							</motion.div>
						);
					})}
				</div>
			</div>
		</motion.div>
	);
}
