import { useWallet } from "@solana/wallet-adapter-react";
import { useDisconnect } from "wagmi";

export function useDisconnectWallets() {
	const { disconnect: disconnectEvm } = useDisconnect();
	const { disconnect: disconnectSol } = useWallet();

	const disconnectWallets = () => {
		disconnectEvm();
		disconnectSol();
	};

	return { disconnectWallets };
}
