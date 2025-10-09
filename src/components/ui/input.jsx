import React from "react";

const baseClasses =
  "w-full rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-[#c9d1d9] placeholder:text-[#8b949e] outline-none transition focus:border-[#58a6ff] focus:ring-2 focus:ring-[#58a6ff]/40 disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className = "", ...props }) {
  return <input className={`${baseClasses} ${className}`} {...props} />;
}
