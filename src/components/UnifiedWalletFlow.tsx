"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { Signature } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { createAuthMessage } from "@/core/websocket/models";
import ws from "@/core/websocket/ws";

type Chain = "evm" | "solana" | null;

interface WalletFlowProps {
	setMessageSigned: (signed: boolean) => void;
}

export function UnifiedWalletFlow({ setMessageSigned }: WalletFlowProps) {
	const [open, setOpen] = useState(false);
	const [selectedChain, setSelectedChain] = useState<Chain>(null);

	const { isConnected: evmConnected, address } = useAccount();
	const { openConnectModal } = useConnectModal();
	const { signMessageAsync: signEvm } = useSignMessage();
	const { disconnect: disconnectEvm } = useDisconnect();

	const messageToSign =
		"Welcome to the app. Sign this message to continue. Signing with: ";

	const {
		connected: solanaConnected,
		publicKey,
		signMessage,
		disconnect: disconnectSol,
	} = useWallet();
	const { setVisible: openSolanaModal } = useWalletModal();

	useEffect(() => {
		if (evmConnected && address) {
			setSelectedChain("evm");
		} else if (solanaConnected && publicKey) {
			setSelectedChain("solana");
		} else {
			setSelectedChain(null);
		}
	}, [evmConnected, address, solanaConnected, publicKey]);

	function handleDisconnect() {
		if (selectedChain === "evm" && evmConnected) {
			disconnectEvm();
		} else if (selectedChain === "solana" && solanaConnected) {
			disconnectSol();
		}
		setSelectedChain(null);
	}

	async function handleSign() {
		if (selectedChain === "evm" && evmConnected && address) {
			const sig = await signEvm({ message: `${messageToSign}${address}` });

			ws.sendMessage(createAuthMessage(address, sig, "Evm"));
			setMessageSigned(true);
		} else if (
			selectedChain === "solana" &&
			solanaConnected &&
			publicKey &&
			signMessage
		) {
			const message = new TextEncoder().encode(`${messageToSign}${publicKey}`);
			const sig = await signMessage(message);

			const bs58_sign = bs58.encode(sig);

			ws.sendMessage(
				createAuthMessage(publicKey.toBase58(), bs58_sign, "Solana"),
			);

			setMessageSigned(true);
		}
	}

	let label: React.ReactNode = "Connect Wallet";
	if (selectedChain === "evm" && address) {
		label = (
			<div className="flex items-center gap-2">
				<Image
					src="/eth.svg"
					height={4}
					width={4}
					alt="EVM"
					className="w-8 h-8"
				/>
				{address.slice(0, 6)}...{address.slice(-4)}
			</div>
		);
	} else if (selectedChain === "solana" && publicKey) {
		const pk = publicKey.toBase58();
		label = (
			<div className="flex items-center gap-2">
				<Image
					src="/solana.svg"
					height={10}
					width={10}
					alt="Solana"
					className="w-8 h-8"
				/>
				{pk.slice(0, 6)}...{pk.slice(-4)}
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<Button variant="outline" onClick={() => setOpen(true)}>
				{label}
			</Button>

			{selectedChain && (
				<>
					<Button variant="default" onClick={handleSign}>
						<Signature />
						<span className="text-xs">Sign Message</span>
					</Button>
					<Button variant="destructive" onClick={handleDisconnect}>
						Disconnect
					</Button>
				</>
			)}

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Choose Wallet Type</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						<Button
							variant="outline"
							onClick={() => {
								handleDisconnect();
								openConnectModal?.();
								setOpen(false);
							}}
						>
							EVM Wallet
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								handleDisconnect();
								openSolanaModal(true);
								setOpen(false);
							}}
						>
							Solana Wallet
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
