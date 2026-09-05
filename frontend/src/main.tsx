import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import AuthPage from './components/AuthPage';
import HoldScreen from './components/HoldScreen';
import AmbientBackground from './components/AmbientBackground';
import { captureInvite } from './lib/invite';
import { subscribeUplink, uplinkState } from './lib/uplink';

// Before anything renders: lift ?invite=<code> off the URL and park it.
captureInvite();

function Root() {
  const { user, loading } = useAuth();
  const [uplink, setUplink] = useState(uplinkState);
  useEffect(() => subscribeUplink(setUplink), []);

  // Backend unreachable: hold, with the environment alive, whoever you are.
  if (uplink.down) {
    return (
      <div className="min-h-screen bg-cyber-bg text-cyber-text font-sans">
        <AmbientBackground intensity="normal" />
        <div className="page-shell min-h-screen flex flex-col">
          <HoldScreen reason="uplink" since={uplink.since} attempts={uplink.attempts} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cyber-bg flex items-center justify-center">
        <div className="label-micro text-cyber-neon animate-pulse" role="status">
          Initializing Terminal...
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onSuccess={() => {}} />;
  }

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
