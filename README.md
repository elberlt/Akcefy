# Akcefy - Akıllı Finans Takibi

Akcefy, kişisel finansınızı, yatırımlarınızı ve borçlarınızı profesyonelce takip etmenizi sağlayan modern bir web uygulamasıdır. 2026 model finansal yönetim deneyimi sunar.

## 🚀 Özellikler

- **Anlık Döviz & Altın Takibi:** USD, EUR ve Gram Altın fiyatlarını gerçek zamanlı (cache-busting özellikli) izleyin.
- **Gelir & Gider Yönetimi:** İşlemlerinizi kategorize edin ve aylık özetlerinizi grafiklerle görün.
- **Varlık & Borç Takibi:** Banka hesapları, nakit ve borçlarınızı tek bir panelden yönetin.
- **Modern UI/UX:** `framer-motion` ile güçlendirilmiş, göz alıcı animasyonlar ve yüksek kontrastlı "Premium Dark" tema.
- **Güvenli Bulut Altyapısı:** Verileriniz Supabase (PostgreSQL) üzerinde güvenle saklanır.
- **Hızlı İşlemler:** Sık kullanılan harcamalar için tek tıkla ekleme butonları.

## 🛠️ Teknolojiler

- **Frontend:** React + Vite
- **Styling:** Vanilla CSS (Modern CSS Variables & Glassmorphism)
- **Animasyon:** Framer Motion
- **Database & Auth:** Supabase
- **Icons:** Lucide React

## 📦 Kurulum

1. Depoyu klonlayın:
   ```bash
   git clone https://github.com/kullaniciadi/akcefy.git
   cd akcefy
   ```

2. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

3. `.env` dosyasını oluşturun ve Supabase bilgilerinizi girin:
   ```env
   VITE_SUPABASE_URL=your_url
   VITE_SUPABASE_ANON_KEY=your_key
   ```

4. Uygulamayı başlatın:
   ```bash
   npm run dev
   ```

## 📄 Lisans

Bu proje MIT lisansı ile lisanslanmıştır.
