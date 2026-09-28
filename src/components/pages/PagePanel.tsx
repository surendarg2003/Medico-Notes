import { useEffect } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import { usePageStore } from '../../stores/pageStore'
import NoteCanvas from '../../canvas/NoteCanvas'

function PagePanel() {
  const notebook = useDocumentStore((state) => state.notebook)

  const setPageBackground = useDocumentStore(
    (state) => state.setPageBackground,
  )

  const activePageId = usePageStore(
    (state) => state.activePageId,
  )

  const setActivePage = usePageStore(
    (state) => state.setActivePage,
  )

  useEffect(() => {
    if (!notebook || notebook.pages.length === 0) {
      return
    }

    const activePageExists = notebook.pages.some(
      (page) => page.id === activePageId,
    )

    if (!activePageExists) {
      setActivePage(notebook.pages[0].id)
    }
  }, [notebook, activePageId, setActivePage])

  if (!notebook) {
    return null
  }

  const page =
    notebook.pages.find(
      (item) => item.id === activePageId,
    ) ?? notebook.pages[0]

  const hasPdfBackground = Boolean(
    (page as typeof page & { pdfBackground?: string }).pdfBackground,
  )

  return (
    <div className="page-panel">
      <div className={`note-page note-page-${page.background}`}>
        <div className="note-page-header">
          <span>{page.title}</span>

          <select
            value={page.background}
            title={hasPdfBackground ? 'Change the page paper behind the imported PDF' : 'Choose page paper'}
            onChange={(event) =>
              setPageBackground(
                page.id,
                event.target.value as typeof page.background,
              )
            }
          >
            <option value="plain">Plain</option>
            <option value="ruled">Ruled</option>
            <option value="grid">Grid</option>
            <option value="dotted">Dotted</option>
          </select>
          {hasPdfBackground && <span className="page-background-note">Changes apply behind the imported PDF</span>}
        </div>

        <div className={`note-page-content${hasPdfBackground ? ' note-page-content-pdf' : ''}`}>
          <NoteCanvas
            pageId={page.id}
            width={760}
            height={900}
          />
        </div>
      </div>
    </div>
  )
}

export default PagePanel
