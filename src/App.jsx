import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import { Hero } from './components/ui/animated-hero';
import { motion } from 'framer-motion';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh', color: 'var(--text-secondary)' }}>
        <h2>Yükleniyor...</h2>
      </div>
    );
  }

  return (
    <>
      {!session ? (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#0d1117]">
          <div className="flex flex-col xl:flex-row items-center justify-center w-full max-w-7xl gap-12">
             <div className="w-full xl:w-3/5 relative">
               <motion.div 
                 initial={{ y: -20, opacity: 0 }}
                 animate={{ y: 0, opacity: 1 }}
                 className="absolute -top-24 left-0 right-0 flex justify-center xl:justify-start"
               >
                 <img 
                   src="/logo.png" 
                   alt="Akcefy Logo" 
                   className="h-16 w-auto" 
                   style={{ 
                     borderRadius: '12px',
                     backgroundColor: '#ffffff',
                     padding: '8px',
                     boxShadow: '0 0 30px rgba(59, 130, 246, 0.4)'
                   }} 
                 />
               </motion.div>
               <Hero />
             </div>
             <div className="w-full xl:w-2/5 flex justify-center">
               <Auth />
             </div>
          </div>
        </div>
      ) : (
        <Dashboard session={session} />
      )}
    </>
  );
}
