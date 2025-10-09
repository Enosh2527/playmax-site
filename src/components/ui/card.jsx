import React from "react";

const baseCard = "rounded-2xl border border-[#30363d] bg-[#0d1117] text-[#c9d1d9]";
const headerBase = "border-b border-[#30363d] p-6";

export function Card({ className = "", children }) {
  return <div className={`${baseCard} ${className}`}>{children}</div>;
}
export function CardHeader({ className = '', children }) {
  return <div className={`${headerBase} ${className}`}>{children}</div>;
}
export function CardTitle({ className = '', children }) {
  return <h3 className={`text-lg font-semibold ${className}`}>{children}</h3>;
}
export function CardContent({ className = '', children }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}
