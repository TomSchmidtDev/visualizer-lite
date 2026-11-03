// Hosts the tour overlay next to the app routes. Extended in later tasks (runner, overlay).
import { useEffect, useState } from 'react'
import type { DemoDataset } from './data/types.js'
import { onToast } from './overlay/toast.js'

export interface TourShellProps {
  dataset: DemoDataset
  recordMode: boolean
  autoStart: boolean
}

export function TourShell(_props: TourShellProps) {
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => onToast(setToast), [])
  return toast ? <div id="tour-overlay"><div className="tour-toast" role="status">{toast}</div></div> : null
}
