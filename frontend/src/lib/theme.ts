import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

/** Light or dark. index.html sets the starting class before React loads, so there's no flash. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // storage blocked (private mode): the choice lasts for this visit only
    }
  }

  return [theme, toggleTheme] as const
}
