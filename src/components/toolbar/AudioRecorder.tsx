import { useEffect, useRef, useState } from 'react'
import { Download, FileUp, Mic, Pencil, Square, Trash2, X } from 'lucide-react'
import { deleteAudioRecording, listAudioRecordings, saveAudioRecording, type AudioRecording } from '../../utils/audioStorage'
import { useDocumentStore } from '../../stores/documentStore'
import { usePageStore } from '../../stores/pageStore'

interface Props { notebookId: string | null; notebookTitle: string }

function getCurrentTimestamp() {
  return Date.now()
}

function AudioRecorder({ notebookId, notebookTitle }: Props) {
  const [recordings, setRecordings] = useState<AudioRecording[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [playbackRates, setPlaybackRates] = useState<Record<string, number>>({})
  const [recordingUrls, setRecordingUrls] = useState<Record<string, string>>({})
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const urlsRef = useRef(new Map<string, string>())
  const audioElementsRef = useRef(new Map<string, HTMLAudioElement>())
  const pendingSeekRef = useRef<{ recordingId: string; seconds: number } | null>(null)
  const audioContainerRef = useRef<HTMLDivElement>(null)
  const audioFileInputRef = useRef<HTMLInputElement>(null)
  const startedAtRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    if (!notebookId) { setRecordings([]); return }
    void listAudioRecordings(notebookId).then((items) => {
      if (!cancelled) {
        const urls: Record<string, string> = {}
        for (const recording of items) {
          const url = URL.createObjectURL(recording.blob)
          urlsRef.current.set(recording.id, url)
          urls[recording.id] = url
        }
        setRecordingUrls(urls)
        setRecordings(items)
      }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load recordings.')
    })
    return () => { cancelled = true }
  }, [notebookId])

  useEffect(() => {
    const closeAudio = () => setIsOpen(false)
    window.addEventListener('freenotes-close-audio', closeAudio)
    return () => window.removeEventListener('freenotes-close-audio', closeAudio)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!audioContainerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [isOpen])

  useEffect(() => {
    if (!isRecording) return
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [isRecording])

  useEffect(() => () => {
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const applyPendingSeek = () => {
    const pending = pendingSeekRef.current
    if (!pending) return
    const audio = audioElementsRef.current.get(pending.recordingId)
    if (!audio) return
    const seekAndPlay = () => {
      if (pendingSeekRef.current !== pending) return
      pendingSeekRef.current = null
      try {
        audio.currentTime = Math.max(0, pending.seconds)
        void audio.play().catch(() => setError('Unable to start audio playback.'))
      } catch {
        setError('Unable to seek in this recording.')
      }
    }
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) seekAndPlay()
    else audio.addEventListener('loadedmetadata', seekAndPlay, { once: true })
  }

  useEffect(() => {
    if (isOpen) applyPendingSeek()
  }, [isOpen, recordings])

  useEffect(() => {
    const handleAudioSeek = (event: Event) => {
      const detail = (event as CustomEvent<{ notebookId: string; timestamp: number }>).detail
      if (detail.notebookId !== notebookId) return
      window.dispatchEvent(new Event('freenotes-close-search'))
      const recording = recordings
        .filter((item) => item.createdAt <= detail.timestamp)
        .sort((a, b) => b.createdAt - a.createdAt)[0]
      if (!recording) return
      pendingSeekRef.current = {
        recordingId: recording.id,
        seconds: (detail.timestamp - recording.createdAt) / 1000,
      }
      setIsOpen(true)
      if (isOpen) applyPendingSeek()
    }
    window.addEventListener('freenotes-audio-seek', handleAudioSeek)
    return () => window.removeEventListener('freenotes-audio-seek', handleAudioSeek)
  }, [isOpen, notebookId, recordings])

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

  const startRecording = async () => {
    if (!notebookId) return
    window.dispatchEvent(new Event('freenotes-close-search'))
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        if (!blob.size) return
        const recording: AudioRecording = { id: crypto.randomUUID(), notebookId, title: `Recording ${new Date(startedAtRef.current).toLocaleString()}`, createdAt: startedAtRef.current, blob }
      void saveAudioRecording(recording).then(() => {
        registerRecordingUrl(recording)
        setRecordings((current) => [...current, recording])
      }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to save recording.'))
      }
      startedAtRef.current = getCurrentTimestamp()
      setElapsed(0)
      recorder.start(1000)
      setIsRecording(true)
      setIsOpen(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Microphone access failed.')
    }
  }

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    setIsRecording(false)
  }

  const importAudioFile = async (file: File | undefined) => {
    if (!file || !notebookId) return
    const supportedAudioFile = file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|oga|ogg|opus|webm|flac|aiff?)$/i.test(file.name)
    if (!supportedAudioFile) {
      setError('Choose a supported audio file.')
      return
    }

    window.dispatchEvent(new Event('freenotes-close-search'))
    setError(null)
    const recording: AudioRecording = {
      id: crypto.randomUUID(),
      notebookId,
      title: file.name,
      createdAt: getCurrentTimestamp(),
      blob: file,
    }

    try {
      await saveAudioRecording(recording)
      registerRecordingUrl(recording)
      setRecordings((current) => [...current, recording].sort((a, b) => a.createdAt - b.createdAt))
      setIsOpen(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to import this audio file.')
    }
  }

  const registerRecordingUrl = (recording: AudioRecording) => {
    const existing = urlsRef.current.get(recording.id)
    if (existing) return existing
    const url = URL.createObjectURL(recording.blob)
    urlsRef.current.set(recording.id, url)
    setRecordingUrls((current) => ({ ...current, [recording.id]: url }))
    return url
  }

  const downloadRecording = (recording: AudioRecording) => {
    const safeTitle = recording.title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Audio recording'
    const hasExtension = /\.[a-z0-9]{2,5}$/i.test(safeTitle)
    const mimeExtension: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/aac': 'aac',
    }
    const extension = mimeExtension[recording.blob.type] ?? 'webm'
    const link = document.createElement('a')
    link.href = urlsRef.current.get(recording.id) ?? registerRecordingUrl(recording)
    link.download = hasExtension ? safeTitle : `${safeTitle}.${extension}`
    link.hidden = true
    document.body.append(link)
    link.click()
    link.remove()
  }

  const syncPlayback = (recording: AudioRecording, currentTime: number, playing: boolean) => {
    const timestamp = recording.createdAt + currentTime * 1000
    window.dispatchEvent(new CustomEvent('freenotes-audio-playhead', {
      detail: { notebookId: recording.notebookId, timestamp, playing },
    }))

    if (!playing) return
    const notebook = useDocumentStore.getState().notebook
    if (!notebook || notebook.id !== recording.notebookId) return

    let nearestPageId: string | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const page of notebook.pages) {
      for (const element of page.elements) {
        if (element.type !== 'stroke' || element.points.length === 0) continue
        const timedPoints = element.points
          .map((point) => point.timestamp)
          .filter((value): value is number => typeof value === 'number')
        if (timedPoints.length === 0) continue
        const first = Math.min(...timedPoints)
        const last = Math.max(...timedPoints)
        const distance = timestamp < first ? first - timestamp : timestamp > last ? timestamp - last : 0
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestPageId = page.id
        }
      }
    }
    // Page changes follow the recording only while the playhead is near a stroke.
    if (nearestPageId && nearestDistance <= 1500 && usePageStore.getState().activePageId !== nearestPageId) {
      usePageStore.getState().setActivePage(nearestPageId)
    }
  }

  const removeRecording = async (recording: AudioRecording) => {
    await deleteAudioRecording(recording.id)
    const url = urlsRef.current.get(recording.id)
    if (url) URL.revokeObjectURL(url)
    urlsRef.current.delete(recording.id)
    setRecordingUrls((current) => {
      const next = { ...current }
      delete next[recording.id]
      return next
    })
    setRecordings((current) => current.filter((item) => item.id !== recording.id))
  }

  const renameRecording = async (recording: AudioRecording) => {
    const title = window.prompt('Rename recording', recording.title)
    const trimmedTitle = title?.trim()
    if (!trimmedTitle || trimmedTitle === recording.title) return
    const updatedRecording = { ...recording, title: trimmedTitle }
    try {
      await saveAudioRecording(updatedRecording)
      setRecordings((current) => current.map((item) => item.id === recording.id ? updatedRecording : item))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to rename this recording.')
    }
  }

  return <div className={`audio-recorder${isRecording ? ' is-recording' : ''}`} ref={audioContainerRef}>
    <button className={`toolbar-button ${isRecording ? 'toolbar-button-active' : ''}`} aria-label={isRecording ? 'Stop audio recording' : 'Record audio'} title={isRecording ? 'Stop recording' : 'Record audio'} onClick={() => { if (isRecording) stopRecording(); else void startRecording() }} disabled={!notebookId}>
      {isRecording ? <Square size={17} fill="currentColor" /> : <Mic size={18} />}
    </button>
    {isRecording && <span className="audio-timer">{formatTime(elapsed)}</span>}
    {isOpen && <div className="audio-popover">
      <div className="audio-popover-header"><strong>{notebookTitle} audio</strong><div className="audio-popover-actions"><button className="icon-button" aria-label="Import audio file" title="Import audio file" onClick={() => audioFileInputRef.current?.click()}><FileUp size={16} /></button><button className="icon-button" aria-label="Close recordings" onClick={() => setIsOpen(false)}><X size={16} /></button></div></div>
      <input ref={audioFileInputRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.oga,.ogg,.opus,.webm,.flac,.aiff,.aif" hidden onChange={(event) => { void importAudioFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
      {error && <p className="audio-error" role="alert">{error}</p>}
      {isRecording && <div className="recording-status"><span className="recording-dot" /> Recording · {formatTime(elapsed)} <button onClick={stopRecording}>Stop</button></div>}
      {recordings.length === 0 && !isRecording ? <p className="audio-empty">No recordings for this notebook yet.</p> : recordings.map((recording) => <div className="audio-recording" key={recording.id}>
        <div className="audio-recording-title"><span>{recording.title}</span><small>{new Date(recording.createdAt).toLocaleDateString()}</small></div>
        <audio
          controls
          preload="none"
          src={recordingUrls[recording.id]}
          ref={(element) => {
            if (element) audioElementsRef.current.set(recording.id, element)
            else audioElementsRef.current.delete(recording.id)
          }}
          onPlay={(event) => syncPlayback(recording, event.currentTarget.currentTime, true)}
          onTimeUpdate={(event) => syncPlayback(recording, event.currentTarget.currentTime, true)}
          onPause={(event) => syncPlayback(recording, event.currentTarget.currentTime, false)}
          onEnded={(event) => syncPlayback(recording, event.currentTarget.currentTime, false)}
        />
        <label className="audio-speed-control">
          <span>Speed</span>
          <select
            aria-label={`Playback speed for ${recording.title}`}
            value={playbackRates[recording.id] ?? 1}
            onChange={(event) => {
              const rate = Number(event.currentTarget.value)
              setPlaybackRates((current) => ({ ...current, [recording.id]: rate }))
              const audio = audioElementsRef.current.get(recording.id)
              if (audio) audio.playbackRate = rate
            }}
          >
            <option value={0.5}>0.5×</option>
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>
        </label>
        <button className="icon-button" aria-label={`Rename ${recording.title}`} title="Rename recording" onClick={() => void renameRecording(recording)}><Pencil size={15} /></button>
        <button className="icon-button" aria-label={`Download ${recording.title}`} title="Download recording" onClick={() => downloadRecording(recording)}><Download size={15} /></button>
        <button className="icon-button danger-icon" aria-label={`Delete ${recording.title}`} title="Delete recording" onClick={() => void removeRecording(recording)}><Trash2 size={15} /></button>
      </div>)}
      <p className="audio-note">Recordings are saved in this browser on this device.</p>
    </div>}
  </div>
}

export default AudioRecorder
