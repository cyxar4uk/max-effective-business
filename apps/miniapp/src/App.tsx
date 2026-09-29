import { BrowserRouter, Route } from 'react-router';
import { BackButtonSync } from './app/BackButtonSync';
import { LastRoleSync } from './app/lastRole';
import { MeProvider } from './app/MeProvider';
import { StartParamRedirect } from './app/StartParamRedirect';
import { AnimatedRoutes } from './motion/AnimatedRoutes';
import { AboutScreen } from './screens/AboutScreen';
import { CandidatesScreen } from './screens/CandidatesScreen';
import { EmployerHome } from './screens/EmployerHome';
import { CompanyProfile } from './screens/employer/CompanyProfile';
import { EmployerDocsScreen } from './screens/employer/Docs';
import { PlaceForm } from './screens/employer/PlaceForm';
import { PlacePublished } from './screens/employer/PlacePublished';
import { PlaceQr } from './screens/employer/PlaceQr';
import { EmployerTandemScreen } from './screens/employer/Tandem';
import { Home } from './screens/Home';
import { InternshipScreen } from './screens/InternshipScreen';
import { NotFound } from './screens/NotFound';
import { ConsentScreen } from './screens/onboarding/ConsentScreen';
import { StudentHome } from './screens/StudentHome';
import { StudentInterests } from './screens/student/StudentInterests';
import { StudentProfileEdit, StudentProfileScreen } from './screens/student/StudentProfile';
import { TandemScreen } from './screens/student/TandemScreen';

export function App() {
  return (
    <BrowserRouter>
      <BackButtonSync />
      <MeProvider>
        <StartParamRedirect />
        <LastRoleSync />
        <AnimatedRoutes>
          <Route path="/" element={<Home />} />
          <Route path="/consent" element={<ConsentScreen />} />
          <Route path="/student" element={<StudentHome />} />
          <Route path="/student/interests" element={<StudentInterests />} />
          <Route path="/student/profile" element={<StudentProfileScreen />} />
          <Route path="/student/profile/edit" element={<StudentProfileEdit />} />
          <Route path="/student/tandem/:id" element={<TandemScreen />} />
          <Route path="/employer" element={<EmployerHome />} />
          <Route path="/employer/profile" element={<CompanyProfile />} />
          <Route path="/employer/new" element={<PlaceForm />} />
          <Route path="/employer/internships/:id/published" element={<PlacePublished />} />
          <Route path="/employer/internships/:id/qr" element={<PlaceQr />} />
          <Route path="/internships/:id" element={<InternshipScreen />} />
          <Route path="/employer/internships/:id/candidates" element={<CandidatesScreen />} />
          <Route path="/employer/internships/:id/tandem/:studentId" element={<EmployerTandemScreen />} />
          <Route path="/employer/internships/:id/docs/:studentId" element={<EmployerDocsScreen />} />
          <Route path="/about" element={<AboutScreen />} />
          <Route path="*" element={<NotFound />} />
        </AnimatedRoutes>
      </MeProvider>
    </BrowserRouter>
  );
}
