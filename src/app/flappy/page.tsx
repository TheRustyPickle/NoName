import type { Metadata } from "next";
import Flappy from "@/components/Flappy";

export const metadata: Metadata = {
	title: "Flappy Bird",
};

export default function SnakePage() {
	return (
		<div className="flex flex-col items-center justify-center mt-6">
			<Flappy />
		</div>
	);
}
