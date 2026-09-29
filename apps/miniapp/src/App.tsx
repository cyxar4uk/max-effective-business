import { BrowserRouter, Route, Routes } from 'react-router';
import { BackButtonSync } from './app/BackButtonSync';
import { MeProvider } from './app/MeProvider';
import { StartParamRedirect } from './app/StartParamRedirect';
import { AboutScreen } from './screens/AboutScreen';
import { CandidatesScreen } from './screens/CandidatesScreen';
import { EmployerHome } from './screens/EmployerHome';
import { CompanyProfile } from './screens/employer/CompanyProfile';
import { DocsScreen } from './screens/employer/Docs';
import { PlaceForm } from './screens/employer/PlaceForm';
import { PlacePublished } from './screens/employer/PlacePublished';
import { TandemScreen } from './screens/employer/Tandem';
import { Home } from './screens/Home';
import { InternshipScreen } from './screens/InternshipScreen';
import { MyInterestsScreen } from './screens/MyInterestsScreen';
import { NotFound } from './screens/NotFound';
import { StudentHome } from './screens/StudentHome';

export function App() {
  return (
    <BrowserRouter>
      <BackButtonSync />
      <MeProvider>
        <StartParamRedirect />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/student" element={<StudentHome />} />
          <Route path="/student/interests" element={<MyInterestsScreen />} />
          <Route path="/employer" element={<EmployerHome />} />
          <Route path="/employer/profile" element={<CompanyProfile />} />
          <Route path="/employer/new" element={<PlaceForm />} />
          <Route path="/employer/internships/:id/published" element={<PlacePublished />} />
          <Route path="/internships/:id" element={<InternshipScreen />} />
          <Route path="/employer/internships/:id/candidates" element={<CandidatesScreen />} />
          <Route path="/employer/internships/:id/tandem/:studentId" element={<TandemScreen />} />
          <Route path="/employer/internships/:id/docs/:studentId" element={<DocsScreen />} />
          <Route path="/about" element={<AboutScreen />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MeProvider>
    </BrowserRouter>
  );
}
