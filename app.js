const express = require('express');
const cors = require('cors');
// Kita butuh rates.json sebagai DATA CADANGAN awal (jika internet mati pas start)
let ratesData = require('./rates.json'); 
const usersData = require('./users.json');

// --- LIBRARY SWAGGER ---
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./api-docs.yaml');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
// Folder 'public' berisi file frontend (html/css)
app.use(express.static('public')); 
// Route Dokumentasi
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// --- FUNGSI UPDATE KURS LIVE (REAL-TIME) ---
async function updateKursRealTime() {
    try {
        console.log("⏳ [SYSTEM] Sedang mengambil data kurs LIVE dari internet...");
        
        // Mengambil data dari API Publik (Gratis)
        const response = await fetch('https://open.er-api.com/v6/latest/IDR');
        const json = await response.json();

        if (json.result === "success") {
            ratesData.date = json.time_last_update_utc;
            
            // LOGIKA: API memberi data "1 IDR dapet berapa USD".
            // Kita balik rumusnya jadi "1 USD harganya berapa Rupiah" (1 / rate).
            ratesData.rates = {
                "USD": Math.round(1 / json.rates.USD), // Amerika
                "SGD": Math.round(1 / json.rates.SGD), // Singapura
                "MYR": Math.round(1 / json.rates.MYR), // Malaysia
                "JPY": Math.round(1 / json.rates.JPY), // Jepang
                "EUR": Math.round(1 / json.rates.EUR), // Eropa
                "GBP": Math.round(1 / json.rates.GBP), // Inggris
                "SAR": Math.round(1 / json.rates.SAR), // Arab Saudi
                "AUD": Math.round(1 / json.rates.AUD), // Australia
                "CNY": Math.round(1 / json.rates.CNY), // China
                "KRW": Math.round(1 / json.rates.KRW), // Korea
                "THB": Math.round(1 / json.rates.THB), // Thailand
                "HKD": Math.round(1 / json.rates.HKD)  // Hong Kong
            };

            console.log("✅ [SYSTEM] SUKSES! Data kurs berhasil di-update.");
        }
    } catch (error) {
        console.log("⚠️ [SYSTEM] Gagal ambil data live (Menggunakan data lokal rates.json):", error.message);
    }
}

// 1. Update saat server pertama kali nyala
updateKursRealTime();

// 2. Update otomatis setiap 1 jam (3.600.000 milidetik)
setInterval(updateKursRealTime, 3600000);


// --- MIDDLEWARE (SATPAM API KEY) ---
const cekApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) return res.status(401).json({ error: "Akses Ditolak! Harap sertakan API Key." });
    
    const user = usersData.find(u => u.api_key === apiKey);
    if (!user) return res.status(403).json({ error: "API Key tidak valid!" });

    req.user = user;
    next();
};


// --- ENDPOINT API ---

// GET: Lihat Semua Data
app.get('/api/rates', cekApiKey, (req, res) => {
    console.log(`[LOG] User ${req.user.username} melihat daftar kurs.`);
    res.json({
        status: "success",
        source: "Live Market Data",
        last_update: ratesData.date,
        data: ratesData
    });
});

// POST: Hitung Konversi (Anti-Crash)
app.post('/api/convert', cekApiKey, (req, res) => {
    try {
        const { currency, amount } = req.body;
        
        // Validasi
        if (!currency || !amount) return res.status(400).json({ error: "Mohon masukkan currency dan amount" });
        
        // Cek Ketersediaan Mata Uang
        const rate = ratesData.rates[currency];
        if (!rate) return res.status(400).json({ error: `Mata uang ${currency} tidak tersedia` });

        // Hitung
        const totalIDR = Number(amount) * rate;

        res.json({
            from: currency,
            to: "IDR",
            rate_used: rate,
            amount_input: Number(amount),
            result_idr: totalIDR
        });
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, () => {
    console.log(`--------------------------------------------------`);
    console.log(`✅ Server berjalan di http://localhost:${PORT}`);
    console.log(`--------------------------------------------------`);
});