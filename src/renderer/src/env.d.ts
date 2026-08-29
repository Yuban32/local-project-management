/// <reference types="vite/client" />

import type { API } from '../../shared/api'

declare global {
  interface Window {
    api: API
  }
}

export {}
