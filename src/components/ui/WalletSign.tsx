import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { Signature } from "lucide-react";
import { useCallback } from "react";
import { createAuthMessage } from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import { Button } from "./button";

interface SignButtonProps {
	messageSigned: boolean;
	setMessageSigned: (signed: boolean) => void;
}

export function SignButtonSolana({
	messageSigned,
	setMessageSigned,
}: SignButtonProps) {
	const { publicKey, signMessage } = useWallet();

	const handleSignMessage = useCallback(async () => {
		if (messageSigned) return;

		if (!publicKey || !signMessage) {
			alert("Wallet not connected or signMessage not supported");
			return;
		}

		try {
			const message = `Welcome to the app. Sign this message to continue. Signing with: ${publicKey.toBase58()}`;
			const encodedMessage = new TextEncoder().encode(message);
			const signature = await signMessage(encodedMessage);
			const bs58_sign = bs58.encode(signature);

			setMessageSigned(true);
			ws.sendMessage(
				createAuthMessage(publicKey.toBase58(), bs58_sign, "Solana"),
			);
		} catch (err) {
			console.error("Message signing failed:", err);
		}
	}, [messageSigned, publicKey, signMessage, setMessageSigned]);

	return (
		<Button
			variant="default"
			type="button"
			onClick={handleSignMessage}
			disabled={messageSigned}
			style={{
				width: "173.47px",
				height: "48px",
			}}
		>
			<Signature />
			<span className="text-xs">Sign Message</span>
		</Button>
	);
}
