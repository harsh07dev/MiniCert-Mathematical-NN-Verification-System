import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#702B3A] disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-[#702B3A] text-white hover:bg-[#56212D] border border-[#702B3A]',
        outline:
          'border border-[#E5DCD3] bg-[#FFFCF8] text-[#30282A] hover:border-[#702B3A] hover:text-[#702B3A]',
        secondary:
          'border border-[#E5DCD3] bg-[#F1EAE2] text-[#30282A] hover:bg-[#E8E0D6]',
        ghost: 'text-[#51494A] hover:bg-[#F1EAE2] hover:text-[#30282A]',
        destructive: 'bg-[#B3261E] text-white hover:bg-[#931E17] border border-[#B3261E]',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-lg px-5',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
