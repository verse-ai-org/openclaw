'use client';

import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'px-4 py-1.5 text-xs',
  md: 'px-6 py-2 text-sm',
  lg: 'px-8 py-3 text-base',
};

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [sliderStyle, setSliderStyle] = useState({ left: 0, width: 0 });

  const selectedIndex = options.findIndex((opt) => opt.value === value);

  // 计算滑动背景位置
  useEffect(() => {
    const container = containerRef.current;
    const selectedButton = buttonRefs.current[selectedIndex];

    if (container && selectedButton) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = selectedButton.getBoundingClientRect();

      setSliderStyle({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    }
  }, [selectedIndex]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative inline-flex items-center bg-muted rounded-full p-1',
        className
      )}
    >
      {/* 滑动背景 */}
      <motion.div
        className="absolute bg-primary rounded-full shadow-lg shadow-primary/25"
        initial={false}
        animate={{
          left: sliderStyle.left,
          width: sliderStyle.width,
        }}
        style={{
          top: 4,
          bottom: 4,
        }}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 30,
        }}
      />

      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(el) => {
            buttonRefs.current[index] = el;
          }}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative z-10 font-medium transition-colors duration-200 rounded-full whitespace-nowrap',
            sizeClasses[size],
            value === option.value
              ? 'text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
