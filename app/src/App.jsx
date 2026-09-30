import { Link, Navigate, Route, Routes } from 'react-router-dom'
import Login from './Login'
import Register from './Register'
import ResetPassword from './ResetPassword'
import VerifyEmail from './VerifyEmail'

export default function App() {
  return (
    <main className="auth-shell">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="*" element={<Navigate replace to="/login" />} />
      </Routes>
    </main>
  )
}

export function AuthCard({ children }) {
  return (
    <section className="auth-card">
      <Link className="app-brand" to="/login" aria-label="Kyber Maestro sign in">Kyber Maestro</Link>
      {children}
    </section>
  )
}
