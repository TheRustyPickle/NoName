"use client";

import type * as anchor from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, type PublicKey } from "@solana/web3.js";
import { useEffect } from "react";

interface UseProgramReturn {
	publicKey: PublicKey | null;
	connected: boolean;
	connection: anchor.web3.Connection;
}

/**
 * A hook that provides access to the Solana program, counter address,
 * connected wallet, and connection.
 * This hook handles the basic setup for the program.
 */
export function useProgram(): UseProgramReturn {
	const { publicKey, connected } = useWallet();
	const { connection } = useConnection();

	// Fund connected wallet with devnet SOL
	useEffect(() => {
		const airdropDevnetSol = async () => {
			if (!publicKey) return;

			try {
				const balance = await connection.getBalance(publicKey);
				const solBalance = balance / LAMPORTS_PER_SOL;

				if (solBalance < 1) {
					await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);
				}
			} catch (error) {
				console.log(error);
			}
		};

		airdropDevnetSol();
	}, [publicKey, connection.requestAirdrop, connection.getBalance]);

	return {
		publicKey,
		connected,
		connection,
	};
}
