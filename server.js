require('dotenv').config();
const express = require('express');
const path    = require('path');
const cors    = require('cors');
const helmet  = require('helmet');
const { startEmailJobs } = require('./cron/emailJobs');
const { startExpirationJobs } = require('./cron/checkExpirations');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Core Middleware ──────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com", "https://challenges.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://cdn-icons-png.flaticon.com", "https://badges.razorpay.com"],
            frameSrc: ["'self'", "https://challenges.cloudflare.com", "https://api.razorpay.com"],
            connectSrc: ["'self'", "https://api.razorpay.com", "https://lumberjack.razorpay.com"]
        }
    }
}));
app.use(cors());

// Stripe Webhooks MUST be parsed as raw body BEFORE express.json() intercepts it
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

// Serve frontend website
app.use(express.static(path.join(__dirname, 'public')));

// ─── Health Check ─────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'success',
        message: 'CountryState API is running',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
    });
});

// ─── Routes ───────────────────────────────────────────
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/v1/contact', require('./routes/contact'));
app.use('/api/v1',    require('./routes/geo'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));

// ─── 404 Handler ──────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: `Route ${req.method} ${req.path} not found.`,
        docs: 'https://countrystate.in/docs',
    });
});

// ─── Global Error Handler ─────────────────────────────
app.use((err, req, res, next) => {
    console.error('[Server] Unhandled error:', err);
    res.status(500).json({
        status: 'error',
        message: 'An unexpected error occurred.',
    });
});

// ─── Start Server ─────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ CountryState API running on http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health`);
    
    // Start automated email jobs
    startEmailJobs();
    startExpirationJobs();
});
