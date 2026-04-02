import clsx from "clsx";

interface Props {
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-10 h-10 border-[3px]",
};

export function Spinner({ size = "md" }: Props) {
  return (
    <span
      className={clsx(
        "inline-block rounded-full border-gray-200 border-t-brand-600 animate-spin",
        sizes[size]
      )}
      aria-label="Loading"
    />
  );
}
