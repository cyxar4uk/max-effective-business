import { BrowserRouter, Route } from 'react-router';
import { BackButtonSync } from './app/BackButtonSync';
import { LastRoleSync } from './app/lastRole';
import { lazyScreen, loadAbout, loadDocs, loadEmployer, loadPlaceForm, loadStudent } from './app/lazyScreen';
import { MeProvider } from './app/MeProvider';
import { StartParamGate } from './app/StartParamGate';
import { FlashHost } from './components/Flash';
import { AnimatedRoutes } from './motion/AnimatedRoutes';
import { Home } from './screens/Home';
import { NotFound } from './screens/NotFound';
import { ConsentScreen } from './screens/onboarding/ConsentScreen';

// В первом чанке — главный экран и онбординг; разделы ролей, форма места, документы практики и «О сервисе» — отдельные чанки
const StudentHome = lazyScreen(loadStudent, (m) => m.StudentHome);
const StudentInterests = lazyScreen(loadStudent, (m) => m.StudentInterests);
const StudentProfileScreen = lazyScreen(loadStudent, (m) => m.StudentProfileScreen);
const StudentProfileEdit = lazyScreen(loadStudent, (m) => m.StudentProfileEdit);
const TandemScreen = lazyScreen(loadStudent, (m) => m.TandemScreen);
const InternshipScreen = lazyScreen(loadStudent, (m) => m.InternshipScreen);
const EmployerHome = lazyScreen(loadEmployer, (m) => m.EmployerHome);
const CompanyProfile = lazyScreen(loadEmployer, (m) => m.CompanyProfile);
const PlacePublished = lazyScreen(loadEmployer, (m) => m.PlacePublished);
const PlaceQr = lazyScreen(loadEmployer, (m) => m.PlaceQr);
const CandidatesScreen = lazyScreen(loadEmployer, (m) => m.CandidatesScreen);
const EmployerTandemScreen = lazyScreen(loadEmployer, (m) => m.EmployerTandemScreen);
const EmployerDocsScreen = lazyScreen(loadEmployer, (m) => m.EmployerDocsScreen);
const PlaceForm = lazyScreen(loadPlaceForm, (m) => m.PlaceForm);
const PracticeDocsScreen = lazyScreen(loadDocs, (m) => m.PracticeDocsScreen);
const AboutScreen = lazyScreen(loadAbout, (m) => m.AboutScreen);

export function App() {
  return (
    <BrowserRouter>
      <BackButtonSync />
      <MeProvider>
        <LastRoleSync />
        {/* Параметр запуска разбирается до отрисовки экранов: по ссылке на место главный не мелькает */}
        <StartParamGate>
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
            <Route path="/docs/:interestId" element={<PracticeDocsScreen />} />
            <Route path="/about" element={<AboutScreen />} />
            <Route path="*" element={<NotFound />} />
          </AnimatedRoutes>
        </StartParamGate>
        <FlashHost />
      </MeProvider>
    </BrowserRouter>
  );
}
