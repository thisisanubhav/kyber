import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App, { BOOKING_URL } from './App'

function renderPath(path) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

describe('marketing conversion paths', () => {
  it('puts the canonical booking action beside the homepage value proposition', () => {
    renderPath('/')
    const heroLink = screen.getAllByRole('link', { name: /book a call/i })[0]
    expect(heroLink).toHaveAttribute('href', BOOKING_URL)
    expect(screen.getByRole('button', { name: 'Send →' })).toBeDisabled()
  })

  it('opens keyboard-operable navigation and enables chat only after text is entered', async () => {
    const user = userEvent.setup()
    renderPath('/')
    const industries = screen.getByRole('button', { name: /industries/i })
    await user.click(industries)
    expect(industries).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Aviation' })).toHaveAttribute('href', '/industries/aviation')

    await user.type(screen.getByLabelText('Message Kyber AI'), 'Coordinate turnaround crews')
    expect(screen.getByRole('button', { name: 'Send →' })).toBeEnabled()
  })

  it('makes the career video optional while retaining file constraints', async () => {
    const user = userEvent.setup()
    renderPath('/careers')
    const roleSummary = screen.getByText('Optimization Engineer')
    await user.click(roleSummary)
    const role = roleSummary.closest('details')

    const video = within(role).getByLabelText(/one-minute introduction/i)
    const cv = within(role).getByLabelText(/CV/i)
    expect(video).not.toBeRequired()
    expect(video).toHaveAttribute('accept', 'video/mp4,video/quicktime,video/webm')
    expect(cv).toBeRequired()
    expect(cv).toHaveAttribute('accept', '.pdf,.doc,.docx')
    expect(within(role).getByText(/You can also share this later/i)).toBeInTheDocument()

    fireEvent.change(video, { target: { files: [{ type: 'video/mp4', size: 51 * 1024 * 1024 }] } })
    expect(within(role).getByRole('alert')).toHaveTextContent('50 MB or smaller')
  })

  it('changes aviation operating-model content through accessible tabs', async () => {
    const user = userEvent.setup()
    renderPath('/industries/aviation')
    const taskTab = screen.getByRole('tab', { name: 'Task-based' })
    await user.click(taskTab)
    expect(taskTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: /best available person/i })).toBeInTheDocument()
  })

  it('reopens and saves cookie preferences', async () => {
    const user = userEvent.setup()
    renderPath('/cookies')
    await user.click(screen.getByRole('button', { name: 'Open cookie settings' }))
    expect(screen.getByRole('dialog', { name: 'Cookie preferences' })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Analytics' }))
    await user.click(screen.getByRole('button', { name: 'Save preferences' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('kyber-cookie-preferences')).analytics).toBe(true)
  })
})
