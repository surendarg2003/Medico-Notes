import type { Page } from '../../types/document'
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import { usePageStore } from '../../stores/pageStore'
import PageThumbnail from './PageThumbnail'

type PdfPageLike = {
  pdfBackground?: string
  pdfSourceName?: string
}

function PageNavigator() {
  const notebook = useDocumentStore((state) => state.notebook)

  const addPage = useDocumentStore(
    (state) => state.addPage,
  )

  const duplicatePage = useDocumentStore(
    (state) => state.duplicatePage,
  )

  const deletePage = useDocumentStore(
    (state) => state.deletePage,
  )

  const renamePage = useDocumentStore(
    (state) => state.renamePage,
  )

  const activePageId = usePageStore(
    (state) => state.activePageId,
  )

  const setActivePage = usePageStore(
    (state) => state.setActivePage,
  )

  const [selectedPageIds, setSelectedPageIds] =
    useState<string[]>([])

  useEffect(() => {
    if (!notebook) {
      setSelectedPageIds([])
      return
    }

    setSelectedPageIds((currentIds) =>
      currentIds.filter((id) =>
        notebook.pages.some(
          (page) => page.id === id,
        ),
      ),
    )
  }, [notebook])

  if (!notebook) {
    return null
  }

  const isPageSelected = (pageId: string) =>
    selectedPageIds.includes(pageId)

  const clearSelection = () => {
    setSelectedPageIds([])
  }

  const selectSinglePage = (pageId: string) => {
    setSelectedPageIds([pageId])
    setActivePage(pageId)
  }

  const handlePageClick = (
    pageId: string,
    event: MouseEvent<HTMLDivElement>,
  ) => {
    const pageIndex = notebook.pages.findIndex(
      (page) => page.id === pageId,
    )

    if (pageIndex === -1) {
      return
    }

    if (event.shiftKey && selectedPageIds.length > 0) {
      const anchorId =
        selectedPageIds[selectedPageIds.length - 1]

      const anchorIndex = notebook.pages.findIndex(
        (page) => page.id === anchorId,
      )

      if (anchorIndex !== -1) {
        const start = Math.min(
          anchorIndex,
          pageIndex,
        )

        const end = Math.max(
          anchorIndex,
          pageIndex,
        )

        const rangeIds = notebook.pages
          .slice(start, end + 1)
          .map((page) => page.id)

        setSelectedPageIds((currentIds) =>
          Array.from(
            new Set([...currentIds, ...rangeIds]),
          ),
        )
      } else {
        selectSinglePage(pageId)
      }

      setActivePage(pageId)
      return
    }

    if (event.metaKey || event.ctrlKey) {
      setSelectedPageIds((currentIds) => {
        if (currentIds.includes(pageId)) {
          const nextIds = currentIds.filter(
            (id) => id !== pageId,
          )

          if (nextIds.length === 0) {
            setActivePage(pageId)
          }

          return nextIds
        }

        return [...currentIds, pageId]
      })

      setActivePage(pageId)
      return
    }

    selectSinglePage(pageId)
  }

  const handleAddPage = () => {
    const newPageId = addPage()

    if (newPageId) {
      setActivePage(newPageId)
      setSelectedPageIds([newPageId])
    }
  }

  const handleDuplicatePage = (pageId: string) => {
    const newPageId = duplicatePage(pageId)

    if (newPageId) {
      setActivePage(newPageId)
      setSelectedPageIds([newPageId])
    }
  }

  const handleDeletePage = (pageId: string) => {
    if (notebook.pages.length <= 1) {
      return
    }

    const pageIndex = notebook.pages.findIndex(
      (page) => page.id === pageId,
    )

    if (pageIndex === -1) {
      return
    }

    const wasActive = activePageId === pageId

    let nextActivePageId: string | null =
      activePageId

    if (wasActive) {
      if (pageIndex > 0) {
        nextActivePageId =
          notebook.pages[pageIndex - 1].id
      } else if (
        pageIndex + 1 <
        notebook.pages.length
      ) {
        nextActivePageId =
          notebook.pages[pageIndex + 1].id
      }
    }

    const deleted = deletePage(pageId)

    if (deleted && nextActivePageId) {
      setActivePage(nextActivePageId)
    }

    setSelectedPageIds((currentIds) =>
      currentIds.filter((id) => id !== pageId),
    )
  }

  const handleRenamePage = (
    pageId: string,
    title: string,
  ) => {
    renamePage(pageId, title)
  }

  const handleMovePage = (
    pageId: string,
    direction: 'up' | 'down',
  ) => {
    useDocumentStore.setState((state) => {
      if (!state.notebook) {
        return state
      }

      const sourceIndex =
        state.notebook.pages.findIndex(
          (page) => page.id === pageId,
        )

      if (sourceIndex === -1) {
        return state
      }

      const targetIndex =
        direction === 'up'
          ? sourceIndex - 1
          : sourceIndex + 1

      if (
        targetIndex < 0 ||
        targetIndex >=
          state.notebook.pages.length
      ) {
        return state
      }

      const previousNotebook =
        structuredClone(state.notebook)

      const pages = [
        ...state.notebook.pages,
      ]

      const [movedPage] = pages.splice(
        sourceIndex,
        1,
      )

      pages.splice(
        targetIndex,
        0,
        movedPage,
      )

      return {
        notebook: {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        },
        history: [
          ...state.history,
          previousNotebook,
        ],
        future: [],
      }
    })

    setActivePage(pageId)
  }

  const handleMoveSelectedPages = (
    direction: 'up' | 'down',
  ) => {
    if (
      selectedPageIds.length === 0 ||
      notebook.pages.length <= 1
    ) {
      return
    }

    useDocumentStore.setState((state) => {
      if (!state.notebook) {
        return state
      }

      const previousNotebook =
        structuredClone(state.notebook)

      const pages = [
        ...state.notebook.pages,
      ]

      const selectedSet = new Set(selectedPageIds)

      if (direction === 'up') {
        for (
          let index = 1;
          index < pages.length;
          index += 1
        ) {
          if (
            selectedSet.has(pages[index].id) &&
            !selectedSet.has(
              pages[index - 1].id,
            )
          ) {
            const current = pages[index]
            pages[index] = pages[index - 1]
            pages[index - 1] = current
          }
        }
      } else {
        for (
          let index = pages.length - 2;
          index >= 0;
          index -= 1
        ) {
          if (
            selectedSet.has(pages[index].id) &&
            !selectedSet.has(
              pages[index + 1].id,
            )
          ) {
            const current = pages[index]
            pages[index] = pages[index + 1]
            pages[index + 1] = current
          }
        }
      }

      const changed =
        pages.some(
          (page, index) =>
            page.id !==
            state.notebook?.pages[index]?.id,
        )

      if (!changed) {
        return state
      }

      return {
        notebook: {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        },
        history: [
          ...state.history,
          previousNotebook,
        ],
        future: [],
      }
    })

    if (activePageId) {
      setActivePage(activePageId)
    }
  }

  const handleDeleteSelectedPages = () => {
    if (
      selectedPageIds.length === 0 ||
      notebook.pages.length <= 1
    ) {
      return
    }

    useDocumentStore.setState((state) => {
      if (!state.notebook) {
        return state
      }

      const selectedSet = new Set(
        selectedPageIds,
      )

      let pages = state.notebook.pages.filter(
        (page) => !selectedSet.has(page.id),
      )

      if (pages.length === 0) {
        pages = [
          state.notebook.pages[0],
        ]
      }

      if (
        pages.length ===
        state.notebook.pages.length
      ) {
        return state
      }

      const previousNotebook =
        structuredClone(state.notebook)

      return {
        notebook: {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        },
        history: [
          ...state.history,
          previousNotebook,
        ],
        future: [],
      }
    })

    const remainingPages =
      notebook.pages.filter(
        (page) =>
          !selectedPageIds.includes(page.id),
      )

    if (remainingPages.length > 0) {
      const activeStillExists =
        activePageId &&
        remainingPages.some(
          (page) =>
            page.id === activePageId,
        )

      if (!activeStillExists) {
        setActivePage(
          remainingPages[0].id,
        )
      }
    }

    setSelectedPageIds([])
  }

  const handleKeyboardReorder = (
    event: KeyboardEvent<HTMLDivElement>,
    pageId: string,
  ) => {
    if (
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown'
    ) {
      return
    }

    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return
    }

    event.preventDefault()

    if (
      selectedPageIds.includes(pageId) &&
      selectedPageIds.length > 1
    ) {
      handleMoveSelectedPages(
        event.key === 'ArrowUp'
          ? 'up'
          : 'down',
      )
      return
    }

    handleMovePage(
      pageId,
      event.key === 'ArrowUp'
        ? 'up'
        : 'down',
    )
  }

  const selectedPdfCount =
    selectedPageIds.filter((id) => {
      const page = notebook.pages.find(
        (item) => item.id === id,
      )

      if (!page) {
        return false
      }

      const pdfPage =
        page as Page & PdfPageLike

      return Boolean(
        pdfPage.pdfBackground,
      )
    }).length

  return (
    <aside className="page-navigator">
      <div className="page-navigator-header">
        <div className="page-navigator-title">
          <span>Pages</span>

          {selectedPageIds.length > 0 && (
            <span
              style={{
                marginLeft: '6px',
                fontSize: '10px',
                fontWeight: 600,
                color: '#77777d',
              }}
            >
              {selectedPageIds.length}
            </span>
          )}
        </div>

        <button
          className="page-add-button"
          onClick={handleAddPage}
          aria-label="Add new page"
          title="Add new page"
          type="button"
        >
          <Plus size={17} />
        </button>
      </div>

      {selectedPageIds.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '8px',
            marginBottom: '8px',
            borderRadius: '7px',
            background: '#f4f4f7',
            border: '1px solid #e2e2e6',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#444449',
              }}
            >
              {selectedPageIds.length} selected
              {selectedPdfCount > 0
                ? ` · ${selectedPdfCount} PDF`
                : ''}
            </span>

            <button
              type="button"
              onClick={clearSelection}
              aria-label="Clear page selection"
              title="Clear selection"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                height: '22px',
                padding: 0,
                border: 'none',
                borderRadius: '4px',
                background: 'transparent',
                color: '#66666c',
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
            }}
          >
            <button
              type="button"
              onClick={() =>
                handleMoveSelectedPages('up')
              }
              aria-label="Move selected pages up"
              title="Move selected pages up"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '26px',
                padding: 0,
                border: '1px solid #d7d7dc',
                borderRadius: '5px',
                background: '#ffffff',
                color: '#333338',
                cursor: 'pointer',
              }}
            >
              <ArrowUp size={14} />
            </button>

            <button
              type="button"
              onClick={() =>
                handleMoveSelectedPages('down')
              }
              aria-label="Move selected pages down"
              title="Move selected pages down"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '26px',
                padding: 0,
                border: '1px solid #d7d7dc',
                borderRadius: '5px',
                background: '#ffffff',
                color: '#333338',
                cursor: 'pointer',
              }}
            >
              <ArrowDown size={14} />
            </button>

            <button
              type="button"
              onClick={handleDeleteSelectedPages}
              disabled={
                notebook.pages.length <=
                selectedPageIds.length
              }
              aria-label="Delete selected pages"
              title="Delete selected pages"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '26px',
                padding: 0,
                border: '1px solid #dedee2',
                borderRadius: '5px',
                background:
                  notebook.pages.length >
                  selectedPageIds.length
                    ? '#ffffff'
                    : '#f5f5f7',
                color:
                  notebook.pages.length >
                  selectedPageIds.length
                    ? '#55555c'
                    : '#aaaaaf',
                cursor:
                  notebook.pages.length >
                  selectedPageIds.length
                    ? 'pointer'
                    : 'default',
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      <div className={`page-list-scroll ${notebook.pages.some((page) => Boolean((page as typeof page & PdfPageLike).pdfBackground)) ? 'page-list-scroll-with-pdf' : ''}`}>
        <div className="page-list">
          {notebook.pages
            .map((page, index) => ({ page, index }))
            .filter(({ page }) => {
              const pdfPage =
                page as typeof page & PdfPageLike
              return !pdfPage.pdfBackground
            })
            .map(({ page, index }) => {
              const canMoveUp = index > 0
              const canMoveDown =
                index < notebook.pages.length - 1

              const selected =
                isPageSelected(page.id)

              return (
                <div
                  key={page.id}
                  tabIndex={0}
                  onKeyDown={(event) =>
                    handleKeyboardReorder(
                      event,
                      page.id,
                    )
                  }
                  onClick={(event) =>
                    handlePageClick(
                      page.id,
                      event,
                    )
                  }
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px',
                    outline: 'none',
                    padding: '3px',
                    borderRadius: '8px',
                    background: selected
                      ? '#eeeeF3'
                      : 'transparent',
                    boxShadow: selected
                      ? 'inset 0 0 0 1px #cfcfd6'
                      : 'none',
                  }}
                >
                  <PageThumbnail
                    page={page}
                    pageNumber={index + 1}
                    isActive={
                      page.id === activePageId
                    }
                    canDelete={
                      notebook.pages.length > 1
                    }
                    onClick={() =>
                      setActivePage(page.id)
                    }
                    onDuplicate={() =>
                      handleDuplicatePage(page.id)
                    }
                    onDelete={() =>
                      handleDeletePage(page.id)
                    }
                    onRename={(title: string) =>
                      handleRenamePage(
                        page.id,
                        title,
                      )
                    }
                  />

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleMovePage(page.id, 'up')
                      }}
                      disabled={!canMoveUp}
                      aria-label={`Move page ${index + 1} up`}
                      title="Move page up"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '24px',
                        padding: 0,
                        border: '1px solid #dedee2',
                        borderRadius: '5px',
                        background: canMoveUp
                          ? '#ffffff'
                          : '#f5f5f7',
                        color: canMoveUp
                          ? '#333338'
                          : '#aaaaaf',
                        cursor: canMoveUp
                          ? 'pointer'
                          : 'default',
                      }}
                    >
                      <ArrowUp size={13} />
                    </button>

                    <span
                      style={{
                        minWidth: '34px',
                        textAlign: 'center',
                        fontSize: '10px',
                        color: '#77777d',
                      }}
                    >
                      {index + 1}
                    </span>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleMovePage(page.id, 'down')
                      }}
                      disabled={!canMoveDown}
                      aria-label={`Move page ${index + 1} down`}
                      title="Move page down"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '24px',
                        padding: 0,
                        border: '1px solid #dedee2',
                        borderRadius: '5px',
                        background: canMoveDown
                          ? '#ffffff'
                          : '#f5f5f7',
                        color: canMoveDown
                          ? '#333338'
                          : '#aaaaaf',
                        cursor: canMoveDown
                          ? 'pointer'
                          : 'default',
                      }}
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {notebook.pages.some((page) => {
        const pdfPage = page as typeof page & PdfPageLike
        return Boolean(pdfPage.pdfBackground)
      }) && (
        <div className="pdf-pages-section">
          <div className="pdf-pages-title">
            <FileText size={11} />
            <span>PDF</span>
          </div>

          <div className="pdf-pages-list">
            {notebook.pages
            .map((page, index) => ({ page, index }))
            .filter(({ page }) => {
              const pdfPage =
                page as typeof page & PdfPageLike
              return Boolean(pdfPage.pdfBackground)
            })
            .map(({ page, index }) => {
              const pdfPage =
                page as typeof page & PdfPageLike

              const canMoveUp = index > 0
              const canMoveDown =
                index < notebook.pages.length - 1

              const selected =
                isPageSelected(page.id)

              return (
                <div
                  key={page.id}
                  tabIndex={0}
                  onKeyDown={(event) =>
                    handleKeyboardReorder(
                      event,
                      page.id,
                    )
                  }
                  onClick={(event) =>
                    handlePageClick(
                      page.id,
                      event,
                    )
                  }
                  className="pdf-page-item"
                  style={{
                    background: selected
                      ? '#eeeeF3'
                      : 'transparent',
                    boxShadow: selected
                      ? 'inset 0 0 0 1px #cfcfd6'
                      : 'none',
                  }}
                  title={
                    pdfPage.pdfSourceName
                      ? `Imported from ${pdfPage.pdfSourceName}`
                      : 'Imported PDF page'
                  }
                >
                  <PageThumbnail
                    page={page}
                    pageNumber={index + 1}
                    isActive={
                      page.id === activePageId
                    }
                    canDelete={
                      notebook.pages.length > 1
                    }
                    onClick={() =>
                      setActivePage(page.id)
                    }
                    onDuplicate={() =>
                      handleDuplicatePage(page.id)
                    }
                    onDelete={() =>
                      handleDeletePage(page.id)
                    }
                    onRename={(title: string) =>
                      handleRenamePage(
                        page.id,
                        title,
                      )
                    }
                  />

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleMovePage(page.id, 'up')
                      }}
                      disabled={!canMoveUp}
                      aria-label={`Move page ${index + 1} up`}
                      title="Move page up"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '24px',
                        padding: 0,
                        border: '1px solid #dedee2',
                        borderRadius: '5px',
                        background: canMoveUp
                          ? '#ffffff'
                          : '#f5f5f7',
                        color: canMoveUp
                          ? '#333338'
                          : '#aaaaaf',
                        cursor: canMoveUp
                          ? 'pointer'
                          : 'default',
                      }}
                    >
                      <ArrowUp size={13} />
                    </button>

                    <span
                      style={{
                        minWidth: '34px',
                        textAlign: 'center',
                        fontSize: '10px',
                        color: '#77777d',
                      }}
                    >
                      {index + 1}
                    </span>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleMovePage(page.id, 'down')
                      }}
                      disabled={!canMoveDown}
                      aria-label={`Move page ${index + 1} down`}
                      title="Move page down"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '24px',
                        padding: 0,
                        border: '1px solid #dedee2',
                        borderRadius: '5px',
                        background: canMoveDown
                          ? '#ffffff'
                          : '#f5f5f7',
                        color: canMoveDown
                          ? '#333338'
                          : '#aaaaaf',
                        cursor: canMoveDown
                          ? 'pointer'
                          : 'default',
                      }}
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </aside>
  )
}

export default PageNavigator
