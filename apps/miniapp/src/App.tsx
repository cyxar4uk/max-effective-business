import { BrowserRouter, Route, Routes } from 'react-router';
import { BackButtonSync } from './app/BackButtonSync';
import { MeProvider } from './app/MeProvider';
import { StartParamRedirect } from './app/StartParamRedirect';
import { CandidatesScreen } from './screens/CandidatesScreen';
import { EmployerHome } from './screens/EmployerHome';
import { Home } from './screens/Home';
import { InternshipScreen } from './screens/InternshipScreen';
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
          <Route path="/employer" element={<EmployerHome />} />
          <Route path="/internships/:id" element={<InternshipScreen />} />
          <Route path="/employer/internships/:id/candidates" element={<CandidatesScreen />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MeProvider>
    </BrowserRouter>
  );
}
