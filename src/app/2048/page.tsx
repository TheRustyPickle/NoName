import type { Metadata } from "next";
import Two048 from "@/components/Two048";

export const metadata: Metadata = {
	title: "2048",
};

export default function Two048Page() {
	return (
		<div className="flex flex-col items-center justify-center mt-6">
			<Two048 />
		</div>
	);
}
