import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ComboboxInput from './ComboboxInput.js'

const suggestions = ['Starbucks', 'Stardust Coffee', 'Lavazza']

function ControlledHarness({ initialValue, suggestions }: { initialValue: string; suggestions: string[] }) {
  const [value, setValue] = useState(initialValue)
  return <ComboboxInput id="beanBrand" value={value} onChange={setValue} suggestions={suggestions} clearLabel="Clear field" />
}

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

  it('moves the highlighted option with ArrowDown and selects it with Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ComboboxInput id="beanBrand" value="" onChange={onChange} suggestions={suggestions} clearLabel="Clear field" />)
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('Starbucks')
  })

  it('reverts to the value at focus time when Escape is pressed', async () => {
    const user = userEvent.setup()
    render(<ControlledHarness initialValue="Star" suggestions={suggestions} />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    await user.click(input)
    await user.type(input, 'bucks')
    expect(input).toHaveValue('Starbucks')
    await user.keyboard('{Escape}')
    expect(input).toHaveValue('Star')
  })

  it('shows an inline ghost suggestion for a matching prefix', () => {
    render(<ComboboxInput id="beanBrand" value="Star" onChange={vi.fn()} suggestions={suggestions} clearLabel="Clear field" />)
    expect(screen.getByTestId('ghost-tail')).toHaveTextContent('bucks')
  })

  it('does not show a ghost suggestion once the value exactly matches a suggestion', () => {
    render(<ComboboxInput id="beanBrand" value="Starbucks" onChange={vi.fn()} suggestions={suggestions} clearLabel="Clear field" />)
    expect(screen.queryByTestId('ghost-tail')).not.toBeInTheDocument()
  })

  it('accepts the ghost suggestion with ArrowRight when the caret is at the end', async () => {
    const user = userEvent.setup()
    render(<ControlledHarness initialValue="" suggestions={suggestions} />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    await user.click(input)
    await user.type(input, 'Star')
    await user.keyboard('{ArrowRight}')
    expect(input).toHaveValue('Starbucks')
  })

  it('does not submit the surrounding form when Enter commits free text with the dropdown open', async () => {
    const user = userEvent.setup()
    const handleSubmit = vi.fn((e) => e.preventDefault())
    render(
      <form onSubmit={handleSubmit}>
        <ComboboxInput id="beanBrand" value="" onChange={vi.fn()} suggestions={suggestions} clearLabel="Clear field" />
      </form>
    )
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{Enter}')
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('gives the input wrapper the themed background so the field is not transparent', () => {
    render(<ComboboxInput id="beanBrand" value="" onChange={vi.fn()} suggestions={suggestions} clearLabel="Clear field" />)
    const input = screen.getByRole('combobox')
    const wrapper = input.parentElement!
    expect(wrapper).toHaveStyle({ background: 'var(--bg-input)' })
  })

  it('gives the input wrapper the same unfocused border color as other fields', () => {
    render(<ComboboxInput id="beanBrand" value="" onChange={vi.fn()} suggestions={suggestions} clearLabel="Clear field" />)
    const input = screen.getByRole('combobox')
    const wrapper = input.parentElement!
    expect(wrapper).toHaveStyle({ border: '1px solid var(--border-focus)' })
  })

  it('adopts the matched suggestion\'s casing when accepting the ghost suggestion, even if typed in a different case', async () => {
    const user = userEvent.setup()
    const caseSuggestions = ['Coffee Circle', 'Onetake Coffee']
    render(<ControlledHarness initialValue="" suggestions={caseSuggestions} />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    await user.click(input)
    await user.type(input, 'coff')
    await user.keyboard('{ArrowRight}')
    expect(input).toHaveValue('Coffee Circle')
  })

  it('clears the field when the clear button is clicked, and the button stays clickable above the input', async () => {
    const user = userEvent.setup()
    render(<ControlledHarness initialValue="Starbucks" suggestions={suggestions} />)
    const clearButton = screen.getByRole('button', { name: 'Clear field' })
    await user.click(clearButton)
    expect(screen.getByRole('combobox')).toHaveValue('')
  })
})
