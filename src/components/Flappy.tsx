"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	createFlappyEndMessage,
	createFlappyMessage,
	createInitialPoints,
	type FlappyData,
} from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import { noZoom } from "@/hooks/noZoom";
import { Button } from "./ui/button";

const GRAVITY = 0.5;
const JUMP_STRENGTH = 9.0;
const PIPE_WIDTH = 52;
const PIPE_GAP = 150;
const PIPE_SPEED = 2;
const BIRD_WIDTH = 34;
const BIRD_HEIGHT = 24;

const NativeImage = window.Image;

interface Bird {
	y: number;
	velocity: number;
	frame: number;
}

interface Pipe {
	x: number;
	topHeight: number;
}

const ScoreBar = ({
	mainPoints,
	score,
	pipeNum,
}: {
	mainPoints: number;
	score: number;
	pipeNum: number;
}) => {
	return (
		<motion.div
			initial={{ y: -50, opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
			className="mb-2 flex w-full items-center justify-between gap-2"
		>
			{/* Left: Back Button */}
			<div className="flex-shrink-0">
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						redirect("/games");
					}}
					className="flex items-center h-12 rounded-lg text-blue-500 border-blue-500 hover:bg-blue-400 duration-200 transition-colors"
				>
					<ArrowLeft />
					Back
				</Button>
			</div>

			{/* Right: Blue Score & Pipes container */}
			<div className="flex flex-1 justify-between rounded-lg h-12 bg-blue-500 p-3 text-white shadow-md">
				{/* Score */}
				<div className="font-bold flex items-center">
					<div className="mr-1">Score:</div>
					<div className="relative h-6 overflow-hidden flex items-center">
						<AnimatePresence mode="popLayout" initial={false}>
							<motion.div
								key={mainPoints + score}
								initial={{ y: "100%" }}
								animate={{ y: "0%" }}
								exit={{ y: "-100%" }}
								transition={{ duration: 0.3, ease: "easeOut" }}
								className="w-full h-full flex items-center justify-start"
							>
								{mainPoints + score}
							</motion.div>
						</AnimatePresence>
					</div>
				</div>

				{/* Pipes */}
				<div className="font-bold flex items-center">
					<div className="mr-1">Pipes:</div>
					<div className="relative h-6 overflow-hidden flex items-center">
						<AnimatePresence mode="popLayout" initial={false}>
							<motion.div
								key={pipeNum}
								initial={{ y: "100%" }}
								animate={{ y: "0%" }}
								exit={{ y: "-100%" }}
								transition={{ duration: 0.3, ease: "easeOut" }}
								className="w-full h-full flex items-center justify-start"
							>
								{pipeNum}
							</motion.div>
						</AnimatePresence>
					</div>
				</div>
			</div>
		</motion.div>
	);
};

