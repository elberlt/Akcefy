import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Pie, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title } from 'chart.js';
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title);

export default function Dashboard({ session }) {
  const [transactions, setTransactions] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [rates, setRates] = useState({ USD: 35.0, EUR: 38.0, GA: 3200.0 }); // Fallback values
  const [loadingRates, setLoadingRates] = useState(true);
  const [loading, setLoading] = useState(true);
  
  // Form States for Transactions
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('expense');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  // Form States for Holdings (Debt/Investment)
  const [holdingName, setHoldingName] = useState('');
  const [holdingAmount, setHoldingAmount] = useState('');
  const [holdingUnit, setHoldingUnit] = useState('TRY');
  const [holdingType, setHoldingType] = useState('investment');
  const [isCurrentPrice, setIsCurrentPrice] = useState(true);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [activeTab, setActiveTab] = useState('transactions');
  const [isDarkMode, setIsDarkMode] = useState(false);

  const user = session?.user;

  useEffect(() => {
    if (user) {
      fetchData();
      fetchRates();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [txRes, holdRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }),
        supabase.from('holdings').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      ]);

      if (txRes.error) throw txRes.error;
      setTransactions(txRes.data || []);
      
      // If holdings table doesn't exist, we might get an error. Handle gracefully.
      if (!holdRes.error) {
        setHoldings(holdRes.data || []);
      }
    } catch (error) {
      console.error('Veri alınırken hata oluştu:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchRates = async () => {
    try {
      // Truncgil API: More reliable and current for 2026 data
      const res = await fetch(`https://finans.truncgil.com/v3/today.json?t=${new Date().getTime()}`);
      const data = await res.json();
      
      const parseTRValue = (val) => {
        if (!val) return 0;
        // Remove thousand dots and replace decimal comma with dot
        return parseFloat(val.replace(/\./g, '').replace(',', '.'));
      };

      if (data && data.USD && data.EUR && data['gram-altin']) {
        setRates({
          USD: parseTRValue(data.USD.Selling),
          EUR: parseTRValue(data.EUR.Selling),
          GA: parseTRValue(data['gram-altin'].Selling)
        });
        setLoadingRates(false);
      }
    } catch (error) {
      console.error('Kurlar alınamadı:', error.message);
    }
  };

  const resetData = async () => {
    if (!window.confirm('Tüm verilerinizi (işlemler, yatırımlar ve borçlar) silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) {
      return;
    }

    try {
      setLoading(true);
      console.log('Akcefy Sıfırlama başlatıldı, User:', user?.email);
      
      // Force clear local state FIRST for immediate UI feedback
      setTransactions([]);
      setHoldings([]);
      setAmount('');
      setCategory('');
      setDescription('');
      setHoldingName('');
      setHoldingAmount('');

      // Then try to delete from Supabase
      try {
        const [txRes, holdRes] = await Promise.all([
          supabase.from('transactions').delete().eq('user_id', user.id),
          supabase.from('holdings').delete().eq('user_id', user.id)
        ]);
        
        if (txRes.error) console.error('Supabase TX silme hatası:', txRes.error.message);
        if (holdRes.error) console.error('Supabase Hold silme hatası:', holdRes.error.message);
      } catch (dbErr) {
        console.error('Veritabanı silme işlemi başarısız oldu:', dbErr.message);
      }

      alert('Tüm veriler temizlendi ve hesabınız sıfırlandı.');
    } catch (error) {
      console.error('Kritik sıfırlama hatası:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const addQuickTransaction = async (cat, amt, t = 'expense') => {
    try {
      const newTx = {
        user_id: user.id,
        amount: parseFloat(amt),
        type: t,
        category: cat,
        date: new Date().toISOString().split('T')[0],
        description: 'Hızlı Ekleme',
      };

      const { error } = await supabase.from('transactions').insert([newTx]);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Hızlı işlem hatası:', error.message);
    }
  };

  const addTransaction = async (e) => {
    e.preventDefault();
    if (!amount || !category || !date) return;

    try {
      const newTx = {
        user_id: user.id,
        amount: parseFloat(amount),
        type,
        category,
        date,
        description,
      };

      const { error } = await supabase.from('transactions').insert([newTx]);
      if (error) throw error;

      setAmount('');
      setCategory('');
      setDescription('');
      fetchData();
    } catch (error) {
      console.error('İşlem eklenirken hata oluştu:', error.message);
    }
  };

  const addHolding = async (e) => {
    e.preventDefault();
    if (!holdingName || !holdingAmount) return;

    let finalPurchasePrice = 0;
    
    // Yalnızca yatırım ise alış fiyatı mantığını kullan
    if (holdingType === 'investment') {
      if (isCurrentPrice) {
        // Şu anki kur alınıyor
        if (holdingUnit === 'USD') finalPurchasePrice = rates.USD;
        else if (holdingUnit === 'EUR') finalPurchasePrice = rates.EUR;
        else if (holdingUnit === 'GA') finalPurchasePrice = rates.GA;
        else finalPurchasePrice = 1; // TRY için 1
      } else {
        // Kullanıcının girdiği fiyat
        finalPurchasePrice = purchasePrice ? parseFloat(purchasePrice) : 0;
      }
    }

    try {
      const newHolding = {
        user_id: user.id,
        name: holdingName,
        amount: parseFloat(holdingAmount),
        unit: holdingUnit,
        type: holdingType,
        purchase_price: finalPurchasePrice
      };

      const { error } = await supabase.from('holdings').insert([newHolding]);
      if (error) {
        if (error.code === '42P01') {
          alert('Hata: "holdings" tablosu Supabase\'de bulunamadı. Lütfen SQL editöründe tabloyu oluşturun (Detaylar plan dosyasında).');
        } else {
          alert('Supabase Hatası: ' + error.message + '\nKod: ' + error.code);
        }
        return;
      }

      setHoldingName('');
      setHoldingAmount('');
      setPurchasePrice('');
      setIsCurrentPrice(true);
      fetchData();
    } catch (error) {
      console.error('Varlık eklenirken hata oluştu:', error.message);
      alert('Beklenmedik Hata: ' + error.message);
    }
  };

  const deleteTransaction = async (id) => {
    if (!window.confirm('Bu işlemi silmek istediğinize emin misiniz?')) return;
    try {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('İşlem silinirken hata oluştu:', error.message);
    }
  };

  const deleteHolding = async (id) => {
    if (!window.confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
    try {
      const { error } = await supabase.from('holdings').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Kayıt silinirken hata oluştu:', error.message);
    }
  };

  // Calculations
  const incomes = transactions.filter(t => t.type === 'income');
  const expenses = transactions.filter(t => t.type === 'expense');
  
  const totalIncome = incomes.reduce((acc, curr) => acc + Number(curr.amount), 0);
  const totalExpense = expenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
  
  // Calculate Holdings in TRY
  const calculateValue = (val, unit) => {
    if (unit === 'USD') return val * rates.USD;
    if (unit === 'EUR') return val * rates.EUR;
    if (unit === 'GA') return val * rates.GA;
    return val; // TRY
  };

  const totalInvestments = holdings
    .filter(h => h.type === 'investment')
    .reduce((acc, curr) => acc + calculateValue(curr.amount, curr.unit), 0);
    
  const totalDebts = holdings
    .filter(h => h.type === 'debt')
    .reduce((acc, curr) => acc + calculateValue(curr.amount, curr.unit), 0);

  const netHoldings = totalInvestments - totalDebts;
  const balance = totalIncome - totalExpense;

  // Monthly Summary
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const monthlyTransactions = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  
  const monthlyIncome = monthlyTransactions.filter(t => t.type === 'income').reduce((acc, curr) => acc + Number(curr.amount), 0);
  const monthlyExpense = monthlyTransactions.filter(t => t.type === 'expense').reduce((acc, curr) => acc + Number(curr.amount), 0);
  const monthlyProgress = monthlyIncome > 0 ? (monthlyExpense / monthlyIncome) * 100 : 0;

  // Trend Chart Data (Last 6 Months Income vs Expense)
  const getLast6Months = () => {
    const months = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push({
        label: monthDate.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' }),
        month: monthDate.getMonth(),
        year: monthDate.getFullYear()
      });
    }
    return months;
  };

  const trendMonths = getLast6Months();
  const trendIncomeData = trendMonths.map(m => {
    return incomes.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === m.month && d.getFullYear() === m.year;
    }).reduce((sum, t) => sum + Number(t.amount), 0);
  });
  
  const trendExpenseData = trendMonths.map(m => {
    return expenses.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === m.month && d.getFullYear() === m.year;
    }).reduce((sum, t) => sum + Number(t.amount), 0);
  });

  const trendChartData = {
    labels: trendMonths.map(m => m.label),
    datasets: [
      {
        label: 'Gelir',
        data: trendIncomeData,
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
        borderColor: '#10b981',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Gider',
        data: trendExpenseData,
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderColor: '#ef4444',
        borderWidth: 1,
        borderRadius: 4,
      }
    ],
  };

  const trendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: isDarkMode ? '#c9d1d9' : '#475569', font: { family: 'Outfit', size: 12 } }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      }
    },
    scales: {
      y: {
        ticks: { color: isDarkMode ? '#8b949e' : '#64748b', callback: (value) => '₺' + value },
        grid: { color: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }
      },
      x: {
        ticks: { color: isDarkMode ? '#8b949e' : '#64748b' },
        grid: { display: false }
      }
    }
  };

  // Chart Data preparation
  const expenseCategories = {};
  expenses.forEach(t => {
    expenseCategories[t.category] = (expenseCategories[t.category] || 0) + Number(t.amount);
  });

  const chartData = {
    labels: Object.keys(expenseCategories),
    datasets: [
      {
        data: Object.values(expenseCategories),
        backgroundColor: [
          '#ff6384', '#36a2eb', '#cc65fe', '#ffce56', '#4bc0c0', '#9966ff', '#ff9f40'
        ],
        borderWidth: 1,
        borderColor: '#161b22',
      },
    ],
  };

  const chartOptions = {
    plugins: {
      legend: { position: 'right', labels: { color: '#c9d1d9' } },
    },
    maintainAspectRatio: false,
  };

  const exportData = () => {
    const doc = new jsPDF();
    
    // Turkish Character Replacer function to avoid missing characters in default font
    const trMap = { 'ç':'c', 'ğ':'g', 'ı':'i', 'ö':'o', 'ş':'s', 'ü':'u', 'Ç':'C', 'Ğ':'G', 'İ':'I', 'Ö':'O', 'Ş':'S', 'Ü':'U' };
    const safeStr = (str) => String(str).replace(/[çğıöşüÇĞİÖŞÜ]/g, m => trMap[m] || m);

    // Title & Header
    doc.setFontSize(22);
    doc.setTextColor(44, 62, 80);
    doc.text('Akcefy Raporu', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(127, 140, 141);
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, 14, 30);
    doc.text(`Net Bakiye: ${balance.toFixed(2)} TL | Tahmini Net Varlik: ${netHoldings.toFixed(2)} TL`, 14, 36);

    // 1. Transactions Table
    const tableTxData = transactions.map(t => [
      new Date(t.date).toLocaleDateString('tr-TR'),
      t.type === 'income' ? 'Gelir' : 'Gider',
      safeStr(t.category),
      `${Number(t.amount).toFixed(2)} TL`
    ]);

    autoTable(doc, {
      startY: 42,
      head: [['Tarih', 'Tip', 'Kategori', 'Tutar']],
      body: tableTxData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] }, // Blue
      margin: { top: 10 },
      styles: { font: 'helvetica' }
    });

    // 2. Holdings Table
    const tableHoldData = holdings.map(h => [
      safeStr(h.name),
      h.type === 'investment' ? 'Yatirim' : 'Borc',
      `${h.amount} ${h.unit}`,
      `${calculateValue(h.amount, h.unit).toFixed(2)} TL`
    ]);

    if (tableHoldData.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(44, 62, 80);
      doc.text('Mevcut Varlık ve Borçlar', 14, doc.lastAutoTable.finalY + 15);
      
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [['İsim', 'Tip', 'Miktar', 'Tahmini Değer (TRY)']],
        body: tableHoldData,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] }, // Green
        styles: { font: 'helvetica' }
      });
    }

    // 3. Investment Performance Table
    const investmentHoldings = holdings.filter(h => h.type === 'investment' && h.unit !== 'TRY' && h.purchase_price > 0);
    if (investmentHoldings.length > 0) {
      const tablePerfData = investmentHoldings.map(h => {
        const currentPrice = h.unit === 'USD' ? rates.USD : h.unit === 'EUR' ? rates.EUR : h.unit === 'GA' ? rates.GA : 1;
        const totalCost = h.purchase_price * h.amount;
        const currentValue = currentPrice * h.amount;
        const profitLoss = currentValue - totalCost;
        const profitPercentage = ((profitLoss / totalCost) * 100).toFixed(2);
        
        return [
          safeStr(h.name),
          `${h.purchase_price.toFixed(2)} TL`,
          `${currentPrice.toFixed(2)} TL`,
          `${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(2)} TL (%${profitPercentage})`
        ];
      });

      doc.setFontSize(14);
      doc.setTextColor(44, 62, 80);
      doc.text('Yatırım Performansı', 14, doc.lastAutoTable.finalY + 15);
      
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Yatırım', 'Maliyet Kuru', 'Güncel Kur', 'Kâr/Zarar (TRY)']],
        body: tablePerfData,
        theme: 'striped',
        headStyles: { fillColor: [245, 158, 11] }, // Amber/Orange
        styles: { font: 'helvetica' }
      });
    }

    doc.save(`akcefy_rapor_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className={isDarkMode ? "" : "light-mode"}>
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        className="app-container"
      >
      <header className="flex-between" style={{ marginBottom: '2rem' }}>
        <motion.div 
          initial={{ x: -20, opacity: 0 }} 
          animate={{ x: 0, opacity: 1 }}
          style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
        >
          <img 
            src="/logo.png" 
            alt="Akcefy Logo" 
            style={{ 
              height: '48px', 
              width: 'auto', 
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              padding: '4px',
              boxShadow: '0 0 15px rgba(59, 130, 246, 0.3)' 
            }} 
          />
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            Akcefy
          </h1>
        </motion.div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="rates-bar" style={{ display: 'flex', gap: '0.8rem', fontSize: '0.75rem', backgroundColor: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid var(--border-color)', minHeight: '34px', alignItems: 'center' }}>
            {loadingRates ? (
              <span style={{ opacity: 0.5 }}>📊 Kurlar yükleniyor...</span>
            ) : (
              <>
                <span style={{ minWidth: '85px' }}>🇺🇸 USD: ₺{rates.USD.toFixed(2)}</span>
                <span style={{ minWidth: '85px' }}>🇪🇺 EUR: ₺{rates.EUR.toFixed(2)}</span>
                <span style={{ minWidth: '85px' }}>🟡 ALTİN: ₺{rates.GA.toFixed(2)}</span>
              </>
            )}
          </div>
          <button className="btn btn-ghost" onClick={() => setIsDarkMode(!isDarkMode)} style={{ padding: '0.4rem 0.8rem', fontSize: '1.2rem' }} title="Tema Değiştir">
            {isDarkMode ? '🌞' : '🌙'}
          </button>
          <button className="btn btn-ghost" onClick={exportData} style={{ padding: '0.4rem 0.8rem', color: 'var(--income-color)' }} title="Verileri İndir (CSV)">
            📥 Dışa Aktar
          </button>
          <span style={{ color: 'var(--text-secondary)' }}>{user?.email}</span>
          <button className="btn btn-ghost" onClick={resetData} style={{ color: '#f87171' }}>
            ♻️ Sıfırla
          </button>
          <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
            🚪 Çıkış
          </button>
        </div>
      </header>

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card" 
          style={{ borderTop: '4px solid var(--accent-color)' }}
        >
          <div className="flex-between">
            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Net Bakiye</h3>
            <span style={{ fontSize: '1.2rem' }}>💰</span>
          </div>
          <p style={{ fontSize: '1.8rem', fontWeight: '700', marginTop: '0.5rem', color: 'var(--text-primary)' }}>₺{balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card" 
          style={{ borderTop: '4px solid #10b981' }}
        >
          <div className="flex-between">
            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Aylık Gider Oranı</h3>
            <span style={{ fontSize: '1.2rem' }}>📊</span>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              <span>Harcama Limiti</span>
              <span>%{Math.min(100, monthlyProgress).toFixed(0)}</span>
            </div>
            <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, monthlyProgress)}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                style={{ height: '100%', background: monthlyProgress > 90 ? '#ef4444' : '#10b981' }}
              />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              ₺{monthlyExpense.toFixed(2)} / ₺{monthlyIncome.toFixed(2)}
            </p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card" 
          style={{ borderTop: '4px solid #f59e0b' }}
        >
          <div className="flex-between">
            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Net Varlık (Tahmini)</h3>
            <span style={{ fontSize: '1.2rem' }}>💎</span>
          </div>
          <p style={{ fontSize: '1.8rem', fontWeight: '700', marginTop: '0.5rem', color: '#f59e0b' }}>₺{netHoldings.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
        </motion.div>
      </div>

      <div className="tabs-container">
        <div className={`tab ${activeTab === 'transactions' ? 'active' : ''}`} onClick={() => setActiveTab('transactions')}>Gelir & Gider</div>
        <div className={`tab ${activeTab === 'holdings' ? 'active' : ''}`} onClick={() => setActiveTab('holdings')}>Varlıklar & Borçlar</div>
        <div className={`tab ${activeTab === 'trends' ? 'active' : ''}`} onClick={() => setActiveTab('trends')}>Harcama Grafiği</div>
        <div className={`tab ${activeTab === 'performance' ? 'active' : ''}`} onClick={() => setActiveTab('performance')}>Yatırım Performansı</div>
      </div>

      {activeTab === 'transactions' && (
        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          {/* Left Column: Form & Chart */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-card">
              <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--accent-color)' }}>➕</span> Yeni İşlem Ekle
              </h3>
              <form onSubmit={addTransaction}>
                <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                  <button type="button" className={`btn ${type === 'income' ? 'btn-income' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setType('income')}>Gelir</button>
                  <button type="button" className={`btn ${type === 'expense' ? 'btn-expense' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setType('expense')}>Gider</button>
                </div>
                <div className="form-group">
                  <label className="form-label">Tutar (₺)</label>
                  <input type="number" step="0.01" className="form-input" value={amount} onChange={e => setAmount(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Kategori</label>
                  <input type="text" className="form-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="Maaş, Market vs." required />
                </div>
                <div className="form-group">
                  <label className="form-label">Tarih</label>
                  <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Ekle</button>
              </form>
              
              <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Hızlı Gider Ekle</h4>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {[
                    { label: '🍕 Yemek', cat: 'Gıda', amt: 250 },
                    { label: '🚕 Ulaşım', cat: 'Ulaşım', amt: 100 },
                    { label: '☕ Kahve', cat: 'Keyif', amt: 80 },
                    { label: '🛒 Market', cat: 'Market', amt: 500 }
                  ].map(item => (
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      key={item.label} 
                      className="btn btn-ghost" 
                      style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
                      onClick={() => addQuickTransaction(item.cat, item.amt)}
                    >
                      {item.label}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
            <div className="glass-card">
              <h3 style={{ marginBottom: '1rem' }}>Kategori Harcamaları</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {Object.entries(expenseCategories).map(([cat, amt]) => {
                  const percentage = Math.min(100, (amt / (monthlyIncome || 1)) * 100);
                  return (
                    <div key={cat}>
                      <div className="flex-between" style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                        <span>{cat}</span>
                        <span>₺{amt.toFixed(2)} (%{percentage.toFixed(0)})</span>
                      </div>
                      <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 1 }}
                          style={{ height: '100%', background: 'var(--accent-color)' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Transactions List */}
          <div className="glass-card" style={{ overflowY: 'auto', maxHeight: '800px' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Son İşlemler</h3>
            {loading ? <p>Yükleniyor...</p> : transactions.length === 0 ? <p style={{ textAlign: 'center' }}>Henüz işlem yok.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {transactions.map(tx => (
                  <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', borderLeft: `4px solid ${tx.type === 'income' ? 'var(--income-color)' : 'var(--expense-color)'}` }}>
                    <div>
                      <h4 style={{ margin: 0 }}>{tx.category}</h4>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{new Date(tx.date).toLocaleDateString('tr-TR')}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span className={tx.type === 'income' ? 'text-income' : 'text-expense'} style={{ fontWeight: 600 }}>{tx.type === 'income' ? '+' : '-'}₺{Number(tx.amount).toFixed(2)}</span>
                      <button className="btn btn-ghost" onClick={() => deleteTransaction(tx.id)} style={{ padding: '0.2rem 0.5rem' }}>❌</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'holdings' && (
        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          {/* Left Column: Holdings Form */}
          <div className="glass-card">
            <h3 style={{ marginBottom: '1.5rem' }}>Varlık veya Borç Ekle</h3>
            <form onSubmit={addHolding}>
              <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" className={`btn ${holdingType === 'investment' ? 'btn-income' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setHoldingType('investment')}>Yatırım</button>
                <button type="button" className={`btn ${holdingType === 'debt' ? 'btn-expense' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setHoldingType('debt')}>Borç</button>
              </div>
              <div className="form-group">
                <label className="form-label">İsim</label>
                <input type="text" className="form-input" value={holdingName} onChange={e => setHoldingName(e.target.value)} placeholder="Ziraat Bankası, Altın Borcu vs." required />
              </div>
              <div className="form-group">
                <label className="form-label">Miktar</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <input type="number" step="0.01" className="form-input" value={holdingAmount} onChange={e => setHoldingAmount(e.target.value)} required />
                  <select className="form-select" style={{ width: '120px' }} value={holdingUnit} onChange={e => setHoldingUnit(e.target.value)}>
                    <option value="TRY">TRY (₺)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GA">GR ALTIN</option>
                  </select>
                </div>
              </div>

              {holdingType === 'investment' && holdingUnit !== 'TRY' && (
                <div className="form-group" style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <label className="form-label" style={{ marginBottom: '0.8rem' }}>Bu yatırımı şu anki fiyattan mı aldınız?</label>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input type="radio" checked={isCurrentPrice} onChange={() => setIsCurrentPrice(true)} />
                      <span>Evet (Güncel Kur)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input type="radio" checked={!isCurrentPrice} onChange={() => setIsCurrentPrice(false)} />
                      <span>Hayır (Eski Yatırım)</span>
                    </label>
                  </div>
                  
                  {!isCurrentPrice && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                      <label className="form-label">Birim Alış Fiyatı (₺)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        className="form-input" 
                        value={purchasePrice} 
                        onChange={e => setPurchasePrice(e.target.value)} 
                        placeholder="Örn: 3100" 
                        required={!isCurrentPrice} 
                      />
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        1 {holdingUnit} için ödediğiniz TL tutarını girin.
                      </p>
                    </motion.div>
                  )}
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>Ekle</button>
            </form>
          </div>
          {/* Right Column: Holdings List */}
          <div className="glass-card" style={{ overflowY: 'auto', maxHeight: '800px' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Mevcut Varlık ve Borçlar</h3>
            {holdings.length === 0 ? <p style={{ textAlign: 'center' }}>Kayıtlı varlık veya borç bulunmuyor.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {holdings.map(h => {
                  const tryValue = calculateValue(h.amount, h.unit);
                  const totalCost = (h.purchase_price || 0) * h.amount;
                  const profitLoss = tryValue - totalCost;
                  const profitPercentage = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;
                  const isProfit = profitLoss >= 0;

                  return (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1.2rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', borderLeft: `4px solid ${h.type === 'investment' ? '#4ade80' : '#f87171'}`, position: 'relative' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {h.name} 
                          <span className="unit-tag" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'var(--bg-default)', borderRadius: '12px' }}>
                            {h.amount} {h.unit}
                          </span>
                        </h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            Güncel Değer: <strong style={{ color: 'var(--text-primary)' }}>₺{tryValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong>
                          </span>
                          
                          {h.type === 'investment' && h.purchase_price > 0 && h.unit !== 'TRY' && (
                            <span style={{ color: 'var(--text-secondary)' }}>
                              Maliyet: ₺{totalCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} 
                              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}> (Birim: ₺{h.purchase_price})</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: '0.5rem' }}>
                        <span className={h.type === 'investment' ? 'text-investment' : 'text-debt'} style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                          {h.type === 'investment' ? '+' : '-'}₺{tryValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>

                        {h.type === 'investment' && h.purchase_price > 0 && h.unit !== 'TRY' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', color: isProfit ? 'var(--income-color)' : 'var(--expense-color)', background: isProfit ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
                            <span>{isProfit ? '📈' : '📉'}</span>
                            <span style={{ fontWeight: 600 }}>
                              {isProfit ? '+' : ''}₺{Math.abs(profitLoss).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                              ({isProfit ? '+' : ''}%{Math.abs(profitPercentage).toFixed(2)})
                            </span>
                          </div>
                        )}

                        <button className="btn btn-ghost" onClick={() => deleteHolding(h.id)} style={{ padding: '0.2rem', fontSize: '0.8rem', position: 'absolute', top: '0.5rem', right: '0.5rem', opacity: 0.5 }}>❌</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'trends' && (
        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr)', gap: '2rem' }}>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card" 
          >
            <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '1.2rem', margin: 0 }}>📊 Harcama Grafiği (Son 6 Ay)</h3>
            </div>
            <div style={{ height: '400px', width: '100%' }}>
              <Bar data={trendChartData} options={trendChartOptions} />
            </div>
          </motion.div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr)', gap: '2rem' }}>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card"
          >
            <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '1.2rem', margin: 0 }}>📈 Yatırım Performansı Detayları</h3>
            </div>
            
            <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.5rem' }}>💡</span>
              <div>
                <h4 style={{ margin: '0 0 0.3rem 0', color: 'var(--text-primary)', fontSize: '0.95rem' }}>Eski Yatırımlarınızı da Ekleyebilirsiniz!</h4>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                  Varlıklar sekmesinden döviz veya altın eklerken <strong>"Hayır (Eski Yatırım)"</strong> seçeneğini işaretleyerek, geçmişte aldığınız yatırımların maliyet fiyatını girebilirsiniz. Böylece eski yatırımlarınızın da bugün ne kadar kâr ettirdiğini anlık takip edebilirsiniz.
                </p>
              </div>
            </div>

            {holdings.filter(h => h.type === 'investment' && h.unit !== 'TRY' && h.purchase_price > 0).length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0' }}>
                Henüz kâr/zarar takibi yapılan bir yatırımınız bulunmuyor.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                {holdings
                  .filter(h => h.type === 'investment' && h.unit !== 'TRY' && h.purchase_price > 0)
                  .map(h => {
                    const currentPrice = h.unit === 'USD' ? rates.USD : h.unit === 'EUR' ? rates.EUR : h.unit === 'GA' ? rates.GA : 1;
                    const currentValue = currentPrice * h.amount;
                    const totalCost = h.purchase_price * h.amount;
                    const profitLoss = currentValue - totalCost;
                    const profitPercentage = (profitLoss / totalCost) * 100;
                    const isProfit = profitLoss >= 0;

                    return (
                      <div key={h.id} style={{ padding: '1.5rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem' }}>
                          <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{h.name} <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>({h.amount} {h.unit})</span></h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '1.2rem', color: isProfit ? 'var(--income-color)' : 'var(--expense-color)', fontWeight: 800 }}>
                            {isProfit ? '+' : ''}₺{Math.abs(profitLoss).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '1rem', alignItems: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Maliyet Kur</div>
                            <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>₺{h.purchase_price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Toplam: ₺{totalCost.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}</div>
                          </div>
                          
                          <div style={{ width: '1px', height: '100%', backgroundColor: 'var(--border-color)' }}></div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Güncel Kur</div>
                            <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>₺{currentPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Toplam: ₺{currentValue.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}</div>
                          </div>
                        </div>

                        <div style={{ backgroundColor: isProfit ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '0.8rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                          <span style={{ fontSize: '1.2rem' }}>{isProfit ? '🚀' : '📉'}</span>
                          <span style={{ color: isProfit ? 'var(--income-color)' : 'var(--expense-color)', fontWeight: 700, fontSize: '1rem' }}>
                            {isProfit ? 'Kâr:' : 'Zarar:'} {isProfit ? '+' : ''}%{Math.abs(profitPercentage).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </motion.div>
        </div>
      )}
      </motion.div>
      <div style={{ textAlign: 'center', padding: '2rem 1rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.7, fontFamily: 'Outfit, sans-serif' }}>
        by elber
      </div>
    </div>
  );
}
