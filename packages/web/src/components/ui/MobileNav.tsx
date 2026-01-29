'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

interface NavItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
}

interface MobileNavProps {
  items: NavItem[];
  logo?: React.ReactNode;
  footer?: React.ReactNode;
}

const drawerVariants = {
  closed: {
    x: '-100%',
    transition: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 40,
    },
  },
  open: {
    x: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 40,
    },
  },
};

const backdropVariants = {
  closed: { opacity: 0 },
  open: { opacity: 1 },
};

const listVariants = {
  closed: { opacity: 0 },
  open: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  closed: { opacity: 0, x: -20 },
  open: { opacity: 1, x: 0 },
};

function MobileNav({ items, logo, footer }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  return (
    <>
      {/* Hamburger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden p-2 rounded-md text-slate-600 hover:text-slate-800 hover:bg-surface-100 transition-colors"
        aria-label="Open menu"
        aria-expanded={isOpen}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial="closed"
              animate="open"
              exit="closed"
              variants={backdropVariants}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
              onClick={() => setIsOpen(false)}
            />

            {/* Drawer panel */}
            <motion.div
              initial="closed"
              animate="open"
              exit="closed"
              variants={drawerVariants}
              className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl lg:hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-surface-200">
                {(logo as any) || (
                  <span className="text-xl font-bold text-gradient">Field Network</span>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-md text-slate-400 hover:text-slate-600 hover:bg-surface-100 transition-colors"
                  aria-label="Close menu"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Navigation items */}
              <motion.nav
                variants={listVariants}
                initial="closed"
                animate="open"
                className="flex-1 overflow-y-auto p-4"
              >
                <ul className="space-y-1">
                  {items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                    return (
                      <motion.li key={item.href} variants={itemVariants}>
                        <Link
                          href={item.href}
                          className={`
                            flex items-center gap-3 px-3 py-2.5 rounded-lg
                            transition-colors duration-150
                            ${
                              isActive
                                ? 'bg-field-50 text-field-700 font-medium'
                                : 'text-slate-600 hover:bg-surface-50 hover:text-slate-800'
                            }
                          `}
                        >
                          {item.icon && (
                            <span className={isActive ? 'text-field-500' : 'text-slate-400'}>
                              {item.icon as any}
                            </span>
                          )}
                          {item.label}
                        </Link>
                      </motion.li>
                    );
                  })}
                </ul>
              </motion.nav>

              {/* Footer */}
              {footer && (
                <div className="p-4 border-t border-surface-200">
                  {footer as any}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// Simple hamburger menu icon component
function HamburgerIcon({ isOpen, className = '' }: { isOpen?: boolean; className?: string }) {
  return (
    <svg
      className={`w-6 h-6 ${className}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      {isOpen ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6h16M4 12h16M4 18h16"
        />
      )}
    </svg>
  );
}

export { MobileNav, HamburgerIcon };
export type { MobileNavProps, NavItem };
