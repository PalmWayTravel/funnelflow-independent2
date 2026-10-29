import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { ThemeProvider } from '@/components/ThemeProvider';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Dashboard from '@/pages/Dashboard';
import ClientDashboard from '@/pages/ClientDashboard';
import Reports from '@/pages/Reports';
import Clients from '@/pages/Clients';
import ClientDetail from '@/pages/ClientDetail';
import Complaints from '@/pages/Complaints';
import ComplaintAssistant from '@/pages/ComplaintAssistant';
import Tasks from '@/pages/Tasks';
import Sales from '@/pages/Sales';
import Settings from '@/pages/Settings';
import Contacts from '@/pages/Contacts';
import Pipeline from '@/pages/Pipeline';
import Automations from '@/pages/Automations';
import Broadcasts from '@/pages/Broadcasts';
import Forms from '@/pages/Forms';
import Bookings from '@/pages/Bookings';
import Accounts from '@/pages/Accounts';
import MetaAdAccounts from '@/pages/MetaAdAccounts';
import ClientPreview from '@/pages/ClientPreview';
import PublicForm from '@/pages/PublicForm';
import PublicBooking from '@/pages/PublicBooking';
import OAuthConsent from '@/pages/OAuthConsent';
import ClientLeads from '@/pages/ClientLeads';
import ClientAutomations from '@/pages/ClientAutomations';
import Unsubscribe from '@/pages/Unsubscribe';
import Contracts from '@/pages/Contracts';
import SignContract from '@/pages/SignContract';
import AccountGate from '@/components/AccountGate';
import AdminOnly from '@/components/AdminOnly';
import HomeRedirect from '@/components/HomeRedirect';
import RoleView from '@/components/RoleView';
import { Navigate } from 'react-router-dom';
import Calendar from '@/pages/Calendar';
import Onboarding from '@/pages/Onboarding';
import OnboardingGate from '@/components/onboarding/OnboardingGate';
// Add page imports here

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/f/:id" element={<PublicForm />} />
      <Route path="/b/:id" element={<PublicBooking />} />
      <Route path="/login" element={<Login />} />
      {/* Registration is disabled: only admin-invited users can sign in. */}
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      <Route path="/u/:token" element={<Unsubscribe />} />
      <Route path="/s/:token" element={<SignContract />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AccountGate />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<OnboardingGate />}>
            <Route element={<Layout />}>
            <Route path="/" element={<HomeRedirect />} />
            {/* Admin-only screens — the client role is redirected away */}
            <Route path="/dashboard" element={<RoleView admin={<Dashboard />} client={<ClientDashboard />} />} />
            <Route path="/clients" element={<AdminOnly><Clients /></AdminOnly>} />
            <Route path="/clients/:id" element={<AdminOnly><ClientDetail /></AdminOnly>} />
            <Route path="/complaints" element={<AdminOnly><Complaints /></AdminOnly>} />
            <Route path="/complaints/agent" element={<AdminOnly><ComplaintAssistant /></AdminOnly>} />
            <Route path="/tasks" element={<AdminOnly><Tasks /></AdminOnly>} />
            <Route path="/contacts" element={<AdminOnly><Contacts /></AdminOnly>} />
            <Route path="/pipeline" element={<AdminOnly><Pipeline /></AdminOnly>} />
            <Route path="/automations" element={<RoleView admin={<Automations />} client={<ClientAutomations />} />} />
            <Route path="/broadcasts" element={<AdminOnly><Broadcasts /></AdminOnly>} />
            <Route path="/forms" element={<AdminOnly><Forms /></AdminOnly>} />
            <Route path="/contracts" element={<AdminOnly><Contracts /></AdminOnly>} />
            <Route path="/accounts" element={<AdminOnly><Accounts /></AdminOnly>} />
            <Route path="/meta-ads" element={<AdminOnly><MetaAdAccounts /></AdminOnly>} />
            <Route path="/accounts/:id/view" element={<AdminOnly><ClientPreview /></AdminOnly>} />
            <Route path="/settings" element={<AdminOnly><Settings /></AdminOnly>} />
            {/* Shared routes — client role gets its own scoped view */}
            <Route path="/crm" element={<RoleView admin={<Navigate to="/pipeline" replace />} client={<ClientLeads />} />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/calendar" element={<Calendar />} />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}

export default App