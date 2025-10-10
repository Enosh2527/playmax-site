import React from "react";

const variantStyles = {
  default: "border border-[#30363d] bg-[#161b22] text-[#c9d1d9]",
  secondary: "border border-[#30363d] bg-[#0d1117] text-[#9ba4b4]",
};

export function Badge({ className = "", variant = "default", children }) {
  const resolved = variantStyles[variant] ?? variantStyles.default;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${resolved} ${className}`}
    >
      {children}
    </span>
  );
}
