'use client';

import { useEffect } from 'react';

/** Sets the browser tab title for a client page: "<title> · Bloominder". */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title) document.title = `${title} · Bloominder`;
  }, [title]);
}
