'use client';

import { ReactNode } from 'react';
import { motion, Variants } from 'framer-motion';

// Page transition wrapper
interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

const pageVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

function PageTransition({ children, className = '' }: PageTransitionProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={className}
    >
      {children as any}
    </motion.div>
  );
}

// Fade in wrapper
interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

function FadeIn({ children, delay = 0, duration = 0.3, className = '' }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration }}
      className={className}
    >
      {children as any}
    </motion.div>
  );
}

// Slide up wrapper
interface SlideUpProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

function SlideUp({ children, delay = 0, duration = 0.3, className = '' }: SlideUpProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration, ease: 'easeOut' }}
      className={className}
    >
      {children as any}
    </motion.div>
  );
}

// Scale in wrapper
interface ScaleInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

function ScaleIn({ children, delay = 0, duration = 0.2, className = '' }: ScaleInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration, ease: 'easeOut' }}
      className={className}
    >
      {children as any}
    </motion.div>
  );
}

// Staggered list container
interface StaggeredListProps {
  children: ReactNode;
  staggerDelay?: number;
  className?: string;
}

const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

function StaggeredList({ children, staggerDelay = 0.1, className = '' }: StaggeredListProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
    >
      {children as any}
    </motion.div>
  );
}

// Staggered list item
interface StaggeredItemProps {
  children: ReactNode;
  className?: string;
}

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
};

function StaggeredItem({ children, className = '' }: StaggeredItemProps) {
  return (
    <motion.div variants={staggerItemVariants} className={className}>
      {children as any}
    </motion.div>
  );
}

// Hover scale effect
interface HoverScaleProps {
  children: ReactNode;
  scale?: number;
  className?: string;
}

function HoverScale({ children, scale = 1.02, className = '' }: HoverScaleProps) {
  return (
    <motion.div
      whileHover={{ scale }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={className}
    >
      {children as any}
    </motion.div>
  );
}

// Animated number counter
interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  formatter?: (value: number) => string;
}

function AnimatedCounter({
  value,
  duration = 1,
  className = '',
  formatter = (v) => Math.round(v).toString(),
}: AnimatedCounterProps) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={className}
    >
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {formatter(value)}
      </motion.span>
    </motion.span>
  );
}

// Pulse animation for attention
interface PulseProps {
  children: ReactNode;
  className?: string;
}

function Pulse({ children, className = '' }: PulseProps) {
  return (
    <motion.div
      animate={{
        scale: [1, 1.05, 1],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      className={className}
    >
      {children as any}
    </motion.div>
  );
}

export {
  PageTransition,
  FadeIn,
  SlideUp,
  ScaleIn,
  StaggeredList,
  StaggeredItem,
  HoverScale,
  AnimatedCounter,
  Pulse,
  pageVariants,
  staggerContainerVariants,
  staggerItemVariants,
};
