"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
	Bell,
	CircleX,
	Crown,
	ExternalLink,
	Gift,
	Settings,
	Star,
	Trophy,
	Zap,
} from "lucide-react";
import { redirect } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AiFillHeart } from "react-icons/ai";
import { BiRepost } from "react-icons/bi";
import { FaDiscord } from "react-icons/fa";
import { MdMarkChatUnread } from "react-icons/md";
import {
	RiQuillPenLine,
	RiTelegram2Line,
	RiTwitterXFill,
} from "react-icons/ri";
import { TbMessageCircleFilled } from "react-icons/tb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	createCheckTask,
	createSocialLinks,
	createTasks,
	type Platform,
	type SocialLinks,
	type Task,
	type TaskType,
} from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "./ui/accordion";
import { Input } from "./ui/input";

type Props = {
	mini?: boolean;
	addPadding?: boolean;
};

function getIcon(taskType: TaskType) {
	const iconMap: Record<TaskType, { Icon: React.ElementType; bg: string }> = {
		JoinDiscord: { Icon: FaDiscord, bg: "bg-indigo-500" },
		JoinTelegram: { Icon: RiTelegram2Line, bg: "bg-blue-500" },
		FollowTwitter: { Icon: RiTwitterXFill, bg: "bg-black" },
		CreateTweet: { Icon: RiQuillPenLine, bg: "bg-sky-500" },
		LikeTweet: { Icon: AiFillHeart, bg: "bg-red-500" },
		RetweetPost: { Icon: BiRepost, bg: "bg-green-500" },
		CheckDiscordPost: { Icon: MdMarkChatUnread, bg: "bg-indigo-400" },
		CheckTelegramPost: { Icon: TbMessageCircleFilled, bg: "bg-blue-400" },
	};

	const item = iconMap[taskType];
	if (!item) return null;

	const { Icon, bg } = item;

	return (
		<div
			className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center shadow-sm`}
		>
			<Icon className="text-white w-6 h-6" />
		</div>
	);
}

function checkBinding(
	platform: Platform | null,
	socialLinks: SocialLinks | null,
) {
	if (!platform || !socialLinks) return false;
	if (platform === "Discord" && socialLinks.discord) return true;
	if (platform === "Twitter" && socialLinks.twitter) return true;
	if (platform === "Telegram" && socialLinks.telegram) return true;
	return false;
}

export default function TaskLayout({ mini = false, addPadding = true }: Props) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [showNotification, setShowNotification] = useState(false);
	const [notificationMessage, setNotificationMessage] = useState("");
	const [socialLinks, setSocialLinks] = useState<SocialLinks | null>(null);
	const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
	const [proofInputs, setProofInputs] = useState<Record<string, string>>({});

	const isDark = false;

	useEffect(() => {
		ws.sendMessage(createTasks());
		ws.sendMessage(createSocialLinks());
	}, []);

	useEffect(() => {
		const unsubTasks = ws.subscribeToTasks((data) => {
			setTasks(data);
		});

		const unsubSocialLinks = ws.subscribeToSocialLinks((data) => {
			setSocialLinks(data);
		});

		const unsubTaskNotCompleted = ws.subscribeTaskNotCompleted((data) => {
			setShowNotification(true);
			setNotificationMessage(data);
			setTimeout(() => setShowNotification(false), 3000);
		});

		const unsubTaskCompleted = ws.subscribeToTaskCompleted((data) => {
			setTasks((prev) => {
				if (!prev) return prev;

				for (let i = 0; i < prev.length; i++) {
					if (prev[i].id === data) {
						prev[i].completed = true;
						break;
					}
				}
				return prev;
			});

			setShowNotification(true);
			setNotificationMessage("Task completed!");
			setTimeout(() => setShowNotification(false), 3000);

			setCooldowns((prev) => {
				prev[data] = 0;
				return prev;
			});
		});

		return () => {
			unsubTasks();
			unsubTaskNotCompleted();
			unsubSocialLinks();
			unsubTaskCompleted();
		};
	}, []);

	useEffect(() => {
		const interval = setInterval(() => {
			setCooldowns((prev) => {
				const updated: Record<string, number> = {};
				for (const [key, value] of Object.entries(prev)) {
					if (value > 0) updated[key] = value - 1;
				}
				return updated;
			});
		}, 1000);

		return () => clearInterval(interval);
	}, []);

	const handleCheckStatus = (taskId: string, proof?: string) => {
		if (cooldowns[taskId] > 0) return;

		setCooldowns((prev) => ({ ...prev, [taskId]: 30 }));

		const payload = createCheckTask(taskId, proof?.trim() || null);
		ws.sendMessage(payload);
	};

	const handleGoToProfile = () => {
		redirect("/profile");
	};

	const updateProofInput = (taskId: string, value: string) => {
		setProofInputs((prev) => ({ ...prev, [taskId]: value }));
	};

	const getRewardTier = (points: number) => {
		if (points >= 1000) {
			return {
				tier: "legendary",
				color: "from-yellow-400 to-red-500",
				icon: Trophy,
			};
		}
		if (points >= 500) {
			return {
				tier: "elite",
				color: "from-pink-500 to-red-500",
				icon: Crown,
			};
		}
		if (points >= 300) {
			return {
				tier: "premium",
				color: "from-purple-500 to-pink-500",
				icon: Star,
			};
		}
		if (points >= 150) {
			return {
				tier: "high",
				color: "from-blue-500 to-cyan-500",
				icon: Zap,
			};
		}
		return {
			tier: "standard",
			color: "from-emerald-500 to-teal-500",
			icon: Gift,
		};
	};

	const getExpiryDisplay = (endDate: string | null) => {
		if (!endDate)
			return {
				text: "Never expires",
				color: "text-emerald-600",
				bg: "bg-emerald-100",
			};

		const end = new Date(endDate);
		const now = new Date();
		const diffTime = end.getTime() - now.getTime();
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		const formattedDate = end.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: end.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
		});

		if (diffDays === 0)
			return {
				text: `Expires today (${formattedDate})`,
				color: "text-red-600",
				bg: "bg-red-100",
			};
		if (diffDays === 1)
			return {
				text: `Expires in 1 day (${formattedDate})`,
				color: "text-orange-600",
				bg: "bg-orange-100",
			};
		if (diffDays <= 7)
			return {
				text: `Expires in ${diffDays} days (${formattedDate})`,
				color: "text-orange-600",
				bg: "bg-orange-100",
			};
		return {
			text: `Expires in ${diffDays} days (${formattedDate})`,
			color: "text-blue-600",
			bg: "bg-blue-100",
		};
	};

	const displayedTasks = useMemo(() => {
		if (!mini) return tasks;

		const telegramTasks = tasks.filter((t) => t.platform === "Telegram");

		const incomplete = telegramTasks.filter((t) => !t.completed);
		if (incomplete.length >= 3) return incomplete.slice(0, 3);

		// Add completed ones if needed
		const needed = 3 - incomplete.length;
		const completed = telegramTasks.filter((t) => t.completed);
		return [...incomplete, ...completed.slice(0, needed)];
	}, [tasks, mini]);

	return (
		<div
			className={`space-y-3 max-w-screen w-full py-2 ${addPadding ? "px-6" : ""}`}
		>
			<AnimatePresence>
				{showNotification && (
					<motion.div
						initial={{ opacity: 0, y: -20 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -20 }}
						className={`fixed top-4 left-4 right-4 z-50 p-3 border-1 rounded-lg shadow-lg flex items-center ${
							isDark ? "bg-gray-800 text-white" : "bg-white text-gray-800"
						}`}
					>
						<Bell className="w-5 h-5 mr-2 text-violet-500" />
						<span>{notificationMessage}</span>
						<Button
							variant="ghost"
							size="sm"
							className="ml-auto p-0 h-6 w-6"
							onClick={() => setShowNotification(false)}
						>
							<CircleX />
						</Button>
					</motion.div>
				)}
			</AnimatePresence>

			{displayedTasks.map((task) => {
				const rewardTier = getRewardTier(task.reward_point);
				const expiryInfo = getExpiryDisplay(task.ends_at);
				const RewardIcon = rewardTier.icon;
				const needsBinding = checkBinding(task.platform, socialLinks);

				return (
					<motion.div
						key={task.id}
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.4 }}
						whileHover={{ scale: 1.02 }}
					>
						<div
							className={`relative w-full overflow-hidden rounded-2xl border transition-all duration-300 ${
								task.completed
									? "bg-slate-50 border-slate-200"
									: needsBinding
										? "bg-amber-50 border-amber-200 hover:border-amber-300 hover:shadow-lg"
										: "bg-white border-slate-200 hover:border-slate-300 hover:shadow-xl"
							}`}
						>
							{/* Gradient accent */}
							<div
								className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
									needsBinding
										? "from-amber-400 to-orange-400"
										: rewardTier.color
								}`}
							></div>

							<div className="p-4 md:p-5">
								<div className="flex items-start gap-3 md:gap-4">
									{/* Platform Icon with Glow */}
									<div className="relative flex-shrink-0">
										{task.platform ? (
											<motion.div
												whileHover={{ scale: 1.1 }}
												transition={{ duration: 0.2 }}
												className="relative"
											>
												{getIcon(task.task_type)}
												{!task.completed && !needsBinding && (
													<div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-400/20 to-purple-400/20 blur-sm -z-10"></div>
												)}
											</motion.div>
										) : (
											<div className="w-8 h-8 bg-gradient-to-br from-slate-400 to-slate-600 rounded-lg flex items-center justify-center">
												<div className="w-4 h-4 bg-white rounded-sm opacity-90"></div>
											</div>
										)}
									</div>

									{/* Content */}
									<div className="flex-1 min-w-0 flex-wrap">
										<div className="flex items-start justify-between gap-3 mb-3">
											<div>
												<h3
													className={`font-semibold text-sm md:text-base leading-tight mb-1 text-wrap ${
														task.completed ? "text-slate-600" : "text-slate-900"
													}`}
												>
													{task.title}
												</h3>
												<div className="flex items-center gap-2 flex-wrap">
													<span
														className={`text-xs px-2 py-1 rounded-full font-medium ${expiryInfo.bg} ${expiryInfo.color}`}
													>
														{expiryInfo.text}
													</span>
													{needsBinding && (
														<span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
															<Settings className="w-3 h-3" />
															Connect {task.platform}
														</span>
													)}
												</div>
											</div>

											<Badge
												variant={task.completed ? "secondary" : "default"}
												className="flex-shrink-0 text-xs"
											>
												{task.completed ? "✓ Done" : "Active"}
											</Badge>
										</div>

										{/* Reward Display */}
										<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-2">
											{/* Reward Badge */}
											<div className="flex items-center gap-2">
												<div
													className={`flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r ${rewardTier.color} text-white text-sm font-semibold`}
												>
													<span>{task.reward_point}</span>
													<RewardIcon className="w-3 h-3" />
												</div>
												<span className="text-xs text-slate-500">points</span>
											</div>

											{/* Proof Input Field */}
											{task.proof_required && !task.completed && (
												<Input
													placeholder="Enter proof (e.g. tweet URL)"
													value={proofInputs[task.id] ?? ""}
													onChange={(e) =>
														updateProofInput(task.id, e.target.value)
													}
													className="text-sm md:max-w-xs"
												/>
											)}

											{/* Action Buttons */}
											<div className="flex flex-wrap gap-2">
												{needsBinding ? (
													<Button
														variant="outline"
														size="sm"
														className="h-8 text-xs bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
														onClick={handleGoToProfile}
													>
														<Settings className="w-3 h-3 mr-1" />
														Connect
													</Button>
												) : (
													task.redirect_url && (
														<Button
															variant="outline"
															size="sm"
															className="h-8 text-xs bg-transparent"
															onClick={() =>
																window.open(
																	// biome-ignore lint/style/noNonNullAssertion: It's valid
																	task.redirect_url!,
																	"_blank",
																	"noopener,noreferrer",
																)
															}
														>
															<ExternalLink className="w-3 h-3 mr-1" />
															Visit
														</Button>
													)
												)}

												<Button
													size="sm"
													className="h-8 text-xs"
													onClick={() =>
														handleCheckStatus(
															task.id,
															proofInputs[task.id] ?? "",
														)
													}
													disabled={
														task.completed ||
														needsBinding ||
														(cooldowns[task.id] ?? 0) > 0 ||
														(task.proof_required &&
															!proofInputs[task.id]?.trim())
													}
												>
													{task.completed
														? "Done"
														: needsBinding
															? "Connect First"
															: (cooldowns[task.id] ?? 0) > 0
																? `Wait ${cooldowns[task.id]}s`
																: "Check"}
												</Button>
											</div>
										</div>
									</div>
								</div>

								<Accordion type="single" collapsible>
									<AccordionItem value={`task-${task.id}`}>
										<AccordionTrigger className="text-xs text-center justify-center hover:no-underline py-1 w-full font-medium">
											View Description
										</AccordionTrigger>
										<AccordionContent className="text-sm py-0">
											{task.description}
										</AccordionContent>
									</AccordionItem>
								</Accordion>
							</div>
						</div>
					</motion.div>
				);
			})}
		</div>
	);
}
