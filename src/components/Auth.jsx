import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage('Kayıt başarılı! E-postanızı kontrol edin (veya doğrudan giriş yapın).');
      }
    } catch (error) {
      setError(error.message || 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[400px] flex justify-center items-center">
      <div className="glass-card w-full">
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--accent-color)' }}>
          {isLogin ? 'Akcefy Girişi' : 'Hesap Oluştur'}
        </h2>

        {error && (
          <div style={{ backgroundColor: 'rgba(248,81,73,0.1)', color: 'var(--expense-color)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ backgroundColor: 'rgba(63,185,80,0.1)', color: 'var(--income-color)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
            {message}
          </div>
        )}

        <form onSubmit={handleAuth}>
          <div className="form-group">
            <label className="form-label">E-posta</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-posta adresiniz"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Şifre</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Şifreniz"
              required
            />
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', marginBottom: '1rem' }}
            disabled={loading}
          >
            {isLogin ? <>🔑 Giriş Yap</> : <>✨ Kayıt Ol</>}
          </button>
        </form>

        <div style={{ textAlign: 'center' }}>
          <button 
            type="button" 
            className="btn btn-ghost" 
            onClick={() => { setIsLogin(!isLogin); setError(null); setMessage(null); }}
          >
            {isLogin ? 'Hesabınız yok mu? Kayıt olun' : 'Zaten hesabınız var mı? Giriş yapın'}
          </button>
        </div>
      </div>
    </div>
  );
}
