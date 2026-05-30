declare global {
  interface Window {
    __NEXT_DATA__: Record<string, any>;
  }
}

export {};
