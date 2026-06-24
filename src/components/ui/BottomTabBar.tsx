import type { FC } from "react";
import { Button } from "./button";

type TabItem = {
	id: string;
	text: string;
	Icon: React.ComponentType<{ className?: string }>;
};

type BottomTabBarProps = {
	tabs: TabItem[];
	currentTab: string;
	handleTabClick: (id: string) => void;
};

const BottomTabBar: FC<BottomTabBarProps> = ({
	tabs,
	currentTab,
	handleTabClick,
}) => {
	return (
		<div className="fixed bottom-0 left-0 right-0 border-t border-gray-400 flex flex-col">
			<div className="grid grid-cols-5">
				{tabs.map(({ id, text, Icon }) => {
					const isSelected = currentTab === id;
					return (
						<Button
							variant="outline"
							type="button"
							key={id}
							onClick={() => handleTabClick(id)}
							className={`w-full flex flex-col rounded-none items-center justify-center py-6 transition-colors duration-200 ${
								isSelected
									? "bg-gray-200 hover:bg-gray-200"
									: "hover:bg-gray-100 text-muted-foreground"
							}`}
						>
							<Icon />
							<span className="text-xs">{text}</span>
						</Button>
					);
				})}
			</div>
		</div>
	);
};

export default BottomTabBar;
