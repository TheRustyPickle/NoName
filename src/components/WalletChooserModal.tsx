"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export function WalletChooserModal({
	open,
	onClose,
	onSelect,
}: {
	open: boolean;
	onClose: () => void;
	onSelect: (type: "solana" | "evm") => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Choose Wallet Type</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3 py-2">
					<Button
						onClick={() => onSelect("solana")}
						className="bg-purple-600 hover:bg-purple-700"
					>
						Solana
					</Button>
					<Button
						onClick={() => onSelect("evm")}
						className="bg-blue-600 hover:bg-blue-700"
					>
						EVM
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
