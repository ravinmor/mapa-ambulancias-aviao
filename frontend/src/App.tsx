import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Map from './Map';
import TrackingPage from './TrackingPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Map />} />
        <Route path="/track/:vehicleId" element={<TrackingPage />} />
      </Routes>
    </BrowserRouter>
  );
}
