import { useEffect } from "react";
import { createTelegram, type TelegramUser } from "@/core/websocket/models";
import ws from "@/core/websocket/ws";

declare global {
	interface Window {
		onTelegramAuth: (user: TelegramUser) => void;
	}
}

export default function TelegramLogin() {
	useEffect(() => {
		window.onTelegramAuth = (user: TelegramUser) => {
			ws.sendMessage(createTelegram(user));
		};

		const script = document.createElement("script");
		script.src = "https://telegram.org/js/telegram-widget.js?22";
		script.setAttribute("data-telegram-login", "tbd_16_bot");
		script.setAttribute("data-size", "large");
		script.setAttribute("data-userpic", "true");
		script.setAttribute(
			"data-onauth",
			"onTelegramAuth(user)", // This is called by the widget globally
		);
		script.setAttribute(
			"data-auth-url",
			"https://rustypickle.onrender.com/auth/telegram",
		);
		script.async = true;

		const container = document.getElementById("telegram-button-container");
		if (container) container.appendChild(script);
	}, []);

	return (
		<div className="flex flex-col items-center justify-center">
			<div id="telegram-button-container" />
		</div>
	);
}
