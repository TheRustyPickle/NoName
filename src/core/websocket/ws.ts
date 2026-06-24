import type {
	ErrorResponse,
	FlappyData,
	GameSession,
	SnakeData,
	SocialLinks,
	Task,
	TetrisData,
	Two048Data,
	UserDetails,
	WsRequest,
	WsResponse,
} from "./models";
import { Status } from "./models";

// Define handler types to match the actual Response structure
type ConnectionStartedHandler = (data: string | null) => void;
type UpdatedPointsHandler = (points: number) => void;
type UserDetailsHandler = (details: UserDetails) => void;
type ErrorHandler = (error: ErrorResponse) => void;
type LeaderboardHandler = (data: UserDetails[]) => void;
type NewTetrisHandler = (data: TetrisData) => void;
type NewSnakeHandler = (data: SnakeData) => void;
type NewTwo048Handler = (data: Two048Data) => void;
type NewFlappyHandler = (data: FlappyData) => void;
type MeHandlers = (data: UserDetails) => void;
type GameSessionsHandler = (data: GameSession[]) => void;
type SocialLinksHandler = (data: SocialLinks) => void;
type TaskHandler = (data: Task[]) => void;
type TaskCompletedHandler = (data: string) => void;

type InvalidSignHandler = () => void;
type InvalidJWTHandler = () => void;
type TelegramErrorHandler = (data: string) => void;
type TaskNotCompletedHandler = (data: string) => void;
type BadReferralCodeHandler = () => void;
type BindFailedHandler = (data: string) => void;

export class WebSocketService {
	private socket: WebSocket | null = null;

	private connectionStartedHandlers: ConnectionStartedHandler[] = [];
	private updatedPointsHandlers: UpdatedPointsHandler[] = [];
	private userDetailsHandler: UserDetailsHandler[] = [];
	private leaderboardHandlers: LeaderboardHandler[] = [];
	private newTetrisHandlers: NewTetrisHandler[] = [];
	private newSnakeHandlers: NewSnakeHandler[] = [];
	private newTwo048Handlers: NewTwo048Handler[] = [];
	private newFlappyHandlers: NewFlappyHandler[] = [];
	private meHandlers: MeHandlers[] = [];
	private gameSessionsHandlers: GameSessionsHandler[] = [];
	private socialLinksHandlers: SocialLinksHandler[] = [];
	private taskHandlers: TaskHandler[] = [];
	private taskCompletedHandlers: TaskCompletedHandler[] = [];

	private invalidSignHandlers: InvalidSignHandler[] = [];
	private invalidJWTHandlers: InvalidJWTHandler[] = [];
	private telegramErrorHandlers: TelegramErrorHandler[] = [];
	private taskNotCompletedHandlers: TaskNotCompletedHandler[] = [];
	private errorHandlers: ErrorHandler[] = [];
	private badReferralCodeHandlers: BadReferralCodeHandler[] = [];
	private bindFailedHandlers: BindFailedHandler[] = [];

	private onConnectionChangeCallback?: (isOpen: boolean) => void;

	private url =
		process.env.NEXT_PUBLIC_WS_URL || "wss://tbd-backend-vfyc.shuttle.app/";

	connect() {
		if (this.socket) return;

		this.socket = new WebSocket(this.url);

		this.socket.onopen = () => {
			if (this.onConnectionChangeCallback) {
				this.onConnectionChangeCallback(true);
			}
		};

		this.socket.onclose = () => {
			this.socket = null;
			if (this.onConnectionChangeCallback) {
				this.onConnectionChangeCallback(false);
			}
		};

		this.socket.onmessage = (event) => {
			try {
				const data: WsResponse = JSON.parse(event.data);
				this.handleMessage(data);
			} catch (error) {
				console.error("Failed to parse WebSocket message:", error);
			}
		};
	}

	subscribeToConnectionStarted(handler: ConnectionStartedHandler) {
		this.connectionStartedHandlers.push(handler);
		return () => this.unsubscribeFromConnectionStarted(handler);
	}

