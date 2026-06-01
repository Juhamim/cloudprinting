'use client'
import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Printer } from '@prisma/client'

const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function FileUpload({ printers }: { printers: Printer[] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<'idle' | 'uploading' | 'queuing' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [options, setOptions] = useState({
    printerId: printers[0]?.id || '',
    copies: 1,
    colorMode: 'MONOCHROME',
    paperSize: 'A4',
    orientation: 'PORTRAIT',
    priority: 'NORMAL',
  })

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) {
      setFile(dropped)
      setProgress('idle')
      setErrorMsg('')
    }
  }, [])

  async function handlePrint() {
    if (!file) return
    setUploading(true)
    setErrorMsg('')
    setProgress('uploading')

    try {
      // Step 1: Upload file to R2
      const formData = new FormData()
      formData.append('file', file)
      const uploadRes = await fetch('/api/files/upload', { method: 'POST', body: formData })
      const uploaded = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploaded.error || 'Upload failed')

      // Step 2: Create print job
      setProgress('queuing')
      const jobRes = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: file.name,
          fileUrl: uploaded.url,
          fileKey: uploaded.key,
          fileType: file.type,
          fileSize: file.size,
          ...options,
          copies: Number(options.copies),
        }),
      })
      const job = await jobRes.json()
      if (!jobRes.ok) throw new Error(job.error || 'Failed to create job')

      setProgress('done')
      setTimeout(() => {
        setFile(null)
        setProgress('idle')
        router.refresh()
      }, 1500)
    } catch (err: unknown) {
      setProgress('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setUploading(false)
    }
  }

  const selectedPrinter = printers.find(p => p.id === options.printerId)
  const isPrinterOnline = selectedPrinter?.status === 'ONLINE'

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !file && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
          file ? 'cursor-default' :
          dragging ? 'border-blue-500 bg-blue-500/5 cursor-copy' :
          'border-zinc-700 hover:border-zinc-500 cursor-pointer'
        }`}
      >
        <input
          ref={inputRef}
          id="file-upload-input"
          type="file"
          className="hidden"
          accept={ACCEPT}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) { setFile(f); setProgress('idle'); setErrorMsg('') }
          }}
        />

        {progress === 'done' ? (
          <div className="animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-green-400/10 border border-green-400/30 flex items-center justify-center text-2xl mx-auto mb-3">✓</div>
            <div className="text-green-400 font-semibold">Job queued successfully!</div>
            <div className="text-zinc-500 text-sm mt-1">Your printer will start shortly</div>
          </div>
        ) : file ? (
          <div>
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl mx-auto mb-3">📄</div>
            <div className="font-medium text-white">{file.name}</div>
            <div className="text-sm text-zinc-500 mt-1">{formatBytes(file.size)}</div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); setProgress('idle') }}
              className="mt-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors underline underline-offset-2"
            >
              Remove file
            </button>
          </div>
        ) : (
          <div>
            <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center text-3xl mx-auto mb-4">
              📤
            </div>
            <div className="text-zinc-300 font-medium">Drop your file here</div>
            <div className="text-zinc-600 text-sm mt-1">or <span className="text-blue-400 hover:text-blue-300">click to browse</span></div>
            <div className="text-zinc-700 text-xs mt-3">PDF · Word · JPEG · PNG · TXT — max 50 MB</div>
          </div>
        )}
      </div>

      {/* Print options grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {/* Printer */}
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-zinc-400 text-xs font-medium mb-1.5">Printer</label>
          <select
            value={options.printerId}
            onChange={(e) => setOptions({ ...options, printerId: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
          >
            {printers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.status}
              </option>
            ))}
          </select>
          {!isPrinterOnline && selectedPrinter && (
            <p className="text-xs text-yellow-500 mt-1">⚠️ Printer is {selectedPrinter.status.toLowerCase()}</p>
          )}
        </div>

        {/* Copies */}
        <div>
          <label className="block text-zinc-400 text-xs font-medium mb-1.5">Copies</label>
          <input
            type="number"
            min={1}
            max={99}
            value={options.copies}
            onChange={(e) => setOptions({ ...options, copies: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Color */}
        <div>
          <label className="block text-zinc-400 text-xs font-medium mb-1.5">Color mode</label>
          <select
            value={options.colorMode}
            onChange={(e) => setOptions({ ...options, colorMode: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="MONOCHROME">Black &amp; White</option>
            <option value="COLOR">Color</option>
          </select>
        </div>

        {/* Paper size */}
        <div>
          <label className="block text-zinc-400 text-xs font-medium mb-1.5">Paper size</label>
          <select
            value={options.paperSize}
            onChange={(e) => setOptions({ ...options, paperSize: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="A4">A4</option>
            <option value="A3">A3</option>
            <option value="LETTER">Letter</option>
            <option value="LEGAL">Legal</option>
          </select>
        </div>

        {/* Orientation */}
        <div>
          <label className="block text-zinc-400 text-xs font-medium mb-1.5">Orientation</label>
          <select
            value={options.orientation}
            onChange={(e) => setOptions({ ...options, orientation: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="PORTRAIT">Portrait</option>
            <option value="LANDSCAPE">Landscape</option>
          </select>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-zinc-400 text-xs font-medium mb-1.5">Priority</label>
          <select
            value={options.priority}
            onChange={(e) => setOptions({ ...options, priority: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
      </div>

      {/* Error message */}
      {errorMsg && (
        <div className="flex items-start gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
          <span className="shrink-0">⚠️</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Progress indicator */}
      {uploading && (
        <div className="flex items-center gap-3 text-sm text-zinc-400 bg-zinc-800 rounded-xl px-4 py-3">
          <span className="w-4 h-4 border-2 border-zinc-600 border-t-blue-400 rounded-full animate-spin shrink-0" />
          {progress === 'uploading' ? 'Uploading file to secure storage…' : 'Queuing print job…'}
        </div>
      )}

      {/* Submit button */}
      <button
        id="print-submit-btn"
        onClick={handlePrint}
        disabled={!file || uploading || progress === 'done'}
        className="w-full bg-blue-500 hover:bg-blue-600 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold transition-all duration-150 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6,9 6,2 18,2 18,9"/>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>
        Print now
      </button>
    </div>
  )
}
