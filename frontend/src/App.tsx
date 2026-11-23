import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Workspace from "./pages/Workspace";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/app" element={<Workspace />} />
      <Route path="/app/:slug" element={<Workspace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
