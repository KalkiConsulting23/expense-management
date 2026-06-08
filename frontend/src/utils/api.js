import { useAuth } from '@clerk/clerk-react'

export function useApi() {
  const { getToken } = useAuth()

  const apiFetch = async (url, options = {}) => {
    const token = await getToken()
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    })
  }

  return { apiFetch }
}