const GameOverOverlay = ({
	onRestart,
	score,
}: {
	onRestart: () => void;
	score: number;
}) => {
	return (
		<AnimatePresence>
			<motion.div
				initial={{ opacity: 0, scale: 0.8 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.8 }}
				transition={{ duration: 0.3, ease: "easeOut" }}
				className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-lg"
				style={{ width: 290, height: 515 }}
			>
				<Image
					width={192}
					height={42}
					src="/gameover.png"
					alt="Game Over"
					className="mb-4 h-auto w-48"
				/>
				<motion.p
					initial={{ y: 20, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					transition={{ delay: 0.2, duration: 0.4, ease: "easeOut" }}
					className="mb-6 text-2xl font-bold text-white"
				>
					Final Score: {score}
				</motion.p>
				<motion.button
					onClick={onRestart}
					initial={{ scale: 0.8, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					transition={{ duration: 0.3, ease: "easeOut" }}
					whileHover={{
						scale: 1.1,
						backgroundColor: "#4ade80" /* green-400 */,
					}}
					whileTap={{ scale: 0.95 }}
					className="rounded-lg bg-green-500 px-6 py-3 text-xl font-semibold text-white shadow-lg focus:outline-none"
				>
					Restart
				</motion.button>
			</motion.div>
		</AnimatePresence>
	);
};

const scoreForPipe = (pipeNum: number) => {
	if (pipeNum <= 20) {
		return Math.floor(4 * pipeNum ** 1.2);
	}

	const base = Math.floor(4 * 20 ** 1.2);

	if (pipeNum <= 40) {
		const extra = Math.floor((pipeNum - 20) * 75);
		return base + extra;
	}

	const softBonus = 20 * 75;
	return base + softBonus;
};

export default function FlappyBird() {
	noZoom();

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [bird, setBird] = useState<Bird>({ y: 200, velocity: 0, frame: 0 });
	const [pipes, setPipes] = useState<Pipe[]>([]);
	const [score, setScore] = useState(0);
	const [pipeNum, setPipeNum] = useState(0);
	const [gameOver, setGameOver] = useState(false);
	const [gameStarted, setGameStarted] = useState(false);

	const [noSend, setNoSend] = useState(false);
	const [mainPoints, setMainPoints] = useState(0);

	const [flappyData, setFlappyData] = useState<FlappyData | null>(null);

	const birdSprites = useRef<HTMLImageElement[]>([]);
	const backgroundImage = useRef<HTMLImageElement | null>(null);
	const numberSprites = useRef<HTMLImageElement[]>([]);
	const gameOverImage = useRef<HTMLImageElement | null>(null);
	const messageImage = useRef<HTMLImageElement | null>(null);
	const pipeImage = useRef<HTMLImageElement | null>(null);
	const [assetsLoaded, setAssetsLoaded] = useState(false);

	// Audio refs
	const pointSound = useRef<HTMLAudioElement | null>(null);
	const hitSound = useRef<HTMLAudioElement | null>(null);
	const wingSound = useRef<HTMLAudioElement | null>(null);

	useEffect(() => {
		ws.sendMessage(createInitialPoints());
	}, []);

	useEffect(() => {
		const unsubNewFlappy = ws.subscribeToFlappy((data) => {
			setScore(data.points);
			setPipeNum(data.pipes);
			setFlappyData(data);

			setNoSend(true);
		});

		const unsubInitialPoint = ws.subscribeToUpdatedPoints((initial_point) => {
			setMainPoints(initial_point);
		});

		return () => {
			unsubNewFlappy();
			unsubInitialPoint();
		};
	}, []);

	useEffect(() => {
		if (pipeNum === 0 || score === 0) return;

		setFlappyData((prevData) => {
			const timeNow = new Date().toISOString();

			const newData: FlappyData = {
				timestamp: timeNow,
				prev_timestamp: prevData?.timestamp ?? timeNow,
				points: score,
				prev_points: prevData?.points ?? 0,
				pipes: pipeNum,
				prev_pipes: prevData?.pipes ?? 0,
			};

			if (
				prevData &&
				prevData.points === newData.points &&
				prevData.pipes === newData.pipes
			) {
				return prevData;
			}

			setNoSend(false);

			return newData;
		});
	}, [pipeNum, score]);

	useEffect(() => {
		if (!flappyData || noSend) return;

		ws.sendMessage(createFlappyMessage(flappyData));
	}, [flappyData, noSend]);

	useEffect(() => {
		const birdUrls = ["/bird.png", "/bird_2.png", "/bird_3.png"];
		const numberUrls = [
			"/0.png",
			"/1.png",
			"/2.png",
			"/3.png",
			"/4.png",
			"/5.png",
			"/6.png",
			"/7.png",
			"/8.png",
			"/9.png",
		];
		const backgroundUrl = "/background.png";
		const gameOverUrl = "/gameover.png";
		const messageUrl = "/message.png";
		const pipeUrl = "/pipe.png";

		const loadImage = (url: string) =>
			new Promise<HTMLImageElement>((resolve, reject) => {
				const img = new NativeImage();
				img.onload = () => resolve(img);
				img.onerror = reject;
				img.src = url;
			});

		const loadAudio = (url: string) =>
			new Promise<HTMLAudioElement>((resolve, reject) => {
				const audio = new Audio(url);
				audio.oncanplaythrough = () => resolve(audio);
				audio.onerror = reject;
				audio.src = url;
			});

		Promise.all([
			...birdUrls.map(loadImage),
			...numberUrls.map(loadImage),
			loadImage(backgroundUrl),
			loadImage(gameOverUrl),
			loadImage(messageUrl),
			loadImage(pipeUrl),
			loadAudio("/point.wav"),
			loadAudio("/hit.wav"),
			loadAudio("/wing.wav"),
		]).then((loadedAssets) => {
			birdSprites.current = loadedAssets.slice(0, 3) as HTMLImageElement[];
			numberSprites.current = loadedAssets.slice(3, 13) as HTMLImageElement[];
			backgroundImage.current = loadedAssets[13] as HTMLImageElement;
			gameOverImage.current = loadedAssets[14] as HTMLImageElement;
			messageImage.current = loadedAssets[15] as HTMLImageElement;
			pipeImage.current = loadedAssets[16] as HTMLImageElement;
			pointSound.current = loadedAssets[17] as HTMLAudioElement;
			hitSound.current = loadedAssets[18] as HTMLAudioElement;
			wingSound.current = loadedAssets[19] as HTMLAudioElement;
			setAssetsLoaded(true);
		});
	}, []);

	const playSound = useCallback(
		(sound: HTMLAudioElement | null) => {
			if (sound && !gameOver) {
				sound.currentTime = 0;
				sound
					.play()
					.catch((error) => console.error("Error playing sound:", error));
			}
		},
		[gameOver],
	);

	const jump = useCallback(() => {
		if (!gameOver && gameStarted) {
			setBird((prevBird) => ({ ...prevBird, velocity: -JUMP_STRENGTH }));
			playSound(wingSound.current);
		} else if (!gameStarted) {
			setGameStarted(true);
		}
	}, [gameOver, gameStarted, playSound]);

	const restartGame = useCallback(() => {
		ws.sendMessage(createFlappyEndMessage());
		ws.sendMessage(createInitialPoints());
		setBird({ y: 200, velocity: 0, frame: 0 });
		setPipes([]);
		setScore(0);
		setFlappyData(null);
		setPipeNum(0);
		setGameOver(false);
		setGameStarted(true);
	}, []);

	useEffect(() => {
		let justTouched = false;

		const handleKeyPress = (e: KeyboardEvent) => {
			if (e.code === "Space") {
				handleUserInput();
			}
		};

		const handleTouchStart = () => {
			justTouched = true;
			handleUserInput();
			setTimeout(() => {
				justTouched = false;
			}, 300);
		};

		const handleMouseDown = () => {
			if (justTouched) return;
			handleUserInput();
		};

		const handleUserInput = () => {
			if (!gameStarted) {
				setGameStarted(true);
			} else if (!gameOver) {
				jump();
			}
		};

		window.addEventListener("keydown", handleKeyPress);
		window.addEventListener("touchstart", handleTouchStart);
		window.addEventListener("mousedown", handleMouseDown);

		return () => {
			window.removeEventListener("keydown", handleKeyPress);
			window.removeEventListener("touchstart", handleTouchStart);
			window.removeEventListener("mousedown", handleMouseDown);
		};
	}, [jump, gameStarted, gameOver]);

	useEffect(() => {
		if (!assetsLoaded) return;

		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;

		const gameLoop = setInterval(() => {
			// Clear canvas
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			// Draw background
			if (backgroundImage.current) {
				ctx.drawImage(
					backgroundImage.current,
					0,
					0,
					canvas.width,
					canvas.height,
				);
			}

			if (!gameStarted) {
				// Draw message
				if (messageImage.current) {
					const messageWidth = 184;
					const messageHeight = 267;
					const messageX = (canvas.width - messageWidth) / 2;
					const messageY = (canvas.height - messageHeight) / 2;
					ctx.drawImage(
						messageImage.current,
						messageX,
						messageY,
						messageWidth,
						messageHeight,
					);
				}
				return;
			}

			// Update bird position and animation frame
			setBird((prevBird) => ({
				y: prevBird.y + prevBird.velocity,
				velocity: prevBird.velocity + GRAVITY,
				frame: (prevBird.frame + 1) % 3,
			}));

			// Move pipes
			setPipes((prevPipes) =>
				prevPipes.map((pipe) => ({ ...pipe, x: pipe.x - PIPE_SPEED })),
			);

			// Generate new pipes
			if (
				pipes.length === 0 ||
				pipes[pipes.length - 1].x < canvas.width - 200
			) {
				const topHeight = Math.random() * (canvas.height - PIPE_GAP - 100) + 50;
				setPipes((prevPipes) => [...prevPipes, { x: canvas.width, topHeight }]);
			}

			// Remove off-screen pipes
			setPipes((prevPipes) =>
				prevPipes.filter((pipe) => pipe.x + PIPE_WIDTH > 0),
			);

			// Check collisions
			const birdRect = {
				x: 50,
				y: bird.y,
				width: BIRD_WIDTH,
				height: BIRD_HEIGHT,
			};
			for (const pipe of pipes) {
				const topPipeRect = {
					x: pipe.x,
					y: 0,
					width: PIPE_WIDTH,
					height: pipe.topHeight,
				};
				const bottomPipeRect = {
					x: pipe.x,
					y: pipe.topHeight + PIPE_GAP,
					width: PIPE_WIDTH,
					height: canvas.height - pipe.topHeight - PIPE_GAP,
				};

				if (
					birdRect.x < topPipeRect.x + topPipeRect.width &&
					birdRect.x + birdRect.width > topPipeRect.x &&
					birdRect.y < topPipeRect.y + topPipeRect.height &&
					birdRect.y + birdRect.height > topPipeRect.y
				) {
					setGameOver(true);
					playSound(hitSound.current);
				}

				if (
					birdRect.x < bottomPipeRect.x + bottomPipeRect.width &&
					birdRect.x + birdRect.width > bottomPipeRect.x &&
					birdRect.y < bottomPipeRect.y + bottomPipeRect.height &&
					birdRect.y + birdRect.height > bottomPipeRect.y
				) {
					setGameOver(true);
					playSound(hitSound.current);
				}
			}

			// Update score
			if (
				!gameOver &&
				pipes.some(
					(pipe) => pipe.x + PIPE_WIDTH < 50 && pipe.x + PIPE_WIDTH >= 48,
				)
			) {
				const scoreIncrease = scoreForPipe(pipeNum + 1);
				setScore((prevScore) => prevScore + scoreIncrease);
				setPipeNum((prev) => prev + 1);
				playSound(pointSound.current);
			}

			// Draw pipes
			for (const pipe of pipes) {
				if (pipeImage.current) {
					// Draw top pipe (flipped vertically)
					ctx.save();
					ctx.scale(1, -1);
					ctx.drawImage(
						pipeImage.current,
						pipe.x,
						-pipe.topHeight,
						PIPE_WIDTH,
						320,
					);
					ctx.restore();

					// Draw bottom pipe
					ctx.drawImage(
						pipeImage.current,
						pipe.x,
						pipe.topHeight + PIPE_GAP,
						PIPE_WIDTH,
						320,
					);
				}
			}

			// Draw bird
			ctx.save();
			ctx.translate(50 + BIRD_WIDTH / 2, bird.y + BIRD_HEIGHT / 2);
			ctx.rotate(
				Math.min(Math.PI / 4, Math.max(-Math.PI / 4, bird.velocity * 0.1)),
			);
			ctx.drawImage(
				birdSprites.current[bird.frame],
				-BIRD_WIDTH / 2,
				-BIRD_HEIGHT / 2,
				BIRD_WIDTH,
				BIRD_HEIGHT,
			);
			ctx.restore();

			// Draw score
			const scoreString = score.toString();
			const digitWidth = 24;
			const totalWidth = scoreString.length * digitWidth;
			const startX = (canvas.width - totalWidth) / 2;
			scoreString.split("").forEach((digit, index) => {
				const digitImage = numberSprites.current[Number.parseInt(digit)];
				if (digitImage) {
					ctx.drawImage(
						digitImage,
						startX + index * digitWidth,
						20,
						digitWidth,
						36,
					);
				}
			});

			if (bird.y > canvas.height || bird.y < 0) {
				setGameOver(true);
				playSound(hitSound.current);
			}
		}, 1000 / 60);

		return () => clearInterval(gameLoop);
	}, [
		bird,
		pipes,
		gameOver,
		score,
		gameStarted,
		assetsLoaded,
		playSound,
		pipeNum,
	]);

	return (
		<div className="flex flex-col items-center justify-center pt-5 font-sans">
			<ScoreBar mainPoints={mainPoints} score={score} pipeNum={pipeNum} />
			<div className="relative">
				{" "}
				<canvas
					ref={canvasRef}
					width={288}
					height={512}
					className="cursor-pointer rounded-lg border-2 border-gray-700 shadow-2xl"
				/>
				{gameOver && <GameOverOverlay onRestart={restartGame} score={score} />}
			</div>
			<div className="mt-4 w-full max-w-[288px] rounded-lg bg-gray-100 p-3 text-center text-sm text-gray-600 shadow">
				Press <strong>Space</strong> or <strong>Click/Tap</strong> to Flap!
			</div>
		</div>
	);
}
