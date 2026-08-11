import { SOURCE_LANGUAGE_LABEL, SOURCE_LANGUAGES, type SourceLanguage } from '@shared/domain'
import { useMemo, useState } from 'react'

interface NewJobPageProps {
  onJobCreated: (id: string) => void
}

export function NewJobPage({ onJobCreated }: NewJobPageProps) {
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>('ja')
  const [selectedSourcePath, setSelectedSourcePath] = useState('')
  const [suggestedOutputPath, setSuggestedOutputPath] = useState('')
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const canCreate = useMemo(() => selectedSourcePath.length > 0 && !isBusy, [selectedSourcePath, isBusy])

  async function handleSelectFile() {
    setError('')
    const response = await window.subForge.files.selectMedia()
    if (!response.ok || !response.file) {
      setError(response.error ?? 'No file selected.')
      return
    }

    setSelectedSourcePath(response.file.sourcePath)
    setSuggestedOutputPath(response.file.suggestedOutputPath)
  }

  async function handleCreateJob() {
    setIsBusy(true)
    setError('')

    try {
      const response = await window.subForge.jobs.create({
        sourcePath: selectedSourcePath,
        sourceLanguage,
      })

      if (!response.ok || !response.job) {
        setError(response.error ?? 'Failed to create job.')
        return
      }

      onJobCreated(response.job.id)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h1>New Job</h1>
      </header>

      <div className="form-grid">
        <div className="form-row">
          <label>Media File</label>
          <button type="button" onClick={handleSelectFile}>
            Add File
          </button>
        </div>

        <div className="form-row">
          <label>Source Path</label>
          <input type="text" value={selectedSourcePath} readOnly placeholder="Select a media file." />
        </div>

        <div className="form-row">
          <label>Source Language</label>
          <select
            value={sourceLanguage}
            onChange={(event) => setSourceLanguage(event.target.value as SourceLanguage)}
          >
            {SOURCE_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {SOURCE_LANGUAGE_LABEL[lang]}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Output Path</label>
          <input type="text" value={suggestedOutputPath} readOnly placeholder="movie.ko.srt" />
        </div>

        <div className="form-row">
          <button type="button" disabled={!canCreate} onClick={handleCreateJob}>
            Create Job
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </section>
  )
}