	unsubscribeFromConnectionStarted(handler: ConnectionStartedHandler) {
		this.connectionStartedHandlers = this.connectionStartedHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeToUpdatedPoints(handler: UpdatedPointsHandler) {
		this.updatedPointsHandlers.push(handler);
		return () => this.unsubscribeFromUpdatedPoints(handler);
	}

	unsubscribeFromUpdatedPoints(handler: UpdatedPointsHandler) {
		this.updatedPointsHandlers = this.updatedPointsHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeToMe(handler: MeHandlers) {
		this.meHandlers.push(handler);
		return () => this.unsubscribeFromMe(handler);
	}

	unsubscribeFromMe(handler: MeHandlers) {
		this.meHandlers = this.meHandlers.filter((h) => h !== handler);
	}

	subscribeToUserDetails(handler: UserDetailsHandler) {
		this.userDetailsHandler.push(handler);
		return () => this.unsubscribeFromUserDetails(handler);
	}

	unsubscribeFromUserDetails(handler: UserDetailsHandler) {
		this.userDetailsHandler = this.userDetailsHandler.filter(
			(h) => h !== handler,
		);
	}

	subscribeToGameSessions(handler: GameSessionsHandler) {
		this.gameSessionsHandlers.push(handler);
		return () => this.unsubscribeFromGameSessions(handler);
	}

	unsubscribeFromGameSessions(handler: GameSessionsHandler) {
		this.gameSessionsHandlers = this.gameSessionsHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeToLeaderboard(handler: LeaderboardHandler) {
		this.leaderboardHandlers.push(handler);
		return () => this.unsubscribeFromLeaderboard(handler);
	}

	unsubscribeFromLeaderboard(handler: LeaderboardHandler) {
		this.leaderboardHandlers = this.leaderboardHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeToNewTetris(handler: NewTetrisHandler) {
		this.newTetrisHandlers.push(handler);
		return () => this.unsubscribeFromNewTetris(handler);
	}

	unsubscribeFromNewTetris(handler: NewTetrisHandler) {
		this.newTetrisHandlers = this.newTetrisHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeToNewSnake(handler: NewSnakeHandler) {
		this.newSnakeHandlers.push(handler);
		return () => this.unsubscribeFromNewSnake(handler);
	}

	unsubscribeFromNewSnake(handler: NewSnakeHandler) {
		this.newSnakeHandlers = this.newSnakeHandlers.filter((h) => h !== handler);
	}

	subscribeToNewTwo048(handler: NewTwo048Handler) {
		this.newTwo048Handlers.push(handler);
		return () => this.unsubscribeFromNewTwo048(handler);
	}

	unsubscribeFromNewTwo048(handler: NewTwo048Handler) {
		this.newTwo048Handlers = this.newTwo048Handlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeToFlappy(handler: NewFlappyHandler) {
		this.newFlappyHandlers.push(handler);
		return () => this.unsubscribeFromNewFlappy(handler);
	}

	unsubscribeFromNewFlappy(handler: NewFlappyHandler) {
		this.newFlappyHandlers = this.newFlappyHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeToSocialLinks(handler: SocialLinksHandler) {
		this.socialLinksHandlers.push(handler);
		return () => this.unsubscribeFromSocialLinks(handler);
	}

	unsubscribeFromSocialLinks(handler: SocialLinksHandler) {
		this.socialLinksHandlers = this.socialLinksHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeToTasks(handler: TaskHandler) {
		this.taskHandlers.push(handler);
		return () => this.unsubscribeFromTasks(handler);
	}

	unsubscribeFromTasks(handler: TaskHandler) {
		this.taskHandlers = this.taskHandlers.filter((h) => h !== handler);
	}

	subscribeToTaskCompleted(handler: TaskCompletedHandler) {
		this.taskCompletedHandlers.push(handler);
		return () => this.unsubscribeFromTaskCompleted(handler);
	}

	unsubscribeFromTaskCompleted(handler: TaskCompletedHandler) {
		this.taskCompletedHandlers = this.taskCompletedHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeInvalidSign(handler: InvalidSignHandler) {
		this.invalidSignHandlers.push(handler);
		return () => this.unsubscribeInvalidSign(handler);
	}

	unsubscribeInvalidSign(handler: InvalidSignHandler) {
		this.invalidSignHandlers = this.invalidSignHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeInvalidJWT(handler: InvalidJWTHandler) {
		this.invalidJWTHandlers.push(handler);
		return () => this.unsubscribeInvalidJWT(handler);
	}

	unsubscribeInvalidJWT(handler: InvalidJWTHandler) {
		this.invalidJWTHandlers = this.invalidJWTHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeTelegramError(handler: TelegramErrorHandler) {
		this.telegramErrorHandlers.push(handler);
		return () => this.unsubscribeTelegramError(handler);
	}

	unsubscribeTelegramError(handler: TelegramErrorHandler) {
		this.telegramErrorHandlers = this.telegramErrorHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeTaskNotCompleted(handler: TaskNotCompletedHandler) {
		this.taskNotCompletedHandlers.push(handler);
		return () => this.unsubscribeTaskNotCompleted(handler);
	}

	unsubscribeTaskNotCompleted(handler: TaskNotCompletedHandler) {
		this.taskCompletedHandlers = this.taskCompletedHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeBadReferralCode(handler: BadReferralCodeHandler) {
		this.badReferralCodeHandlers.push(handler);
		return () => this.unsubscribeBadReferralCode(handler);
	}

	unsubscribeBadReferralCode(handler: BadReferralCodeHandler) {
		this.badReferralCodeHandlers = this.badReferralCodeHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeBindFailed(handler: BindFailedHandler) {
		this.bindFailedHandlers.push(handler);
		return () => this.unsubscribeBindFailed(handler);
	}

	unsubscribeBindFailed(handler: BindFailedHandler) {
		this.bindFailedHandlers = this.bindFailedHandlers.filter(
			(h) => h !== handler,
		);
	}

	subscribeToErrors(handler: ErrorHandler) {
		this.errorHandlers.push(handler);
		return () => this.unsubscribeFromErrors(handler);
	}

	unsubscribeFromErrors(handler: ErrorHandler) {
		this.errorHandlers = this.errorHandlers.filter((h) => h !== handler);
	}

	sendMessage(message: WsRequest) {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify(message));
		}
	}

	closeConnection() {
		this.socket?.close();
		this.socket = null;
	}

	private handleMessage(wsResponse: WsResponse) {
		if (wsResponse.status === Status.Success && wsResponse.response) {
			switch (wsResponse.response.type) {
				case "ConnectionStarted":
					for (const handler of this.connectionStartedHandlers) {
						handler(wsResponse.response.data);
					}
					break;

				case "UpdatedPoints":
					for (const handler of this.updatedPointsHandlers) {
						handler(wsResponse.response.data.points);
					}
					break;

				case "Me":
					for (const handler of this.meHandlers) {
						handler(wsResponse.response.data);
					}
					break;

				case "GameSessions":
					for (const handler of this.gameSessionsHandlers) {
						handler(wsResponse.response.data);
					}
					break;

				case "Leaderboard":
					for (const handler of this.leaderboardHandlers) {
						handler(wsResponse.response.data);
					}
					break;

				case "NewTetris":
					for (const handler of this.newTetrisHandlers) {
						handler(wsResponse.response.data);
					}
					break;

				case "NewSnake":
					for (const handler of this.newSnakeHandlers) {
						handler(wsResponse.response.data);
					}
					break;

				case "NewTwo048":
					for (const handler of this.newTwo048Handlers) {
						handler(wsResponse.response.data);
					}
					break;

				case "NewFlappy":
					for (const handler of this.newFlappyHandlers) {
						handler(wsResponse.response.data);
					}
					break;

				case "SocialLinks":
					for (const handler of this.socialLinksHandlers) {
						handler(wsResponse.response.data);
					}
					break;

				case "Tasks":
					for (const handler of this.taskHandlers) {
						handler(wsResponse.response.data);
					}
					break;

				case "TaskCompleted":
					for (const handler of this.taskCompletedHandlers) {
						handler(wsResponse.response.data);
					}
					break;

				default:
					console.warn("Unhandled response type:", wsResponse.response);
					break;
			}
		} else if (wsResponse.status === Status.Error && wsResponse.error) {
			const error = wsResponse.error;

			switch (error.type) {
				case "InvalidSign":
					this.invalidSignHandlers.forEach((h) => {
						h();
					});
					break;
				case "InvalidJWT":
					this.invalidJWTHandlers.forEach((h) => {
						h();
					});
					break;

				case "TelegramError":
					for (const handler of this.telegramErrorHandlers) {
						handler(error.data);
					}
					break;
				case "TaskNotCompleted":
					for (const handler of this.taskNotCompletedHandlers) {
						handler(error.data);
					}
					break;

				case "BadReferralCode":
					for (const handler of this.badReferralCodeHandlers) {
						handler();
					}
					break;

				case "BindFailed":
					for (const handler of this.bindFailedHandlers) {
						handler(error.data);
					}
					break;

				default:
					console.warn("Unknown uncatched error:", error);
			}

			this.errorHandlers.forEach((h) => {
				h(error);
			});
		}
	}

	isOpen(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
	}

	onConnectionChange(callback: (isOpen: boolean) => void) {
		this.onConnectionChangeCallback = callback;
	}
}

const ws = new WebSocketService();
export default ws;

// In case we have normal string as response
// if (wsResponse.response === "ConnectionStarted") {
// 	this.connectionStartedHandlers.forEach((handler) => handler());
