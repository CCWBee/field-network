'use client';

import { ReactNode } from 'react';
import { motion, Variants } from 'framer-motion';

// Page transition wrapper — route transition, kept as motion
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

// Fade in wrapper — stripped to plain div
interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

function FadeIn({ children, className = '' }: FadeInProps) {
  return (
    <div className={className}>
      {children as any}
    </div>
  );
}

// Slide up wrapper — stripped to plain div
interface SlideUpProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

function SlideUp({ children, className = '' }: SlideUpProps) {
  return (
    <div className={className}>
      {children as any}
    </div>
  );
}

// Scale in wrapper — stripped to plain div
interface ScaleInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

function ScaleIn({ children, className = '' }: ScaleInProps) {
  return (
    <div className={className}>
      {children as any}
    </div>
  );
}

// Staggered list container — stripped to plain div
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

function StaggeredList({ children, className = '' }: StaggeredListProps) {
  return (
    <div className={className}>
      {children as any}
    </div>
  );
}

// Staggered list item — stripped to plain div
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
    <div className={className}>
      {children as any}
    </div>
  );
}

// Hover scale effect — stripped to plain div
interface HoverScaleProps {
  children: ReactNode;
  scale?: number;
  className?: string;
}

function HoverScale({ children, className = '' }: HoverScaleProps) {
  return (
    <div className={className}>
      {children as any}
    </div>
  );
}

// Animated number counter — simplified to plain span
interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  formatter?: (value: number) => string;
}

function AnimatedCounter({
  value,
  className = '',
  formatter = (v) => Math.round(v).toString(),
}: AnimatedCounterProps) {
  return (
    <span className={className}>
      {formatter(value)}
    </span>
  );
}

// Pulse animation for attention — stripped to plain div
interface PulseProps {
  children: ReactNode;
  className?: string;
}

function Pulse({ children, className = '' }: PulseProps) {
  return (
    <div className={className}>
      {children as any}
    </div>
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
