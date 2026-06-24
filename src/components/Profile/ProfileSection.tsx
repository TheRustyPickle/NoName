"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, CircleX, Gift } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FaDiscord } from "react-icons/fa";
import type { IconType } from "react-icons/lib";
import { RiTelegram2Line } from "react-icons/ri";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
	createCheckReferral,
	createMeWithRankSocials,
	createSocialLinks,
	type SocialLinks,
	type UserDetails,
} from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import { getLevelInfo } from "@/lib/userRank";
import { getFormattedTime, getToken, nameToUse } from "@/lib/utils";
import { Input } from "../ui/input";
import Telegram from "../ui/Telegram";
import Activity from "./Activity";
import Username from "./Username";
import Wallets from "./Wallets";

const UPLOAD_URL =
	process.env.NEXT_PUBLIC_UPLOAD_URL ||
	"https://rustypickle.onrender.com/upload-avatar";

type SocialKey = keyof SocialLinks;

const socialPlatforms: { name: string; icon: IconType; key: SocialKey }[] = [
	{ name: "Discord", icon: FaDiscord, key: "discord" },
	{ name: "Telegram", icon: RiTelegram2Line, key: "telegram" },
];

export default function ProfileSection() {
	const [showNotification, setShowNotification] = useState(false);
	const [notificationMessage, setNotificationMessage] = useState("");
	const [user, setUser] = useState<UserDetails | null>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [jwt, setJwt] = useState<string | null>(null);
	const [socialLinks, setSocialLinks] = useState<SocialLinks | null>(null);
	const [referralInput, setReferralInput] = useState("");

	const isDark = false;

	useEffect(() => {
		const unsubMe = ws.subscribeToMe((data) => {
			setUser(data);
		});

		const unsubSocialLinks = ws.subscribeToSocialLinks((data) => {
			setSocialLinks(data);
		});

		const unsubTelegramError = ws.subscribeTelegramError((data) => {
			setNotificationMessage(data);
			setShowNotification(true);
		});

		const unsubBadReferralCode = ws.subscribeBadReferralCode(() => {
			setNotificationMessage("Invalid referral code");
			setShowNotification(true);
			setTimeout(() => setShowNotification(false), 3000);
		});

		return () => {
			unsubMe();
			unsubSocialLinks();
			unsubTelegramError();
			unsubBadReferralCode();
		};
	}, []);

	useEffect(() => {
		ws.sendMessage(createMeWithRankSocials());
		ws.sendMessage(createSocialLinks());
	}, []);

	useEffect(() => {
		setJwt(getToken());
	}, []);

	useEffect(() => {
		return () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	if (!user) {
		return <div>{"Loading"}</div>;
	}

	const user_level = getLevelInfo(user.points);

	const copyReferrralCode = async () => {
		try {
			if (!user.referral_code) return;

			await navigator.clipboard.writeText(user.referral_code);
			setNotificationMessage("Wallet address copied to clipboard");
			setShowNotification(true);
			setTimeout(() => setShowNotification(false), 3000);
		} catch (err) {
			console.error("Failed to copy:", err);
			setNotificationMessage("Failed to copy wallet address");
			setShowNotification(true);
			setTimeout(() => setShowNotification(false), 3000);
		}
	};

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (file) {
			setSelectedFile(file);
			setPreviewUrl(URL.createObjectURL(file));
		}
	}

	function handleCancelUpload() {
		setSelectedFile(null);
		setPreviewUrl(null);
		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	function handleUploadSubmit() {
		if (selectedFile) {
			uploadImage();
		}
	}

	const uploadImage = async () => {
		if (!selectedFile) return;

		const formData = new FormData();
		formData.append("file", selectedFile);

		try {
			setShowNotification(true);
			setNotificationMessage("Uploading image...");

			const res = await fetch(UPLOAD_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${jwt}`,
				},
				body: formData,
			});

			if (!res.ok) {
				const errorText = await res.text(); // extract error response body
				throw new Error(`Upload failed: ${errorText}`);
			}

			const data = await res.json();
			const imageUrl = data.url;

			user.photo_url = imageUrl;

			setNotificationMessage("Image uploaded successfully!");
			setTimeout(() => setShowNotification(false), 3000);
		} catch (err) {
			setNotificationMessage(`Failed to upload image. ${err}`);
			setShowNotification(true);
			setTimeout(() => setShowNotification(false), 3000);
		}
		handleCancelUpload();
	};

	const submitRefrral = () => {
		ws.sendMessage(createCheckReferral(referralInput.trim()));
	};

	return (
		<div className="space-y-6 w-full">
			{/* Notification */}
			<AnimatePresence>
				{showNotification && (
					<motion.div
						initial={{ opacity: 0, y: -20 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -20 }}
						className={`fixed top-4 left-4 right-4 z-50 p-3 border rounded-lg shadow-lg flex items-center ${
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

			<div className="hidden">
				<Telegram />
			</div>

			{/* Profile Card */}
			<Card
				className={`overflow-hidden shadow-sm ${isDark ? "bg-gray-800" : ""}`}
			>
				<div
					className={`h-24 bg-linear-to-r from-violet-500 to-purple-600`}
				></div>
				<CardContent className="relative p-5">
					<div className="relative flex flex-col ">
						<Avatar className="w-20 h-20 border-4 border-white">
							<AvatarImage
								src={previewUrl || user.photo_url}
								alt={nameToUse(user)}
							/>
						</Avatar>
						<div className="flex flex-col gap-2 mt-2">
							<div className="flex gap-2">
								<Button
									size="sm"
									variant="outline"
									onClick={() => fileInputRef.current?.click()}
								>
									Upload Photo
								</Button>
								{selectedFile && (
									<>
										<Button
											size="sm"
											variant="default"
											onClick={handleUploadSubmit}
										>
											Save Photo
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={handleCancelUpload}
										>
											Cancel
										</Button>
									</>
								)}
							</div>
							<input
								type="file"
								accept="image/*"
								ref={fileInputRef}
								className="hidden"
								onChange={handleFileChange}
							/>
						</div>
					</div>

					<div className="mt-2">
						{/* Username editable field */}
						<Username user={user} />
						<p className="text-gray-500">{getFormattedTime(user.joined_at)}</p>

						{/* Wallet section */}
						<Wallets
							user={user}
							setNotificationMessage={setNotificationMessage}
							setShowNotification={setShowNotification}
						/>

						{/* Referral Section */}
						<div
							className={`flex flex-col sm:flex-row sm:items-center mt-4 p-3 gap-3 rounded-lg ${
								isDark ? "bg-gray-700" : "bg-gray-100"
							}`}
						>
							<Gift className="w-5 h-5 mr-2" />

							<div className="flex-1 flex flex-col gap-1">
								<div
									className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}
								>
									Referral Code
								</div>

								{user.referral_code ? (
									<span
										className={`text-xs break-all ${isDark ? "text-gray-200" : "text-gray-800"}`}
									>
										{user.referral_code}
									</span>
								) : user.points >= 1000 &&
									user.discord?.trim() &&
									user.telegram?.trim() ? (
									<Input
										placeholder="Enter your referral code"
										value={referralInput}
										onChange={(e) => setReferralInput(e.target.value)}
										className="text-sm"
									/>
								) : (
									<p
										className={`text-xs ${isDark ? "text-gray-300" : "text-gray-700"}`}
									>
										Reach 1000 points and connect both social media accounts to
										get your referral code.
									</p>
								)}
							</div>

							<div className="flex gap-2 flex-wrap flex-row">
								{user.referral_code ? (
									<Button
										onClick={copyReferrralCode}
										variant="outline"
										className="rounded-full"
										size="sm"
									>
										Copy
									</Button>
								) : user.points >= 1000 &&
									user.discord?.trim() &&
									user.telegram?.trim() ? (
									<Button size="sm" variant="default" onClick={submitRefrral}>
										Submit
									</Button>
								) : null}
							</div>
						</div>
						<div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
							{socialPlatforms.map(({ icon: Icon, key, name }) => {
								const userValue = user?.[key];
								const socialLink = socialLinks?.[key];

								const statusLabel: React.ReactNode = userValue ? (
									<span
										className={`text-xs ${isDark ? "text-gray-300" : "text-gray-600"}`}
									>
										{userValue}
									</span>
								) : socialLink ? (
									key === "telegram" ? (
										<Button asChild variant="outline">
											<Link href={socialLink}>Connect</Link>
										</Button>
									) : (
										<Button
											size="sm"
											variant="outline"
											onClick={() =>
												window.open(
													socialLink,
													"_blank",
													"noopener,noreferrer,width=600,height=600,top=100,left=100",
												)
											}
										>
											Connect
										</Button>
									)
								) : (
									<span
										className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}
									>
										Coming Soon
									</span>
								);

								return (
									<div
										key={key}
										className={`flex flex-col items-center justify-center p-2 rounded-lg ${
											isDark ? "bg-gray-700" : "bg-gray-100"
										}`}
									>
										<div className="flex flex-row gap-1">
											<Icon className="w-6 h-6 mb-1"></Icon>
											{name}
										</div>
										{statusLabel}
									</div>
								);
							})}
						</div>
						<div className="grid grid-cols-3 gap-4 mt-6">
							<div className="text-center">
								<div
									className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}
								>
									{user_level.level}
								</div>
								<div
									className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
								>
									Level
								</div>
							</div>

							<div className="text-center">
								<div
									className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}
								>
									{user.points.toLocaleString()}
								</div>
								<div
									className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
								>
									Points
								</div>
							</div>

							<div className="text-center">
								<div
									className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}
								>
									{user.rank !== null ? user.rank.toLocaleString() : "N/A"}
								</div>
								<div
									className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
								>
									Rank
								</div>
							</div>
						</div>

						{/* Level Progress Bar */}
						<div className="mt-4">
							<div className="flex items-center justify-between mb-1">
								<span
									className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
								>
									Level {user_level.level}
								</span>
								<span
									className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
								>
									Level {user_level.level + 1}
								</span>
							</div>

							<Progress
								value={user_level.progress * 100}
								className={`h-5 rounded-full [&>div]:bg-linear-to-r [&>div]:from-rose-400 [&>div]:to-orange-500`}
							/>
							<div
								className={`mt-1 text-xs text-center ${isDark ? "text-gray-400" : "text-gray-500"}`}
							>
								{user_level.currentLevelPoints} / {user_level.nextLevelPoints}{" "}
								XP — {Math.round(user_level.progress * 100)}%
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<Activity />
		</div>
	);
}
