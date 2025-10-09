import React from 'react';

export function Button({ asChild, className = '', children, size = 'md', variant = 'default', ...props }) {
  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2',
    lg: 'px-5 py-3 text-lg',
  };
  const variants = {
    default: 'bg-primary text-white hover:opacity-95',
    outline: 'border border-[#30363d] bg-transparent text-[#c9d1d9] hover:bg-[#1b2330]',
    secondary: 'bg-[#161b22] text-[#c9d1d9] hover:bg-[#1f6feb]/20',
    ghost: 'bg-transparent text-[#c9d1d9] hover:bg-[#1b2330] hover:text-white',
  };
  const C = asChild ? 'a' : 'button';
  const variantClasses = variants[variant] ?? variants.default;
  return (
    <C
      className={`inline-flex items-center justify-center rounded-xl transition ${sizes[size]} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </C>
  );
}
