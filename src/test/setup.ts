import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

beforeEach(() => {
  if (typeof window === 'undefined') return
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(cleanup)
