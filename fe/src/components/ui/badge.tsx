import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/utils/cn"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        /**
         * Added for Sterun. shadcn ships no success or warning, and this app
         * needs both: an event is Open or it is not, and a document either
         * matched its hash or could not be read. Both are built from tokens.css
         * like every other variant here, so they are part of Nabil's palette
         * rather than a second one.
         */
        success:
          "border-success-border bg-success-surface text-success [a&]:hover:bg-success-surface/80",
        warning:
          "border-warning-border bg-warning-surface text-warning [a&]:hover:bg-warning-surface/80",
        accent: "border-teal-200 bg-teal-50 text-teal-700 [a&]:hover:bg-teal-100",
        /**
         * Added for Sterun. `secondary` maps to n-100, which is a shade off the
         * page itself, so a chip using it reads as an outline chip with the
         * border missing. This is the filled grey the "you cannot enter this,
         * and nothing is wrong" states need in order to sit apart from
         * `outline` — see EventStatusBadge on why Draft and Closed must not
         * look alike.
         */
        muted: "border-n-300 bg-n-200 text-n-600 [a&]:hover:bg-n-300",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
