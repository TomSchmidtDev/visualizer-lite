// Demo tour entry point (see tour/README.md).
import '../src/index.css'
import dataset from './data/demo.json'
import type { DemoDataset } from './data/types.js'
import { bootTour } from './boot.js'

void bootTour({
  root: document.getElementById('root')!,
  dataset: dataset as DemoDataset,
  base: import.meta.env.BASE_URL,
  search: window.location.search,
  navigatorLang: navigator.language,
})
