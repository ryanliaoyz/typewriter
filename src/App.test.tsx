import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the Typewriter heading', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Typewriter', level: 1 })).toBeInTheDocument()
  })

  it('makes clear that the editor is not implemented yet', () => {
    render(<App />)

    expect(
      screen.getByText('The editor and grammar checking are not available yet.'),
    ).toBeInTheDocument()
  })
})
