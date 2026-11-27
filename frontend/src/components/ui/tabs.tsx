import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex flex-wrap items-center gap-1 rounded-lg border border-[#E5DCD3] bg-[#F1EAE2] p-1 text-[#51494A]',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:text-[#30282A] data-[state=active]:border data-[state=active]:border-[#E5DCD3] data-[state=active]:bg-[#FFFCF8] data-[state=active]:font-semibold data-[state=active]:text-[#702B3A]',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-3 outline-none', className)} {...props} />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
