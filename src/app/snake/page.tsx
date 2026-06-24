import type { Metadata } from "next";
import Snake from "@/components/Snake";

export const metadata: Metadata = {
	title: "Snake",
};

export default function SnakePage() {
	return (
		<div className="flex flex-col items-center justify-center mt-6">
			<Snake />
		</div>
	);
}
