"use client";

import { Gamepad2, House, ListTodo, Trophy, User } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
	createAuthMessageToken,
	createFlappyEndMessage,
	createLeaderboardOut,
	createSnakeEndMessage,
	createTetrisEndMessage,
	createTwo048EndMessage,
} from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import { useDisconnectWallets } from "@/hooks/disconnectWallets";
import { deleteToken, getToken, saveToken } from "@/lib/utils";
import { UnifiedWalletFlow } from "./UnifiedWalletFlow";
import BottomTabBar from "./ui/BottomTabBar";

const tabs = [
	{ id: "home", text: "Home", Icon: House },
	{ id: "games", text: "Games", Icon: Gamepad2 },
	{ id: "leaderboard", text: "Leaderboard", Icon: Trophy },
	{ id: "tasks", text: "Tasks", Icon: ListTodo },
	{ id: "profile", text: "Profile", Icon: User },
];

export function WsWrapper({ children }: { children: React.ReactNode }) {
	const [showTabbar, setShowTabbar] = useState(true);
	const [isWsOpen, setIsWsOpen] = useState(false);
	const [connStarted, setConnStarted] = useState(false);
	const [message, setMessage] = useState("Connecting to the server...");
	const [messageSigned, setMessageSigned] = useState(false);
	const [currentTab, setCurrentTab] = useState("home");
	const [jwt, setJwt] = useState<string | null>(null);

	const { disconnectWallets } = useDisconnectWallets();

	const [logout, setLogout] = useState(false);

	const router = useRouter();
	const pathname = usePathname();

	const wasInTetrisRef = useRef(false);
	const wasInSnakeRef = useRef(false);
	const wasIn2048Ref = useRef(false);
	const wasInFlappyRef = useRef(false);

	const authMessageSent = useRef(false);

	const pathWithoutSlash = pathname.replace("/", "");

	if (pathWithoutSlash !== currentTab) {
		setCurrentTab(pathWithoutSlash);
	}

	useEffect(() => {
		if (jwt && isWsOpen && !authMessageSent.current) {
			ws.sendMessage(createAuthMessageToken(jwt));
			authMessageSent.current = true;
		}
	}, [jwt, isWsOpen]);

	useEffect(() => {
		setJwt(getToken());
	}, []);

	useEffect(() => {
		if (logout) {
			setLogout(false);
			setMessageSigned(false);
			ws.closeConnection();

			setConnStarted(false);
			setIsWsOpen(false);
			setShowTabbar(true);
			setCurrentTab("home");
			wasInTetrisRef.current = false;
			wasInSnakeRef.current = false;
			wasIn2048Ref.current = false;
			wasInFlappyRef.current = false;
		}
	}, [logout]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: incorrect
	useEffect(() => {
		const replaced_path = pathname.replace("/", "");
		setCurrentTab(replaced_path);

		if (replaced_path === "tetris") {
			const isLargeScreen = window.innerWidth >= 800;

			if (!isLargeScreen) {
				setShowTabbar(false);
			}
			wasInTetrisRef.current = true;
		} else {
			if (wasInTetrisRef.current) {
				ws.sendMessage(createTetrisEndMessage());
				wasInTetrisRef.current = false;
			}
		}

		if (replaced_path === "snake") {
			wasInSnakeRef.current = true;
		} else {
			if (wasInSnakeRef.current) {
				ws.sendMessage(createSnakeEndMessage());
				wasInSnakeRef.current = false;
			}
		}

		if (replaced_path === "2048") {
			wasIn2048Ref.current = true;
		} else {
			if (wasIn2048Ref.current) {
				ws.sendMessage(createTwo048EndMessage());
				wasIn2048Ref.current = false;
			}
		}

		if (replaced_path === "flappy") {
			wasInFlappyRef.current = true;
		} else {
			if (wasInFlappyRef.current) {
				ws.sendMessage(createFlappyEndMessage());
				wasInFlappyRef.current = false;
			}
		}

		if (replaced_path !== "tetris") {
			setShowTabbar(true);
		}

		if (replaced_path !== "leaderboard") {
			ws.sendMessage(createLeaderboardOut());
		}

		if (replaced_path === "logout") {
			setLogout(true);
			setMessageSigned(false);
			router.replace("/");
			disconnectWallets();
		}
	}, [pathname]);

	useEffect(() => {
		ws.connect();
	}, []);

	// Retry connection every 1s
	useEffect(() => {
		let retryTimeout: NodeJS.Timeout | null = null;

		const connectWithRetry = () => {
			ws.connect();
		};

		ws.onConnectionChange((isOpen) => {
			setIsWsOpen(isOpen);

			if (!isOpen) {
				retryTimeout = setTimeout(() => {
					connectWithRetry();
				}, 1000);
			} else if (retryTimeout) {
				clearTimeout(retryTimeout);
				retryTimeout = null;
			}
		});
	}, []);

	useEffect(() => {
		const unsubInvalidSign = ws.subscribeInvalidSign(() => {
			setMessageSigned(false);
			setMessage("Invalid signature found. Please sign the message again");
		});

		const unsubConnection = ws.subscribeToConnectionStarted((data) => {
			setConnStarted(true);
			setMessageSigned(true);
			if (data) {
				saveToken(data);
			}
		});

		const unsubInvalidJWT = ws.subscribeInvalidJWT(() => {
			setMessageSigned(false);
			deleteToken();
		});

		return () => {
			unsubInvalidSign();
			unsubConnection();
			unsubInvalidJWT();
		};
	}, []);

	const handleTabClick = (id: string) => {
		if (id !== "leaderboard") {
			ws.sendMessage(createLeaderboardOut());
		}
		setCurrentTab(id);
		router.push(`/${id}`);
	};

	if (!isWsOpen) {
		return (
			<div className="fixed inset-0 flex items-center justify-center">
				<div className="flex items-center justify-center p-4 bg-blue-500 text-white font-semibold text-lg rounded-lg shadow-md">
					<p>{message}</p>
				</div>
			</div>
		);
	}

	if (!messageSigned) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center gap-5">
				<UnifiedWalletFlow setMessageSigned={setMessageSigned} />
			</div>
		);
	}

	if (!connStarted) {
		return (
			<div className="fixed inset-0 flex items-center justify-center">
				<div className="flex items-center justify-center p-4 bg-blue-500 text-white font-semibold text-lg rounded-lg shadow-md">
					<p>{message}</p>
				</div>
			</div>
		);
	}

	if (!showTabbar) {
		return <>{children}</>;
	}

	return (
		<>
			<div className="pb-15">{children}</div>{" "}
			<BottomTabBar
				tabs={tabs}
				currentTab={currentTab}
				handleTabClick={handleTabClick}
			/>
		</>
	);
}
