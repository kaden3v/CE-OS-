import React from 'react';

export function CultivarName({ name, className }: { name: string, className?: string }) {
  if (!name) return null;

  const singleQuoteIndex = name.indexOf("'");
  if (singleQuoteIndex !== -1) {
    const latin = name.slice(0, singleQuoteIndex).trim();
    const rest = name.slice(singleQuoteIndex);
    return (
      <span className={className}>
        <span className="sr-only">{name}</span>
        <span aria-hidden="true">
          <i className="italic">{latin}</i> {rest}
        </span>
      </span>
    );
  }

  return (
    <span className={className}>
      <span className="sr-only">{name}</span>
      <i className="italic" aria-hidden="true">{name}</i>
    </span>
  );
}
