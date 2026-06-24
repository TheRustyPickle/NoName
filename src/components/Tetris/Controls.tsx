import { motion } from "framer-motion";
import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	Package,
	Pause,
	RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ControlsProps {
	onMoveLeft: () => void;
	onMoveRight: () => void;
	onRotate: () => void;
	onHardDrop: () => void;
	onHold: () => void;
	onPauseToggle: () => void;
	isDark: boolean;
}

export function Controls({
	onMoveLeft,
	onMoveRight,
	onRotate,
	onHardDrop,
	onHold,
	onPauseToggle,
	isDark,
}: ControlsProps) {
	const buttonStyle = `aspect-square w-full touch-manipulation text-sm
  ${
		isDark
			? "border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300"
			: "border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-800"
	}`;

	return (
		<div className="mt-4 grid grid-cols-3 gap-2 w-full touch-none select-none">
			{" "}
			{/* Added select-none */}
			{/* Row 1 */}
			<motion.div whileTap={{ scale: 0.9 }}>
				<Button
					variant="outline"
					size="icon"
					className={buttonStyle}
					onClick={onMoveLeft}
					aria-label="Move Left"
				>
					<ArrowLeft />
				</Button>
			</motion.div>
			<motion.div whileTap={{ scale: 0.9 }}>
				<Button
					variant="outline"
					size="icon"
					className={buttonStyle}
					onClick={onRotate}
					aria-label="Rotate"
				>
					<RotateCw />
				</Button>
			</motion.div>
			<motion.div whileTap={{ scale: 0.9 }}>
				<Button
					variant="outline"
					size="icon"
					className={buttonStyle}
					onClick={onMoveRight}
					aria-label="Move Right"
				>
					<ArrowRight />
				</Button>
			</motion.div>
			{/* Row 2 */}
			<motion.div whileTap={{ scale: 0.9 }}>
				<Button
					variant="outline"
					size="icon"
					className={buttonStyle}
					onClick={onPauseToggle}
					aria-label="Pause or Resume"
				>
					<Pause />{" "}
					{/* Icon doesn't change based on state here, could be enhanced */}
				</Button>
			</motion.div>
			<motion.div whileTap={{ scale: 0.9 }}>
				<Button
					variant="outline"
					size="icon"
					className={buttonStyle}
					onClick={onHardDrop}
					aria-label="Hard Drop"
				>
					<ArrowDown /> {/* Consider different icon? */}
				</Button>
			</motion.div>
			<motion.div whileTap={{ scale: 0.9 }}>
				<Button
					variant="outline"
					size="icon"
					className={buttonStyle}
					onClick={onHold}
					aria-label="Hold Piece"
				>
					<Package /> {/* Hold Icon */}
				</Button>
			</motion.div>
		</div>
	);
}
