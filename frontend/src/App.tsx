import { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import { AppLayout } from './app/AppLayout.tsx'
import { RequireAuth } from './app/RequireAuth.tsx'
import { AuthPage } from './pages/AuthPage.tsx'
import { AssignmentsPage } from './pages/AssignmentsPage.tsx'
import { AssignmentDetailsPage } from './pages/AssignmentDetailsPage.tsx'
import { NewAssignmentPage } from './pages/NewAssignmentPage.tsx'
import { EditAssignmentPage } from './pages/EditAssignmentPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import type { Assignment, AssignmentDraft } from './types/assignment.ts'
import { useAuth } from './hooks/useAuth.ts'
import { useCourses } from './hooks/useCourses.ts'
import {
  getAssignments,
  createAssignment as apiCreateAssignment,
  updateAssignment as apiUpdateAssignment,
  deleteAssignment as apiDeleteAssignment,
} from './services/assignments.ts'
import './App.css'

export default function App() {
  const auth = useAuth()
  const { load: coursesLoad } = useCourses()
  const courses = coursesLoad.status === 'success' ? coursesLoad.data : undefined

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const userId = auth.status === 'authenticated' ? auth.session.user.id : null
  const prevUserIdRef = useRef<string | null>(null)

  const fetchAssignments = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      setAssignments([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await getAssignments(courses)
      setAssignments(data)
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Не удалось загрузить задания.',
      )
    } finally {
      setLoading(false)
    }
  }, [auth.status, courses])

  useEffect(() => {
    if (auth.status !== 'authenticated') {
      prevUserIdRef.current = null
      // oxlint-disable-next-line react/set-state-in-effect
      setAssignments([])
      setLoading(false)
      setError(null)
      return
    }

    let active = true

    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId
      // oxlint-disable-next-line react/set-state-in-effect
      setAssignments([])
    }

    setLoading(true)
    setError(null)

    getAssignments(courses)
      .then((data) => {
        if (!active) return
        setAssignments(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(
          err instanceof Error ? err.message : 'Не удалось загрузить задания.',
        )
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [auth.status, userId, courses])

  async function handleCreateAssignment(draft: AssignmentDraft): Promise<string> {
    const created = await apiCreateAssignment(draft, courses)
    try {
      const fresh = await getAssignments(courses)
      setAssignments(fresh)
    } catch {
      setAssignments((prev) => [created, ...prev])
    }
    return created.id
  }

  async function handleUpdateAssignment(
    id: string,
    draft: AssignmentDraft,
  ): Promise<void> {
    await apiUpdateAssignment(id, draft)
    try {
      const fresh = await getAssignments(courses)
      setAssignments(fresh)
    } catch {
      setAssignments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...draft, id } : a)),
      )
    }
  }

  async function handleDeleteAssignment(id: string): Promise<void> {
    await apiDeleteAssignment(id)
    try {
      const fresh = await getAssignments(courses)
      setAssignments(fresh)
    } catch {
      setAssignments((prev) => prev.filter((a) => a.id !== id))
    }
  }

  return (
    <Routes>
      <Route element={<AppLayout auth={auth} />}>
        <Route index element={<Navigate to="/assignments" replace />} />
        <Route
          path="auth"
          element={
            auth.status === 'authenticated' ? (
              <Navigate to="/assignments" replace />
            ) : (
              <AuthPage auth={auth} />
            )
          }
        />

        <Route element={<RequireAuth auth={auth} />}>
          <Route
            path="assignments"
            element={
              <AssignmentsPage
                assignments={assignments}
                loading={loading}
                error={error}
                onRetry={fetchAssignments}
              />
            }
          />
          <Route
            path="assignments/new"
            element={<NewAssignmentPage onCreate={handleCreateAssignment} />}
          />
          <Route
            path="assignments/:id"
            element={
              <AssignmentDetailsPage
                assignments={assignments}
                loading={loading}
                error={error}
                onRetry={fetchAssignments}
                onDelete={handleDeleteAssignment}
              />
            }
          />
          <Route
            path="assignments/:id/edit"
            element={
              <EditAssignmentPage
                assignments={assignments}
                loading={loading}
                error={error}
                onRetry={fetchAssignments}
                onUpdate={handleUpdateAssignment}
              />
            }
          />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
