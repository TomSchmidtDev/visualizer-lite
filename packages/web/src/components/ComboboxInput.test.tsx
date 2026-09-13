import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ComboboxInput from './ComboboxInput.js'

const suggestions = ['Starbucks', 'Stardust Coffee', 'Lavazza']

describe('ComboboxInput', () => {
  it('filters the dropdown by substring match while typing', async () => {
    const user = userEvent.setup()
    render(<ComboboxInput id="beanBrand" value="bucks" onChange={vi.fn()} suggestions={suggestions} clearLabel="Clear field" />)
    await user.click(screen.getByRole('combobox'))
    const options = screen.getAllByRole('option').map((el) => el.textContent)
    expect(options).toContain('Starbucks')
    expect(options).not.toContain('Lavazza')
  })

  it('shows the full suggestion list when an empty field is focused', async () => {
    const user = userEvent.setup()
    render(<ComboboxInput id="beanBrand" value="" onChange={vi.fn()} suggestions={suggestions} clearLabel="Clear field" />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: 'Lavazza' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Starbucks/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Stardust Coffee/ })).toBeInTheDocument()
  })

  it('calls onChange with the clicked suggestion', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ComboboxInput id="beanBrand" value="Star" onChange={onChange} suggestions={suggestions} clearLabel="Clear field" />)
    await user.click(screen.getByRole('combobox'))
    const starbucksOption = screen.getAllByRole('option').find((el) => el.textContent === 'Starbucks')!
    await user.click(starbucksOption)
    expect(onChange).toHaveBeenCalledWith('Starbucks')
  })

  it('clears the field when the clear button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ComboboxInput id="beanBrand" value="Starbucks" onChange={onChange} suggestions={suggestions} clearLabel="Clear field" />)
    await user.click(screen.getByRole('button', { name: 'Clear field' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('does not show a clear button when the field is empty', () => {
    render(<ComboboxInput id="beanBrand" value="" onChange={vi.fn()} suggestions={suggestions} clearLabel="Clear field" />)
    expect(screen.queryByRole('button', { name: 'Clear field' })).not.toBeInTheDocument()
  })
})
