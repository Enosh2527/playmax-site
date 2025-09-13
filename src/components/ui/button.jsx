import React from 'react';

export function Button({ asChild, className = '', children, size = 'md', variant = 'default', ...props }) {
  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2',
    lg: 'px-5 py-3 text-lg',
  };
  const variants = {
    default: 'bg-primary text-white hover:opacity-95',
    outline: 'border border-gray-300 hover:bg-gray-50',
    secondary: 'bg-gray-100 hover:bg-gray-200',
  };
  const C = asChild ? 'a' : 'button';
  return (
    <C className={`inline-flex items-center justify-center rounded-xl transition ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </C>
  );
}
