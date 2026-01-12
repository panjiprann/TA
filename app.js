const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- DATA KURS (Cache Lokal) ---
// Pastikan file rates.json ada di folder project (isinya {} kosong tidak masalah awalnya)
let ratesData = require('./rates.json'); 

// --- SWAGGER ---
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./api-docs.yaml');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); 
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// --- SERVICE: UPDATE KURS REALTIME (20+ Mata Uang) ---
async function updateKursRealTime() {
    try {
        const response = await fetch('https://open.er-api.com/v6/latest/IDR');
        const json = await response.json();
        
        if (json.result === "success") {
            ratesData.date = json.time_last_update_utc;
            
            // Daftar Mata Uang Populer yang ingin ditampilkan
            const currencies = [
                "USD", "SGD", "MYR", "JPY", "EUR", "SAR", "CNY", "KRW", "AUD", 
                "GBP", "THB", "HKD", "TWD", "CAD", "NZD", "INR", "PHP", "VND", 
                "AED", "TRY", "CHF"
            ];

            let newRates = {};
            // Membalik logika: 1 Asing = Berapa Rupiah
            currencies.forEach(code => {
                if(json.rates[code]) {
                    newRates[code] = Math.round(1 / json.rates[code]);
                }
            });

            ratesData.rates = newRates;
            console.log("✅ Data Kurs Diperbarui (20+ Mata Uang)");
        }
    } catch (e) { 
        console.log("⚠️ Gagal update kurs (Menggunakan cache lama)"); 
    }
}
// Update saat start, lalu ulangi setiap 1 jam
updateKursRealTime();
setInterval(updateKursRealTime, 3600000); 

// ==========================================
// 1. ENDPOINT AUTH (LOGIN & REGISTER)
// ==========================================

app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    const randomKey = 'key_' + Math.random().toString(36).substring(2) + Date.now().toString(36);

    try {
        const newUser = await prisma.user.create({
            data: { username, password, role: 'user', api_key: randomKey }
        });
        res.json({ status: "success", message: "Register Berhasil", data: newUser });
    } catch (error) {
        res.status(400).json({ error: "Username sudah digunakan" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || user.password !== password) {
        return res.status(401).json({ error: "Username atau Password salah" });
    }

    res.json({
        status: "success",
        username: user.username,
        role: user.role,
        api_key: user.api_key
    });
});

// ==========================================
// 2. MIDDLEWARE (KEAMANAN)
// ==========================================

const cekApiKey = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey) return res.status(401).json({ error: "API Key tidak ditemukan" });

    const user = await prisma.user.findUnique({ where: { api_key: apiKey } });
    if (!user) return res.status(403).json({ error: "API Key tidak valid" });

    req.user = user; 
    next();
};

const cekAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Akses Ditolak: Khusus Admin" });
    next();
};

// ==========================================
// 3. FITUR UTAMA (READ & CREATE ACTION)
// ==========================================

// READ DATA (GET)
app.get('/api/rates', cekApiKey, (req, res) => {
    res.json({ status: "success", data: ratesData });
});

// ACTION (POST)
app.post('/api/convert', cekApiKey, (req, res) => {
    const { currency, amount } = req.body;
    const rate = ratesData.rates[currency];
    
    if (!rate) return res.status(400).json({ error: "Mata uang tidak ditemukan" });
    
    res.json({
        from: currency,
        to: "IDR",
        rate: rate,
        amount: parseFloat(amount),
        result: parseFloat(amount) * rate
    });
});

// ==========================================
// 4. ADMIN PANEL (READ, DELETE, UPDATE)
// ==========================================

// READ ALL USERS (GET)
app.get('/api/admin/users', cekApiKey, cekAdmin, async (req, res) => {
    const allUsers = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    res.json({ status: "success", users: allUsers });
});

// DELETE USER (DELETE)
app.delete('/api/admin/users/:id', cekApiKey, cekAdmin, async (req, res) => {
    const idUser = parseInt(req.params.id);
    if (req.user.id === idUser) return res.status(400).json({ error: "Tidak bisa menghapus akun sendiri" });

    try {
        await prisma.user.delete({ where: { id: idUser } });
        res.json({ status: "success", message: "User berhasil dihapus" });
    } catch (error) {
        res.status(500).json({ error: "Gagal menghapus user" });
    }
});

// UPDATE USER KEY (PUT) - Memenuhi Syarat CRUD Update
app.put('/api/admin/users/:id/reset-key', cekApiKey, cekAdmin, async (req, res) => {
    const idUser = parseInt(req.params.id);
    const newKey = 'key_' + Math.random().toString(36).substring(2) + Date.now().toString(36);

    try {
        await prisma.user.update({ where: { id: idUser }, data: { api_key: newKey } });
        res.json({ status: "success", message: "Key diperbarui (PUT)", new_key: newKey });
    } catch (error) {
        res.status(500).json({ error: "Gagal update key" });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server IndoRates Pro berjalan di http://localhost:${PORT}`);
});