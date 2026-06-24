"use client";

import { useEffect } from "react";

export function noZoom() {
	useEffect(() => {
		const metaViewport = document.querySelector("meta[name=viewport]");
		const originalContent = metaViewport?.getAttribute("content");
		if (metaViewport) {
			metaViewport.setAttribute(
				"content",
				"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no",
			);
		}
		return () => {
			if (metaViewport && originalContent) {
				metaViewport.setAttribute("content", originalContent);
			}
		};
	}, []);
}
