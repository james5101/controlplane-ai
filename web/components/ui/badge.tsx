import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-blue-50 text-blue-700",
        success: "bg-green-50 text-green-700",
        warning: "bg-yellow-50 text-yellow-700",
        error: "bg-red-50 text-red-700",
        neutral: "bg-gray-100 text-gray-600",
        running: "bg-blue-50 text-blue-700 animate-pulse",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
