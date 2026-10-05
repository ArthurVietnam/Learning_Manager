import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import { AppLayout } from './app/AppLayout'
import { AssignmentsPage } from './pages/AssignmentsPage'
import { AssignmentDetailsPage } from './pages/AssignmentDetailsPage'
import { NewAssignmentPage } from './pages/NewAssignmentPage'
import { EditAssignmentPage } from './pages/EditAssignmentPage'
import { NotFoundPage } from './pages/NotFoundPage'
import type { Assignment, AssignmentDraft } from './types/assignment'
import { ASSIGNMENTS as initialAssignments } from './data/assignments'
import './App.css'

export default function App() {
  const [assignments, setAssignments] = useState<Assignment[]>(() =>
    initialAssignments.map((item) => ({ ...item }))
  )

  function createAssignment(draft: AssignmentDraft): string {
    const id = crypto.randomUUID()
    setAssignments((current) => [...current, { ...draft, id }])
    return id
  }

  function updateAssignment(id: string, draft: AssignmentDraft): void {
    setAssignments((current) =>
      current.map((item) => (item.id === id ? { ...draft, id: item.id } : item))
    )
  }

  function deleteAssignment(id: string): void {
    setAssignments((current) => current.filter((item) => item.id !== id))
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/assignments" replace />} />
        <Route path="assignments" element={<AssignmentsPage assignments={assignments} />} />
        <Route path="assignments/new" element={<NewAssignmentPage onCreate={createAssignment} />} />
        <Route
          path="assignments/:id"
          element={
            <AssignmentDetailsPage assignments={assignments} onDelete={deleteAssignment} />
          }
        />
        <Route
          path="assignments/:id/edit"
          element={
            <EditAssignmentPage assignments={assignments} onUpdate={updateAssignment} />
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
