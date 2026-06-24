import type { Metadata } from "next";
import Tasks from "@/components/Tasks";

export const metadata: Metadata = {
	title: "Tasks",
};

export default function TetrisPage() {
	return (
		<div className="flex flex-col items-center justify-center mt-6">
			<Tasks />
		</div>
	);
}
