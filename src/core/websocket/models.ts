export type TetrisData = {
	timestamp: string;
	prev_timestamp: string;
	points: number;
	prev_points: number;
	lines: number;
	prev_lines: number;
	level: number;
	prev_level: number;
};

export type SnakeData = {
	timestamp: string;
	prev_timestamp: string;
	points: number;
	prev_points: number;
	length: number;
	prev_length: number;
	level: number;
	prev_level: number;
};

export type Two048Data = {
	timestamp: string;
	prev_timestamp: string;
	board: number[][];
	prev_board: number[][];
	direction: string;
	points: number;
	prev_points: number;
	highest_number: number;
	prev_highest_number: number;
};

export type FlappyData = {
	timestamp: string;
	prev_timestamp: string;
	points: number;
	prev_points: number;
	pipes: number;
	prev_pipes: number;
};

type AuthSigned = {
	type: "Auth";
	data: {
		public_key: string;
		signature: string;
		chain: Chains;
	};
};

type AuthWithToken = {
	type: "Auth";
	data: {
		token: string;
	};
};

export type TelegramUser = {
	id: number;
	first_name: string;
	last_name?: string;
	username?: string;
	photo_url?: string;
	auth_date: number;
	hash: string;
};

export type TaskCheck = {
	task_id: string;
	proof: string | null;
};

export type Chains = "Solana" | "Evm";

export type BindData = {
	chain: Chains;
	address: string;
	signature: string;
};

export type WsRequest =
	| AuthSigned
	| AuthWithToken
	| { type: "InitialPoints" }
	| { type: "Me" }
	| { type: "MeWithRankSocials" }
	| { type: "GetActivity" }
	| { type: "LeaderboardIn" }
	| { type: "LeaderboardOut" }
	| { type: "Tetris"; data: TetrisData }
	| { type: "Snake"; data: SnakeData }
	| { type: "Two048"; data: Two048Data }
	| { type: "Flappy"; data: FlappyData }
	| { type: "SnakeEnd" }
	| { type: "TetrisEnd" }
	| { type: "Two048End" }
	| { type: "FlappyEnd" }
	| { type: "UsernameUpdate"; data: string }
	| { type: "SocialLinks" }
	| { type: "Telegram"; data: TelegramUser }
	| { type: "Tasks" }
	| { type: "CheckTask"; data: TaskCheck }
	| { type: "CheckReferral"; data: string }
	| { type: "BindWallet"; data: BindData };

export function createAuthMessage(
	public_key: string,
	signature: string,
	chain: Chains,
): WsRequest {
	return { type: "Auth", data: { public_key, signature, chain } };
}

export function createAuthMessageToken(token: string): WsRequest {
	return { type: "Auth", data: { token } };
}

export function createInitialPoints(): WsRequest {
	return { type: "InitialPoints" };
}

export function createLeaderboardIn(): WsRequest {
	return { type: "LeaderboardIn" };
}

export function createLeaderboardOut(): WsRequest {
	return { type: "LeaderboardOut" };
}

export function createTetrisMessage(data: TetrisData): WsRequest {
	return { type: "Tetris", data };
}

export function createTetrisEndMessage(): WsRequest {
	return { type: "TetrisEnd" };
}

export function createSnakeMessage(data: SnakeData): WsRequest {
	return { type: "Snake", data };
}

export function createSnakeEndMessage(): WsRequest {
	return { type: "SnakeEnd" };
}

export function createTwo048Message(data: Two048Data): WsRequest {
	return { type: "Two048", data };
}

export function createTwo048EndMessage(): WsRequest {
	return { type: "Two048End" };
}

export function createFlappyMessage(data: FlappyData): WsRequest {
	return { type: "Flappy", data };
}

export function createFlappyEndMessage(): WsRequest {
	return { type: "FlappyEnd" };
}

export function createMe(): WsRequest {
	return { type: "Me" };
}

export function createMeWithRankSocials(): WsRequest {
	return { type: "MeWithRankSocials" };
}

export function createGetActivity(): WsRequest {
	return { type: "GetActivity" };
}

export function createUpdateUsername(username: string): WsRequest {
	return { type: "UsernameUpdate", data: username };
}

export function createSocialLinks(): WsRequest {
	return { type: "SocialLinks" };
}

export function createTelegram(data: TelegramUser): WsRequest {
	return { type: "Telegram", data };
}

export function createTasks(): WsRequest {
	return { type: "Tasks" };
}

export function createCheckReferral(data: string): WsRequest {
	return { type: "CheckReferral", data };
}

export function createCheckTask(
	task_id: string,
	proof: string | null,
): WsRequest {
	const taskCheck: TaskCheck = { task_id, proof };
	return { type: "CheckTask", data: taskCheck };
}

export function createBindWallet(data: BindData): WsRequest {
	return { type: "BindWallet", data };
}

export type UserDetails = {
	joined_at: string;
	user_id: string;
	username: string | null;
	sol_wallet: string | null;
	evm_wallet: string | null;
	photo_url: string;
	points: number;
	rank: number | null;
	twitter: string | null;
	discord: string | null;
	telegram: string | null;
	referral_code: string | null;
};

export type GameType = "Flappy" | "Snake" | "Tetris" | "Two048";

export type GameSession = {
	game_type: GameType;
	start_time: string;
	end_time: string;
	final_score: number;
};

export type SocialLinks = {
	twitter: string | null;
	discord: string | null;
	telegram: string | null;
};

export type TaskType =
	| "JoinDiscord"
	| "JoinTelegram"
	| "FollowTwitter"
	| "CreateTweet"
	| "LikeTweet"
	| "RetweetPost"
	| "CheckDiscordPost"
	| "CheckTelegramPost";

export type Platform = "Discord" | "Telegram" | "Twitter";

export type Task = {
	id: string;
	task_type: TaskType;
	created_at: string;
	ends_at: string | null;
	title: string;
	description: string;
	redirect_url: string | null;
	platform: Platform | null;
	reward_point: number;
	completed: boolean;
	proof_required: boolean;
};

export type Response =
	| { type: "UpdatedPoints"; data: { points: number } }
	| { type: "Me"; data: UserDetails }
	| { type: "GameSessions"; data: GameSession[] }
	| { type: "Leaderboard"; data: UserDetails[] }
	| { type: "NewTetris"; data: TetrisData }
	| { type: "NewSnake"; data: SnakeData }
	| { type: "NewTwo048"; data: Two048Data }
	| { type: "NewFlappy"; data: FlappyData }
	| { type: "ConnectionStarted"; data: string | null }
	| { type: "SocialLinks"; data: SocialLinks }
	| { type: "Tasks"; data: Task[] }
	| { type: "TaskCompleted"; data: string };

export type ErrorResponse =
	| { type: "InvalidSign"; data: null }
	| { type: "InternalError"; data: null }
	| { type: "NotLoggedIn"; data: null }
	| { type: "InvalidJWT"; data: null }
	| { type: "TelegramError"; data: string }
	| { type: "TaskNotCompleted"; data: string }
	| { type: "BadReferralCode"; data: null }
	| { type: "BindFailed"; data: string };

export interface WsResponse {
	status: Status;
	response?: Response;
	error?: ErrorResponse;
}

export enum Status {
	Success = "Success",
	Error = "Error",
}
