import { create } from 'zustand'

interface PageState {
  activePageId: string | null
  setActivePage: (pageId: string) => void
}

export const usePageStore = create<PageState>((set) => ({
  activePageId: null,

  setActivePage: (pageId) =>
    set({
      activePageId: pageId,
    }),
}))