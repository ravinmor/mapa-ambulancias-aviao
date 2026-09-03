import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Map from './Map';
import TrackingPage from './TrackingPage';
import AmilJetPage from './AmilJetPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Map />} />
        <Route path="/track/:vehicleId" element={<TrackingPage />} />
        <Route path="/aviacao-executiva" element={<AmilJetPage />} />
      </Routes>
    </BrowserRouter>
  );
}
