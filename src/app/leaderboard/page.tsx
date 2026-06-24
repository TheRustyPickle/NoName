import type { Metadata } from "next";
import Leaderboard from "@/components/Leaderboard/Leaderboard";

export const metadata: Metadata = {
	title: "Leaderboard",
};

export default function LeaderboardPage() {
	return (
		<div className="flex flex-col items-center justify-center h-full w-full py-20">
			<div className="max-w-md mx-auto p-4 w-full">
				<Leaderboard />
			</div>
		</div>
	);
}
