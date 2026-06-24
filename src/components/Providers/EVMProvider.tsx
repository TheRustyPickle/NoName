"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { arbitrum, base, mainnet, optimism, polygon } from "wagmi/chains";

export function EVMProvider({ children }: { children: React.ReactNode }) {
	const config = getDefaultConfig({
		appName: "app",
		projectId: "app",
		chains: [mainnet, polygon, optimism, arbitrum, base],
		ssr: false,
	});
	const queryClient = new QueryClient();

	return (
		<WagmiProvider config={config}>
			<QueryClientProvider client={queryClient}>
				<RainbowKitProvider>{children}</RainbowKitProvider>
			</QueryClientProvider>
		</WagmiProvider>
	);
}
