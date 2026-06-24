import type { Metadata } from "next";
import Tetris from "@/components/Tetris/Tetris";

export const metadata: Metadata = {
	title: "Tetris",
};

export default function TetrisPage() {
	return (
		<div className="flex flex-col items-center justify-center mt-6">
			<Tetris />
		</div>
	);
}
