// src/lib/api.ts
// Information (Epistemology) → Vite/React  {Corticothalamic}
// The lens. Doesn't hold truth — renders it.
// The interceptor attaches identity to every request.

import axios from 'axios'

export const api = axios.create({ baseURL: '/' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ukb_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ukb_token')
      localStorage.removeItem('ukb_user')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

export interface UkbUser {
  user_id: string
  tenant_id: string
  role: string
  access_token: string
}

export const login = async (email: string, password: string): Promise<UkbUser> => {
  const { data } = await api.post('/auth/login', { email, password })
  return data
}

export const getRecords = async () => {
  const { data } = await api.get('/records/')
  return data
}

export const createRecord = async (label: string, payload: object = {}) => {
  const { data } = await api.post('/records/', { label, payload })
  return data
}

export const deleteRecord = async (id: string) => {
  await api.delete(`/records/${id}`)
}

export const getAuditLog = async () => {
  const { data } = await api.get('/audit/')
  return data
}
