import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { Copy, LogOut } from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { useEffect } from "react";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import {
	type BindData,
	type Chains,
	createBindWallet,
	type UserDetails,
} from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import { deleteToken } from "@/lib/utils";
import { Button } from "../ui/button";

interface WalletsProps {
	user: UserDetails;
	setShowNotification: (show: boolean) => void;
	setNotificationMessage: (message: string) => void;
}

export default function Wallets({
	user,
	setShowNotification,
	setNotificationMessage,
}: WalletsProps) {
	const messageToSign =
		"Welcome to the app. Sign this message to continue. Signing with: ";

	const { isConnected: evmConnected, address } = useAccount();
	const { openConnectModal } = useConnectModal();
	const { signMessageAsync: signEvm } = useSignMessage();
	const { disconnect: disconnectEvm } = useDisconnect();

	const {
		connected: solanaConnected,
		publicKey,
		signMessage,
		disconnect: disconnectSol,
	} = useWallet();
	const { setVisible: openSolanaModal } = useWalletModal();

	const handleDisconnect = () => {
		deleteToken();
		redirect("/logout");
	};

	const copyWalletAddressSol = async () => {
		if (!user.sol_wallet) return;

		try {
			await navigator.clipboard.writeText(user.sol_wallet);
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

	const handleBind = async (platform: Chains) => {
		switch (platform) {
			case "Solana":
				if (!solanaConnected || !publicKey) {
					openSolanaModal(true);
				} else if (solanaConnected && publicKey && signMessage) {
					const message = new TextEncoder().encode(
						`${messageToSign}${publicKey}`,
					);
					const sig = await signMessage(message);

					const bs58_sign = bs58.encode(sig);

					const bindData: BindData = {
						chain: "Solana",
						address: publicKey.toBase58(),
						signature: bs58_sign,
					};

					ws.sendMessage(createBindWallet(bindData));
				}

				break;
			case "Evm":
				if (!evmConnected || !address) {
					openConnectModal?.();
				} else if (evmConnected && address) {
					const sig = await signEvm({ message: `${messageToSign}${address}` });

					const bindData: BindData = {
						chain: "Evm",
						address: address,
						signature: sig,
					};

					ws.sendMessage(createBindWallet(bindData));
				}
				break;
		}
	};

	const disconnectWallet = (platform: Chains) => {
		switch (platform) {
			case "Solana":
				disconnectSol();
				break;
			case "Evm":
				disconnectEvm();
				break;
		}
	};

	const copyWalletAddressEvm = async () => {
		if (!user.evm_wallet) return;

		try {
			await navigator.clipboard.writeText(user.evm_wallet);
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: shut it
	useEffect(() => {
		const unsubBindFailed = ws.subscribeBindFailed((data) => {
			setNotificationMessage(data);
			setShowNotification(true);
			setTimeout(() => setShowNotification(false), 3000);
		});

		return () => {
			unsubBindFailed();
		};
	}, []);

	return (
		<div className="flex flex-col sm:flex-row sm:items-center mt-4 gap-3">
			{/* Solana Wallet */}
			<div className={`flex flex-1 items-center p-3 rounded-lg bg-gray-100`}>
				<Image
					src="/solana.svg"
					height={10}
					width={10}
					alt="Solana"
					className="w-10 h-10 mr-2"
				/>
				<div className="flex-1 flex flex-col gap-1">
					<div className={`text-sm font-medium text-gray-700`}>
						Solana Wallet
					</div>
					<div className={`text-xs break-all text-gray-500`}>
						{user.sol_wallet || publicKey?.toBase58() || "Not connected"}
					</div>
				</div>
				<div className="flex gap-2">
					{user.sol_wallet ? (
						<Button
							size="sm"
							variant="outline"
							className="flex items-center px-4 py-2 rounded-lg"
							onClick={copyWalletAddressSol}
						>
							<Copy className="w-4 h-4 mr-1" /> Copy
						</Button>
					) : (
						<div className="flex gap-2">
							{publicKey ? (
								<Button
									size="sm"
									variant="destructive"
									className="flex items-center px-4 py-2 rounded-lg"
									onClick={() => disconnectWallet("Solana")}
								>
									Disconnect
								</Button>
							) : (
								<div></div>
							)}
							<Button
								size="sm"
								variant="default"
								className="flex items-center px-4 py-2 rounded-lg"
								onClick={() => handleBind("Solana")}
							>
								Bind Solana
							</Button>
						</div>
					)}
				</div>
			</div>

			{/* EVM Wallet */}
			<div className={`flex flex-1 items-center p-3 rounded-lg bg-gray-100`}>
				<Image
					src="/eth.svg"
					height={10}
					width={10}
					alt="EVM"
					className="w-10 h-10 mr-2"
				/>
				<div className="flex-1 flex flex-col gap-1">
					<div className={`text-sm font-medium text-gray-700`}>EVM Wallet</div>
					<div className={`text-xs break-all  text-gray-500`}>
						{user.evm_wallet || address || "Not connected"}
					</div>
				</div>
				<div className="flex gap-2">
					{user.evm_wallet ? (
						<Button
							size="sm"
							variant="outline"
							className="flex items-center px-4 py-2 rounded-lg"
							onClick={copyWalletAddressEvm}
						>
							<Copy className="w-4 h-4 mr-1" /> Copy
						</Button>
					) : (
						<div className="flex gap-2">
							{address ? (
								<Button
									size="sm"
									variant="destructive"
									className="flex items-center px-4 py-2 rounded-lg"
									onClick={() => disconnectWallet("Evm")}
								>
									Disconnect
								</Button>
							) : (
								<div></div>
							)}
							<Button
								size="sm"
								variant="default"
								className="flex items-center px-4 py-2 rounded-lg"
								onClick={() => handleBind("Evm")}
							>
								Bind EVM
							</Button>
						</div>
					)}
				</div>
			</div>

			{/* Disconnect */}
			<Button
				size="sm"
				variant="destructive"
				className={`h-10 sm:h-15 4lex items-center rounded-lg`}
				onClick={handleDisconnect}
			>
				<LogOut className="w-4 h-4 mr-1" /> Disconnect
			</Button>
		</div>
	);
}
