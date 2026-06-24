import type { Metadata } from "next";
import type { PropsWithChildren } from "react";
import "./globals.css";
import { EVMProvider } from "@/components/Providers/EVMProvider";
import { SolanaProvider } from "@/components/Providers/SolanaProvider";
import { WsWrapper } from "@/components/WsWrapper";

export const metadata: Metadata = {
	title: {
		template: "%s",
		default: "",
	},
	description: " Work In Progress",
};

export default async function RootLayout({ children }: PropsWithChildren) {
	return (
		<html lang="en">
			<head>
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no"
				/>
			</head>
			<body>
				<SolanaProvider>
					<EVMProvider>
						<WsWrapper>{children}</WsWrapper>
					</EVMProvider>
				</SolanaProvider>
			</body>
		</html>
	);
}
