import { create } from 'zustand'

export type SidebarSection =
  | 'notes'
  | 'folders'
  | 'templates'
  | 'settings'

interface UIState {
  activeSection: SidebarSection
  setActiveSection: (section: SidebarSection) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeSection: 'notes',

  setActiveSection: (section) =>
    set({
      activeSection: section,
    }),
}))