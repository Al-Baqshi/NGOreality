import { createContext, useContext, type ReactNode } from 'react';
import { useNgoPortal } from '../hooks/useNgoPortal';

type NgoPortalContextValue = ReturnType<typeof useNgoPortal>;

const NgoPortalContext = createContext<NgoPortalContextValue | null>(null);

export function NgoPortalProvider({
  value,
  children,
}: {
  value: NgoPortalContextValue;
  children: ReactNode;
}) {
  return <NgoPortalContext.Provider value={value}>{children}</NgoPortalContext.Provider>;
}

export function useNgoPortalContext(): NgoPortalContextValue {
  const ctx = useContext(NgoPortalContext);
  if (!ctx) {
    throw new Error('useNgoPortalContext must be used within NgoPortalProvider');
  }
  return ctx;
}

export function useNgoPortalGate() {
  return useNgoPortal();
}
