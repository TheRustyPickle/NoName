import type { Metadata } from "next";
import GamesGrid from "@/components/Tetris/GamesGrid";

export const metadata: Metadata = {
	title: "Games",
};

export default function SnakePage() {
	return (
		<div className="p-4">
			<h1 className={`mb-4 text-2xl font-bold text-gray-800`}>Games</h1>
			<GamesGrid />
		</div>
	);
}
