import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const switchVariants = cva(
  'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'h-5 w-9',
        sm: 'h-4 w-7',
        lg: 'h-6 w-11',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

const thumbVariants = cva(
  'pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform',
  {
    variants: {
      size: {
        default: 'h-4 w-4',
        sm: 'h-3 w-3',
        lg: 'h-5 w-5',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

export interface SwitchProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>,
    VariantProps<typeof switchVariants> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, size, checked, defaultChecked, onCheckedChange, onClick, ...props }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked ?? false);

    const isControlled = checked !== undefined;
    const isChecked = isControlled ? checked : internalChecked;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      const newChecked = !isChecked;

      if (!isControlled) {
        setInternalChecked(newChecked);
      }

      onCheckedChange?.(newChecked);
      onClick?.(e);
    };

    return (
      <button
        type="button"
        role="switch"
        aria-checked={isChecked}
        ref={ref}
        className={cn(switchVariants({ size }), isChecked ? 'bg-primary' : 'bg-input', className)}
        onClick={handleClick}
        {...props}
      >
        <span
          className={cn(
            thumbVariants({ size }),
            isChecked
              ? size === 'lg'
                ? 'translate-x-5'
                : size === 'sm'
                  ? 'translate-x-3'
                  : 'translate-x-4'
              : 'translate-x-0'
          )}
        />
      </button>
    );
  }
);

Switch.displayName = 'Switch';

export { Switch };
