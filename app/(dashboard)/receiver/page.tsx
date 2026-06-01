'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { Printer, PrintJob } from '@prisma/client'

interface LogEntry {
  time: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

export default function WebReceiverPage() {
  const [printers, setPrinters] = useState<Printer[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [mockPrint, setMockPrint] = useState(false)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [activeJob, setActiveJob] = useState<PrintJob | null>(null)
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const isFetchingRef = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Fetch registered printers
  const fetchPrinters = useCallback(async () => {
    try {
      const res = await fetch('/api/printers')
      if (res.ok) {
        const data = await res.json()
        setPrinters(data)
        if (data.length > 0) {
          setSelectedAgentId(data[0].agentId)
        }
      }
    } catch (e) {
      addLog('Failed to fetch printers from server.', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrinters()
  }, [fetchPrinters])

  // Scroll to bottom of logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Log helper
  const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev, { time, message, type }])
  }

  // Clear logs
  const clearLogs = () => {
    setLogs([])
    addLog('Logs cleared.', 'info')
  }

  // Update status on server
  const updateJobStatus = async (jobId: string, status: string, error?: string) => {
    try {
      const res = await fetch('/api/receiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, status, error }),
      })
      if (!res.ok) {
        addLog(`Server failed to update job ${jobId} status to ${status}.`, 'error')
      }
    } catch (e: any) {
      addLog(`Failed to communicate job status update: ${e.message}`, 'error')
    }
  }

  // Core printing logic
  const handlePrintJob = async (job: PrintJob) => {
    setActiveJob(job)
    addLog(`▶ Processing print job: "${job.title}" (${job.id})`, 'info')
    
    // 1. Notify server we are processing
    await updateJobStatus(job.id, 'PROCESSING')
    
    try {
      // 2. Download the file
      addLog(`Downloading file from: ${job.fileUrl}...`, 'info')
      const res = await fetch(job.fileUrl, { mode: 'cors' })
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      
      const blob = await res.blob()
      addLog(`✓ Downloaded successfully (${(blob.size / 1024).toFixed(1)} KB)`, 'success')
      
      // 3. Update status to printing
      await updateJobStatus(job.id, 'PRINTING')
      
      if (mockPrint) {
        addLog(`[MOCK MODE] Simulating print for "${job.title}"...`, 'warning')
        await new Promise((resolve) => setTimeout(resolve, 3000))
        addLog(`✓ [MOCK MODE] Simulated print finished!`, 'success')
        await updateJobStatus(job.id, 'COMPLETED')
      } else {
        addLog(`Triggering print dialog...`, 'info')
        
        // Create Object URL to avoid iframe cross-origin printing restrictions
        const localUrl = URL.createObjectURL(blob)
        
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = 'none'
        iframe.src = localUrl
        
        document.body.appendChild(iframe)
        
        iframe.onload = () => {
          try {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
            addLog(`✓ Browser print dialog completed.`, 'success')
            updateJobStatus(job.id, 'COMPLETED')
          } catch (err: any) {
            addLog(`Print dialog error: ${err.message}`, 'error')
            updateJobStatus(job.id, 'FAILED', err.message)
          } finally {
            // Cleanup iframe and revoke object URL after a delay
            setTimeout(() => {
              document.body.removeChild(iframe)
              URL.revokeObjectURL(localUrl)
            }, 60000)
          }
        }
      }
    } catch (err: any) {
      addLog(`✗ Printing failed: ${err.message}`, 'error')
      if (err.message.includes('Failed to fetch')) {
        addLog('TIP: Ensure CORS policy is configured on your Cloudflare R2 bucket settings.', 'warning')
      }
      await updateJobStatus(job.id, 'FAILED', err.message)
    } finally {
      setActiveJob(null)
    }
  }

  // Poll handler
  const pollForJobs = useCallback(async () => {
    if (isFetchingRef.current || !selectedAgentId) return
    isFetchingRef.current = true

    try {
      const res = await fetch(`/api/receiver?agentId=${encodeURIComponent(selectedAgentId)}`)
      if (res.ok) {
        const { job } = await res.json()
        if (job) {
          addLog(`Job detected in queue!`, 'info')
          // Stop polling while processing this print job
          if (pollingRef.current) clearInterval(pollingRef.current)
          
          await handlePrintJob(job)
          
          // Resume polling if receiver is still marked active
          if (isActive) {
            pollingRef.current = setInterval(pollForJobs, 3000)
          }
        }
      } else {
        const errorData = await res.json()
        addLog(`Server polling error: ${errorData.error || res.statusText}`, 'error')
      }
    } catch (e: any) {
      addLog(`Connection error during heartbeat: ${e.message}`, 'error')
    } finally {
      isFetchingRef.current = false
    }
  }, [selectedAgentId, isActive, mockPrint])

