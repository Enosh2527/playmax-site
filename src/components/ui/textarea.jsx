import React from 'react';
export function Textarea({ className = '', ...props }) {
  return <textarea className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40 ${className}`} {...props} />;
}
