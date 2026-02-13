import { cn } from "@/lib/utils";

interface CircularProgressProps {
	value: number;
	size?: number;
	strokeWidth?: number;
	className?: string;
	color?: string;
}

export function CircularProgress({
	value,
	size = 40,
	strokeWidth = 3,
	className,
	color = "currentColor",
}: CircularProgressProps) {
	const radius = (size - strokeWidth) / 2;
	const circumference = radius * 2 * Math.PI;
	const offset = circumference - (value / 100) * circumference;

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			className={cn("-rotate-90 transform", className)}
		>
			<title>Progress</title>
			{/* Background Circle */}
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke="currentColor"
				strokeWidth={strokeWidth}
				fill="transparent"
				className="text-muted/30"
			/>
			{/* Progress Circle */}
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke={color}
				strokeWidth={strokeWidth}
				fill="transparent"
				strokeDasharray={circumference}
				strokeDashoffset={offset}
				strokeLinecap="round"
				className="transition-all duration-1000 ease-out"
			/>
		</svg>
	);
}