  // Toggle receiver ON/OFF
  useEffect(() => {
    if (isActive && selectedAgentId) {
      addLog(`Receiver started for Agent ID: "${selectedAgentId}"`, 'success')
      addLog(`Polling server every 3 seconds for queued print jobs...`, 'info')
      
      // Initial poll
      pollForJobs()
      
      // Setup interval
      pollingRef.current = setInterval(pollForJobs, 3000)
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
        addLog('Receiver stopped.', 'warning')
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [isActive, selectedAgentId])

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Browser Print Receiver</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Turn this browser tab into a print agent. Keep this page open to receive and print documents.
        </p>
      </div>

      {loading ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 animate-pulse h-48" />
      ) : printers.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-2xl p-16 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <div className="text-zinc-300 font-semibold text-lg">No printers registered yet</div>
          <div className="text-zinc-500 text-sm mt-2 max-w-sm mx-auto leading-relaxed">
            You must register a printer on the <strong className="text-zinc-400">Printers</strong> page before you can activate the Web Receiver.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Panel */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6 h-fit">
            <h2 className="font-semibold text-white text-lg flex items-center gap-2">
              ⚙️ Settings
            </h2>

            {/* Select Printer */}
            <div className="space-y-2">
              <label className="block text-sm text-zinc-400">Select Printer Agent ID</label>
              <select
                disabled={isActive}
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
              >
                {printers.map((p) => (
                  <option key={p.id} value={p.agentId}>
                    {p.name} ({p.agentId})
                  </option>
                ))}
              </select>
            </div>

            {/* Mock Print Toggle */}
            <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
              <div>
                <label className="text-sm font-medium text-zinc-300 block">Mock Print Mode</label>
                <span className="text-xs text-zinc-500">Skip opening actual print dialog</span>
              </div>
              <button
                onClick={() => setMockPrint(!mockPrint)}
                className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none ${
                  mockPrint ? 'bg-amber-500' : 'bg-zinc-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    mockPrint ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Start/Stop Button */}
            <div className="border-t border-zinc-800 pt-6">
              <button
                onClick={() => setIsActive(!isActive)}
                className={`w-full py-4 rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-3 active:scale-[0.98] ${
                  isActive
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/10'
                    : 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/10'
                }`}
              >
                {isActive ? (
                  <>
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                    </span>
                    STOP RECEIVER
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    START RECEIVER
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Monitor Panel */}
          <div className="lg:col-span-2 flex flex-col space-y-6">
            {/* Status Panel */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                  isActive ? 'bg-green-500/10' : 'bg-zinc-800'
                }`}>
                  {isActive ? '🟢' : '⚪'}
                </div>
                <div>
                  <h3 className="font-semibold text-white">Status Monitor</h3>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    {isActive 
                      ? `Listening as "${selectedAgentId}"` 
                      : 'Inactive — click Start Receiver to go online'}
                  </p>
                </div>
              </div>
              
              {isActive && (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold px-3 py-1.5 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  ONLINE
                </div>
              )}
            </div>

            {/* Console Logs */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col h-[350px]">
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
                <span className="font-mono text-xs text-zinc-500 uppercase tracking-wider font-semibold">Receiver Console Logs</span>
                <button
                  onClick={clearLogs}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors font-medium"
                >
                  Clear Logs
                </button>
              </div>

              {/* Logger Screen */}
              <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-2.5">
                {logs.length === 0 ? (
                  <div className="text-zinc-600 italic h-full flex items-center justify-center">
                    No log entries. Click start to activate the receiver monitor.
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-zinc-600 shrink-0 select-none">[{log.time}]</span>
                      <span className={
                        log.type === 'success' ? 'text-green-400' :
                        log.type === 'warning' ? 'text-amber-400' :
                        log.type === 'error' ? 'text-red-400 font-semibold' :
                        'text-zinc-300'
                      }>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Cloudflare CORS Help */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-xs text-zinc-500 leading-relaxed">
              <strong className="text-zinc-300 font-semibold block mb-1">⚠️ Cloudflare R2 CORS Requirement</strong>
              To download documents directly in the browser for printing, you must enable CORS on your R2 bucket. In the Cloudflare R2 bucket Settings, add a CORS Policy allowing your domain:
              <pre className="bg-zinc-950 text-zinc-400 p-2.5 rounded-lg border border-zinc-800 mt-2 font-mono overflow-x-auto text-[10px]">
{`[
  {
    "AllowedOrigins": ["https://cloud-print-production.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"]
  }
]`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
