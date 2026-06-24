import { type ClassValue, clsx } from "clsx";
import {
	differenceInSeconds,
	formatDistanceToNow,
	formatDuration,
	intervalToDuration,
} from "date-fns";
import { twMerge } from "tailwind-merge";
import type { UserDetails } from "@/core/websocket/models";

const STORAGE_KEY = "jwt";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function nameToUse(user: UserDetails): string {
	if (user.username) {
		return user.username;
	}
	if (user.sol_wallet) {
		const first = user.sol_wallet.slice(0, 5);
		const last = user.sol_wallet.slice(-5);
		return `${first}...${last}`;
	}

	if (user.evm_wallet) {
		const first = user.evm_wallet.slice(0, 5);
		const last = user.evm_wallet.slice(-5);
		return `${first}...${last}`;
	}
	return "user";
}

export function getFormattedTime(time: string): string {
	return formatDistanceToNow(new Date(time), {
		addSuffix: true,
	});
}

export function saveToken(token: string) {
	if (typeof window !== "undefined") {
		localStorage.setItem(STORAGE_KEY, token);
	}
}

export function getToken(): string | null {
	if (typeof window !== "undefined") {
		return localStorage.getItem(STORAGE_KEY);
	}
	return null;
}

export function deleteToken() {
	if (typeof window !== "undefined") {
		localStorage.removeItem(STORAGE_KEY);
	}
}

export function getPlayDuration(start: string, end: string) {
	const diffSeconds = differenceInSeconds(new Date(end), new Date(start));
	const duration = intervalToDuration({ start: 0, end: diffSeconds * 1000 });

	let output = formatDuration(duration, { format: ["minutes", "seconds"] });

	if (!output) {
		output = "0 seconds";
	}

	return output;
}
