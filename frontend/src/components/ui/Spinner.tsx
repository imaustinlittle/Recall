import clsx from "clsx";

interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-10 h-10 border-[3px]",
};

export function Spinner({ size = "md", className }: Props) {
  return (
    <span
      className={clsx(
        "inline-block animate-spin rounded-full border-accent-line border-t-accent",
        sizes[size],
        className
      )}
      aria-label="Loading"
    />
  );
}
