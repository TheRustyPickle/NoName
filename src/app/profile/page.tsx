import type { Metadata } from "next";
import ProfileSection from "@/components/Profile/ProfileSection";

export const metadata: Metadata = {
	title: "Profile",
};

export default function SnakePage() {
	return (
		<div className="p-4">
			<ProfileSection />
		</div>
	);
}
