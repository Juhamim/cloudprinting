'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { PrinterStatus, ColorMode, PaperSize, Orientation, Priority } from '@prisma/client'

interface PublicPrinter {
  id: string
  name: string
  status: PrinterStatus
  description: string | null
}

const FILE_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'image/jpeg': '🖼️',
  'image/png': '🖼️',
  'image/webp': '🖼️',
  'text/plain': '📃',
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function HomePage() {
  const [printers, setPrinters] = useState<PublicPrinter[]>([])
  const [loadingPrinters, setLoadingPrinters] = useState(true)
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false)

  // Form states
  const [selectedPrinterId, setSelectedPrinterId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [copies, setCopies] = useState(1)
  const [colorMode, setColorMode] = useState<ColorMode>('MONOCHROME')
  const [paperSize, setPaperSize] = useState<PaperSize>('A4')
  const [orientation, setOrientation] = useState<Orientation>('PORTRAIT')
  const [priority, setPriority] = useState<Priority>('NORMAL')
  const [pages, setPages] = useState('')
  const [pagesPerSheet, setPagesPerSheet] = useState(1)

  // UI/Action states
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Fetch public printers and check session on mount
  useEffect(() => {
    async function init() {
      try {
        // Fetch public printers
        const printersRes = await fetch('/api/printers/public')
        if (printersRes.ok) {
          const data = await printersRes.json()
          setPrinters(data)
          if (data.length > 0) {
            // Select first online printer if possible, otherwise first printer
            const online = data.find((p: PublicPrinter) => p.status === 'ONLINE')
            setSelectedPrinterId(online ? online.id : data[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to load printers', err)
      } finally {
        setLoadingPrinters(false)
      }

      try {
        // Fetch session to check if admin is logged in
        const sessionRes = await fetch('/api/auth/session')
        if (sessionRes.ok) {
          const session = await sessionRes.json()
          if (session && session.user) {
            setIsAdminLoggedIn(true)
          }
        }
      } catch (err) {
        console.error('Failed to load session', err)
      }
    }

    init()
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0] || null
    setError('')
    if (selectedFile) {
      const allowedTypes = Object.keys(FILE_ICONS)
      if (!allowedTypes.includes(selectedFile.type)) {
        setError('Unsupported file type. Please upload a PDF, Word doc, JPEG, PNG, or TXT.')
        setFile(null)
        return
      }
      if (selectedFile.size > 50 * 1024 * 1024) {
        setError('File is too large. Maximum size is 50 MB.')
        setFile(null)
        return
      }
      setFile(selectedFile)
    }
  }

  async function handlePrint(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Please select a document to print.')
      return
    }
    if (!selectedPrinterId) {
      setError('Please select a printer.')
      return
    }

    setSubmitting(true)
    setError('')
    setUploadProgress('Uploading file to secure storage…')

    try {
      // 1. Upload the file
      const formData = new FormData()
      formData.append('file', file)

      const uploadRes = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadRes.ok) {
        const uploadData = await uploadRes.json()
        throw new Error(uploadData.error || 'Upload failed')
      }

      const { url, key, size, type } = await uploadRes.json()
      setUploadProgress('Creating print job and dispatching…')

      // 2. Submit the print job
      const jobRes = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: file.name,
          fileUrl: url,
          fileKey: key,
          fileType: type,
          fileSize: size,
          printerId: selectedPrinterId,
          copies,
          colorMode,
          paperSize,
          orientation,
          priority,
          pages: pages || null,
          pagesPerSheet,
        }),
      })

      if (!jobRes.ok) {
        const jobData = await jobRes.json()
        throw new Error(jobData.error || 'Failed to queue print job')
      }

      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setSubmitting(false)
      setUploadProgress('')
    }
  }

  function resetForm() {
    setFile(null)
    setCopies(1)
    setColorMode('MONOCHROME')
    setPaperSize('A4')
    setOrientation('PORTRAIT')
    setPriority('NORMAL')
    setPages('')
    setPagesPerSheet(1)
    setSuccess(false)
    setError('')
  }

  const selectedPrinter = printers.find((p) => p.id === selectedPrinterId)

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative overflow-hidden">
      {/* Background glow orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/3 right-0 w-80 h-80 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
        />
      </div>

      {/* Top Navbar */}
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between border-b border-zinc-900 z-10">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold tracking-tight">
            Cloud<span className="gradient-text">Print</span>
          </span>
        </Link>
        {isAdminLoggedIn && (
          <div>
            <Link
              href="/dashboard"
              className="bg-blue-500 hover:bg-blue-600 active:scale-95 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 shadow-lg shadow-blue-500/25"
            >
              Admin Dashboard
            </Link>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-12 md:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center z-10">
        
        {/* Left Side: Hero Info */}
        <section className="lg:col-span-6 space-y-6 text-left">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-xs font-semibold text-blue-400">
            <span className="w-2 h-2 bg-blue-400 rounded-full status-online" />
            Guest Print Center Enabled
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
            Print instantly <br />
            <span className="gradient-text">without logging in</span>
          </h1>

          <p className="text-lg text-zinc-400 leading-relaxed max-w-lg">
            Need to print something quickly? Upload your documents directly, select any online printer, and print instantly. No registration or account required.
          </p>

          {/* Simple Steps */}
          <div className="space-y-4 pt-4 border-t border-zinc-900 max-w-md">
            {[
              { num: '1', title: 'Upload your document', desc: 'Drag in PDFs, Word docs, photos, or text files.' },
              { num: '2', title: 'Choose a printer', desc: 'Select any active printer connected to the network.' },
              { num: '3', title: 'Collect your printout', desc: 'Jobs are dispatched immediately to the physical printer.' }
            ].map((step) => (
              <div key={step.num} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-500 text-sm font-bold flex items-center justify-center shrink-0">
                  {step.num}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{step.title}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right Side: Print Panel Glass Card */}
        <section className="lg:col-span-6 flex justify-center">
          <div className="w-full max-w-md glass rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden animate-slide-up">
            
            {success ? (
              /* Success Screen */
              <div className="text-center py-8 space-y-6 animate-fade-in">
                <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 text-green-400 rounded-full flex items-center justify-center text-3xl mx-auto">
                  ✓
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-white">Document Sent to Printer!</h2>
                  <p className="text-zinc-400 text-sm max-w-xs mx-auto">
                    Your file <span className="text-zinc-300 font-medium break-all">&quot;{file?.name}&quot;</span> has been successfully queued and sent to <span className="text-zinc-300 font-medium">&quot;{selectedPrinter?.name}&quot;</span>.
                  </p>
                </div>

                <div className="bg-zinc-950/60 rounded-2xl p-4 text-left text-xs text-zinc-500 space-y-2.5 max-w-sm mx-auto border border-zinc-900">
                  <div className="flex justify-between"><span className="text-zinc-600">Printer:</span> <span className="text-zinc-300 font-medium">{selectedPrinter?.name}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-600">Copies:</span> <span className="text-zinc-300 font-medium">{copies}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-600">Options:</span> <span className="text-zinc-300 font-medium">{paperSize} · {colorMode === 'COLOR' ? 'Color' : 'B&W'} · {orientation.toLowerCase()}</span></div>
                </div>

                <button
                  onClick={resetForm}
                  className="w-full bg-blue-500 hover:bg-blue-600 active:scale-95 text-white py-3.5 rounded-xl font-semibold transition-all duration-150"
                >
                  Print another document
                </button>
              </div>
            ) : (
              /* Printing Form */
              <form onSubmit={handlePrint} className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-white mb-1">Print Document</h2>
                  <p className="text-zinc-500 text-xs">Configure your print and upload your file below.</p>
                </div>

                {error && (
                  <div className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3 flex gap-2">
                    <span>⚠️</span>
                    <span className="flex-1 leading-relaxed">{error}</span>
                  </div>
                )}

                {/* Printer Selector */}
                <div>
                  <label className="block text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-2">Select Printer</label>
                  {loadingPrinters ? (
                    <div className="h-12 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
                  ) : printers.length === 0 ? (
                    <div className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-4 text-center text-xs text-zinc-600">
                      No printers available. Contact the administrator.
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedPrinterId}
                        onChange={(e) => setSelectedPrinterId(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all appearance-none cursor-pointer"
                      >
                        {printers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.status === 'ONLINE' ? 'Online' : p.status === 'BUSY' ? 'Busy' : 'Offline'})
                          </option>
                        ))}
                      </select>
                      
                      {/* Custom dropdown arrow */}
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                        ▼
                      </div>
                    </div>
                  )}

                  {/* Printer description / status */}
                  {selectedPrinter && (
                    <div className="mt-2 flex items-center justify-between text-xs px-1">
                      <span className="text-zinc-500 truncate max-w-[70%]">{selectedPrinter.description || 'No description'}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          selectedPrinter.status === 'ONLINE' ? 'bg-green-400 status-online' :
                          selectedPrinter.status === 'BUSY' ? 'bg-orange-400 status-online' :
                          'bg-zinc-600'
                        }`} />
                        <span className={`font-medium ${
                          selectedPrinter.status === 'ONLINE' ? 'text-green-400' :
                          selectedPrinter.status === 'BUSY' ? 'text-orange-400' :
                          'text-zinc-500'
                        }`}>{selectedPrinter.status}</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* File Dropzone */}
                <div>
                  <label className="block text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-2">Upload Document</label>
                  
                  {file ? (
                    /* Selected file panel */
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xl shrink-0">
                        {FILE_ICONS[file.type] || '📄'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate" title={file.name}>
                          {file.name}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">{formatBytes(file.size)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFile(null)}
                        className="text-xs text-zinc-500 hover:text-red-400 transition-colors font-medium shrink-0 px-2.5 py-1.5 hover:bg-red-500/10 rounded-lg"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    /* Drag drop zone */
                    <label className="border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950/40 hover:bg-zinc-900/20 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group relative">
                      <input
                        type="file"
                        onChange={handleFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        accept={Object.keys(FILE_ICONS).join(',')}
                      />
                      <span className="text-3xl mb-3 group-hover:scale-110 transition-transform">📤</span>
                      <span className="text-sm font-semibold text-zinc-300">Click to upload file</span>
                      <span className="text-xs text-zinc-600 mt-1 max-w-[200px] leading-relaxed">
                        PDF, Word, JPEG, PNG, or TXT up to 50 MB
                      </span>
                    </label>
                  )}
                </div>

                {/* Print Options Accordion */}
                <div className="border-t border-zinc-900 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between text-xs text-zinc-500 font-semibold uppercase tracking-wider py-1 hover:text-zinc-300 transition-colors"
                  >
                    <span>Print Options</span>
                    <span>{showAdvanced ? '▲ Hide' : '▼ Show Options'}</span>
                  </button>

                  {showAdvanced && (
                    <div className="grid grid-cols-2 gap-3 mt-3 animate-fade-in text-sm">
                      {/* Copies */}
                      <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl px-3 py-2">
                        <label className="block text-xs text-zinc-500 mb-1">Copies</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={copies}
                          onChange={(e) => setCopies(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                          className="w-full bg-transparent text-white font-semibold focus:outline-none"
                        />
                      </div>

                      {/* Color Mode */}
                      <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl px-3 py-2">
                        <label className="block text-xs text-zinc-500 mb-1">Color Mode</label>
                        <select
                          value={colorMode}
                          onChange={(e) => setColorMode(e.target.value as ColorMode)}
                          className="w-full bg-transparent text-white font-semibold focus:outline-none appearance-none"
                        >
                          <option value="MONOCHROME">Black & White</option>
                          <option value="COLOR">Color</option>
                        </select>
                      </div>

                      {/* Paper Size */}
                      <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl px-3 py-2">
                        <label className="block text-xs text-zinc-500 mb-1">Paper Size</label>
                        <select
                          value={paperSize}
                          onChange={(e) => setPaperSize(e.target.value as PaperSize)}
                          className="w-full bg-transparent text-white font-semibold focus:outline-none appearance-none"
                        >
                          <option value="A4">A4</option>
                          <option value="LETTER">Letter</option>
                          <option value="A3">A3</option>
                          <option value="LEGAL">Legal</option>
                        </select>
                      </div>

                      {/* Orientation */}
                      <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl px-3 py-2">
                        <label className="block text-xs text-zinc-500 mb-1">Orientation</label>
                        <select
                          value={orientation}
                          onChange={(e) => setOrientation(e.target.value as Orientation)}
                          className="w-full bg-transparent text-white font-semibold focus:outline-none appearance-none"
                        >
                          <option value="PORTRAIT">Portrait</option>
                          <option value="LANDSCAPE">Landscape</option>
                        </select>
                      </div>

                      {/* Pages per Sheet */}
                      <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl px-3 py-2">
                        <label className="block text-xs text-zinc-500 mb-1">Pages per Sheet</label>
                        <select
                          value={pagesPerSheet}
                          onChange={(e) => setPagesPerSheet(parseInt(e.target.value) || 1)}
                          className="w-full bg-transparent text-white font-semibold focus:outline-none appearance-none"
                        >
                          <option value="1">1 page</option>
                          <option value="2">2 pages</option>
                          <option value="4">4 pages</option>
                          <option value="6">6 pages</option>
                          <option value="9">9 pages</option>
                          <option value="16">16 pages</option>
                        </select>
                      </div>

                      {/* Page selection range */}
                      <div className="col-span-2 bg-zinc-900/40 border border-zinc-900 rounded-xl px-3 py-2">
                        <label className="block text-xs text-zinc-500 mb-1">Page Range Selection</label>
                        <input
                          type="text"
                          placeholder="e.g. 1-3, 5 or empty for all"
                          value={pages}
                          onChange={(e) => setPages(e.target.value)}
                          className="w-full bg-transparent text-white font-semibold focus:outline-none placeholder-zinc-700"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Submitting Status / Submit Button */}
                {submitting ? (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center gap-3">
                    <span className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin shrink-0" />
                    <span className="text-xs text-zinc-300 font-medium">{uploadProgress}</span>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={!file || !selectedPrinterId}
                    className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 text-white py-3.5 rounded-xl font-semibold transition-all duration-150 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
                  >
                    <span>🖨️</span>
                    <span>Print Document</span>
                  </button>
                )}
              </form>
            )}
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto px-6 py-6 text-center text-xs text-zinc-600 border-t border-zinc-900 mt-auto">
        &copy; {new Date().getFullYear()} CloudPrint. Powered by WebSocket and Cloudflare R2.
      </footer>
    </div>
  )
}
