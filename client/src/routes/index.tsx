// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AuthLayout } from '@/layouts/AuthLayout';
import { AppLayout } from '@/layouts/AppLayout';
import { SuperAdminLayout } from '@/layouts/SuperAdminLayout';
import { Login } from '@/views/auth/Login';
import { AcceptInvite } from '@/views/auth/AcceptInvite';
import { Profile } from '@/views/auth/Profile';
import { Dashboard } from '@/views/dashboard/Dashboard';
import { Users } from '@/views/admin/Users';
import { UserDetail } from '@/views/admin/UserDetail';
import { Projects } from '@/views/projects/Projects';
import { ProjectDashboard } from '@/views/projects/ProjectDashboard';
import { ProjectSettings } from '@/views/projects/ProjectSettings';
import { WorkflowSettings } from '@/views/projects/WorkflowSettings';
import { CustomFieldSettings } from '@/views/projects/CustomFieldSettings';
import { Epics } from '@/views/epics/Epics';
import { EpicDetail } from '@/views/epics/EpicDetail';
import { Backlog } from '@/views/backlog/Backlog';
import { StoryDetail } from '@/views/stories/StoryDetail';
import { Sprints } from '@/views/sprints/Sprints';
import { SprintDetail } from '@/views/sprints/SprintDetail';
import { Board } from '@/views/board/Board';
import { KanbanBoard } from '@/views/board/KanbanBoard';
import { Reports } from '@/views/reports/Reports';
import { WorklogExplorer } from '@/views/admin/WorklogExplorer';
import { Search } from '@/views/search/Search';
import { ImportFromDoc } from '@/views/projects/ImportFromDoc';
import { ImportFromImage } from '@/views/projects/ImportFromImage';
import { JiraImport } from '@/views/jira/JiraImport';
import { RolesGuide } from '@/views/docs/RolesGuide';
import { ApiDocs } from '@/views/docs/ApiDocs';
import { AdminGuard } from '@/routes/AdminGuard';
import { HomeGate } from '@/routes/HomeGate';
import { ProjectTypeGuard } from '@/routes/ProjectTypeGuard';
import { EntitlementGuard } from '@/components/EntitlementGuard';
import { OrgAdminGuard } from '@/routes/OrgAdminGuard';
import { Organizations } from '@/views/superadmin/Organizations';
import { OrganizationDetail } from '@/views/superadmin/OrganizationDetail';
import { SuperAdmins } from '@/views/superadmin/SuperAdmins';
import { OrganizationSettings } from '@/views/organization/OrganizationSettings';
import { Invitations } from '@/views/invitations/Invitations';
import { Notifications } from '@/views/notifications/Notifications';

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <Login /> },
      { path: '/accept-invite', element: <AcceptInvite /> },
    ],
  },
  {
    element: <AppLayout />,
    children: [
      { path: '/dashboard', element: <Dashboard /> },
      {
        path: '/organization',
        element: (
          <OrgAdminGuard>
            <OrganizationSettings />
          </OrgAdminGuard>
        ),
      },
      { path: '/profile', element: <Profile /> },
      { path: '/api-docs', element: <ApiDocs /> },
      { path: '/invitations', element: <Invitations /> },
      { path: '/notifications', element: <Notifications /> },
      { path: '/search', element: <Search /> },
      { path: '/projects', element: <Projects /> },
      { path: '/projects/:id', element: <ProjectDashboard /> },
      { path: '/projects/:id/settings', element: <ProjectSettings /> },
      { path: '/projects/:id/settings/workflow', element: <WorkflowSettings /> },
      { path: '/projects/:id/settings/fields', element: <CustomFieldSettings /> },
      { path: '/projects/:id/epics', element: <Epics /> },
      { path: '/projects/:id/epics/:epicId', element: <EpicDetail /> },
      { path: '/projects/:id/backlog', element: <Backlog /> },
      { path: '/projects/:id/stories/:storyKey', element: <StoryDetail /> },
      // Sprints are scrum-only; a kanban project bounces to its board.
      { path: '/projects/:id/sprints', element: <ProjectTypeGuard allow="scrum"><Sprints /></ProjectTypeGuard> },
      { path: '/projects/:id/sprints/:sprintId', element: <ProjectTypeGuard allow="scrum"><SprintDetail /></ProjectTypeGuard> },
      // Each board is gated to its methodology; the other type redirects.
      { path: '/projects/:id/board', element: <ProjectTypeGuard allow="scrum"><Board /></ProjectTypeGuard> },
      { path: '/projects/:id/kanban', element: <ProjectTypeGuard allow="kanban"><KanbanBoard /></ProjectTypeGuard> },
      { path: '/projects/:id/reports', element: <Reports /> },
      {
        path: '/projects/:id/import',
        element: (
          <EntitlementGuard feature="aiDocImport" label="Document import">
            <ImportFromDoc />
          </EntitlementGuard>
        ),
      },
      {
        path: '/projects/:id/import-image',
        element: (
          <EntitlementGuard feature="aiImageImport" label="Image import">
            <ImportFromImage />
          </EntitlementGuard>
        ),
      },
      { path: '/jira/import', element: <JiraImport /> },
      {
        path: '/admin/users',
        element: (
          <AdminGuard>
            <Users />
          </AdminGuard>
        ),
      },
      {
        path: '/admin/users/:id',
        element: (
          <AdminGuard>
            <UserDetail />
          </AdminGuard>
        ),
      },
      { path: '/admin/worklogs', element: <WorklogExplorer /> },
    ],
  },
  {
    // Platform-operator tree. The layout itself enforces the superadmin gate
    // (and bounces tenant users to /dashboard), so these routes need no
    // per-route guard — the boundary lives at the layout, not sprinkled here.
    element: <SuperAdminLayout />,
    children: [
      { path: '/superadmin', element: <Organizations /> },
      { path: '/superadmin/orgs/:id', element: <OrganizationDetail /> },
      { path: '/superadmin/admins', element: <SuperAdmins /> },
    ],
  },
  // Front door: resolves the session, then routes by auth state. Must NOT be a
  // blind redirect to /login — Login sends authenticated users back to '/',
  // so a static redirect here creates an infinite `/` ⇄ `/login` loop.
  { path: '/', element: <HomeGate /> },
  // Public — no login required.
  { path: '/roles', element: <RolesGuide /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);
