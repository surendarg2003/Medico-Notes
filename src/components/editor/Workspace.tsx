import { useState } from 'react'
import { BookOpen, Check, FileText, Folder as FolderIcon } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useDocumentStore } from '../../stores/documentStore'
import PageNavigator from '../pages/PageNavigator'
import PagePanel from '../pages/PagePanel'

const templates = [
  { name: 'Blank', background: 'plain' as const, description: 'A clean page for anything.' },
  { name: 'Lecture notes', background: 'ruled' as const, description: 'Ruled pages for classes and meetings.' },
  { name: 'Graph paper', background: 'grid' as const, description: 'A grid for maths, sketches, and planning.' },
  { name: 'Dotted journal', background: 'dotted' as const, description: 'Subtle dots for journaling and layouts.' },
]

function Workspace() {
  const activeSection = useUIStore((state) => state.activeSection)
  const notebook = useDocumentStore((state) => state.notebook)
  const notebooks = useDocumentStore((state) => state.notebooks)
  const folders = useDocumentStore((state) => state.folders)
  const notebookFolderIds = useDocumentStore((state) => state.notebookFolderIds)
  const createNotebook = useDocumentStore((state) => state.createNotebook)
  const switchNotebook = useDocumentStore((state) => state.switchNotebook)
  const setPageBackground = useDocumentStore((state) => state.setPageBackground)
  const setNotebookFolder = useDocumentStore((state) => state.setNotebookFolder)
  const [folderFilter, setFolderFilter] = useState('all')

  if (activeSection === 'folders') {
    const shown = notebooks.filter((item) => folderFilter === 'all' || notebookFolderIds[item.id] === folderFilter)
    return <main className="workspace"><section className="section-page">
      <div className="section-heading"><div><h1>Folders</h1><p>Keep related notebooks together.</p></div>
        <select aria-label="Filter notebooks by folder" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}>
          <option value="all">All notebooks</option><option value="unfiled">Unfiled</option>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}
        </select>
      </div>
      {folders.length === 0 && <p className="section-hint">Create a folder from the sidebar to start organizing.</p>}
      <div className="library-grid">{shown.filter((item) => folderFilter !== 'unfiled' || !notebookFolderIds[item.id]).map((item) => <article className="library-card" key={item.id}>
        <div className="library-card-icon"><FolderIcon size={19} /></div><h2>{item.title}</h2><p>{item.pages.length} {item.pages.length === 1 ? 'page' : 'pages'}</p>
        <div className="library-card-actions"><select aria-label={`Folder for ${item.title}`} value={notebookFolderIds[item.id] ?? ''} onChange={(event) => setNotebookFolder(item.id, event.target.value || null)}><option value="">Unfiled</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select><button className="subtle-button" onClick={() => { switchNotebook(item.id); useUIStore.getState().setActiveSection('notes') }}>Open</button></div>
      </article>)}</div>
      {shown.length === 0 && folders.length > 0 && <p className="section-hint">No notebooks in this view yet.</p>}
    </section></main>
  }

  if (activeSection === 'templates') {
    return <main className="workspace"><section className="section-page">
      <h1>Templates</h1><p>Start a notebook with a page style ready to go.</p>
      <div className="library-grid">{templates.map((template) => <article className="library-card template-card" key={template.name}>
        <div className={`template-preview note-page-${template.background}`}><FileText size={26} /></div><h2>{template.name}</h2><p>{template.description}</p>
        <button className="primary-button" onClick={() => { createNotebook(template.name); const state = useDocumentStore.getState(); const page = state.notebook?.pages[0]; if (page) setPageBackground(page.id, template.background); useUIStore.getState().setActiveSection('notes') }}>Use template</button>
      </article>)}</div>
    </section></main>
  }

  if (activeSection === 'settings') {
    return <main className="workspace"><section className="section-page">
      <h1>Settings</h1><p>Manage your local Medico Notes workspace.</p>
      <article className="settings-card"><div className="settings-row"><div><strong>Storage</strong><p>Your notebooks are saved in this browser on this device.</p></div><Check size={18} /></div>
        <div className="settings-row"><div><strong>Notebook count</strong><p>{notebooks.length} {notebooks.length === 1 ? 'notebook' : 'notebooks'} · {folders.length} {folders.length === 1 ? 'folder' : 'folders'}</p></div><BookOpen size={18} /></div>
      </article>
    </section></main>
  }

  if (!notebook) return <main className="workspace"><div className="workspace-empty-state"><div className="workspace-icon">M</div><h1>Welcome to Medico Notes</h1><p>Create a note and start writing, drawing, or adding documents.</p><button className="create-note-button" onClick={() => createNotebook()}>Create your first note</button></div></main>
  return <main className="workspace"><PageNavigator /><PagePanel /></main>
}

export default Workspace
