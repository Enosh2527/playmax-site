import React from 'react';
export function Badge({ className = '', variant = 'default', children }) {
  const variants = {
    default: 'bg-gray-100',
    secondary: 'bg-gray-100',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${variants[variant]} ${className}`}>{children}</span>;
}
