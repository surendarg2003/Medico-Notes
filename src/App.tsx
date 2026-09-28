import Sidebar from './components/sidebar/Sidebar'
import TopToolbar from './components/toolbar/TopToolbar'
import Workspace from './components/editor/Workspace'

function App() {
  return (
    <div className="app-shell">
      <Sidebar />

      <div className="app-main">
        <TopToolbar />
        <Workspace />
      </div>
    </div>
  )
}

export default App