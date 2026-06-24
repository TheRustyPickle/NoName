import { Edit } from "lucide-react";
import { useState } from "react";
import {
	createUpdateUsername,
	type UserDetails,
} from "@/core/websocket/models";
import ws from "@/core/websocket/ws";
import { nameToUse } from "@/lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface UsernameProps {
	user: UserDetails;
}

const MAX_USERNAME_LENGTH = 18;

export default function Username({ user }: UsernameProps) {
	const [isEditingName, setIsEditingName] = useState(false);
	const [newName, setNewName] = useState(user?.username || "");

	const handleSaveUsername = () => {
		const trimmed = newName.trim();

		if (!trimmed) return;
		if (trimmed.length > MAX_USERNAME_LENGTH) return;

		ws.sendMessage(createUpdateUsername(trimmed));
		setIsEditingName(false);
		user.username = trimmed;
	};

	return (
		<div className="flex items-center gap-2">
			{isEditingName ? (
				<>
					<Input
						value={newName}
						onChange={(e) => {
							if (e.target.value.length <= MAX_USERNAME_LENGTH)
								setNewName(e.target.value);
						}}
						placeholder={`Enter username (${MAX_USERNAME_LENGTH} Characters Max)`}
						className={`h-9 text-sm`}
					/>
					<Button
						size="sm"
						className="h-9"
						disabled={!newName.trim()}
						onClick={handleSaveUsername}
					>
						Save
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-9"
						onClick={() => {
							setIsEditingName(false);
							setNewName(user.username || "");
						}}
					>
						Cancel
					</Button>
				</>
			) : (
				<>
					<h2 className={`text-xl font-bold`}>{nameToUse(user)}</h2>
					<Button
						size="icon"
						variant="ghost"
						onClick={() => setIsEditingName(true)}
						className="h-6 w-6 p-0"
					>
						<Edit className={`w-4 h-4 text-gray-500`} />
					</Button>
				</>
			)}
		</div>
	);
}
