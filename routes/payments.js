const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const db = require('../config/db');
const { sendAdminPaymentAlert } = require('../utils/email');
const authenticate = require('../middleware/auth');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_mock'
});

// Mock Plans Mapping for Local Testing
// In real life, these would be created in the Razorpay Dashboard.
const RAZORPAY_PLAN_MAP = {
    'starter_monthly': 'plan_starter_monthly',
    'starter_yearly': 'plan_starter_yearly',
    'supporter_monthly': 'plan_supporter_monthly',
    'supporter_yearly': 'plan_supporter_yearly',
    'professional_monthly': 'plan_professional_monthly',
    'professional_yearly': 'plan_professional_yearly',
    'business_monthly': 'plan_business_monthly',
    'business_yearly': 'plan_business_yearly',
    'lifetime_monthly': 'plan_lifetime_monthly',
    'lifetime_yearly': 'plan_lifetime_yearly',
};

// ─── 1. Create Subscription ─────────────────────────────────
router.post('/create-subscription', authenticate, async (req, res) => {
    try {
        const { planCode, interval = 'monthly' } = req.body;
        
        // Prevent upgrading to Free plan via Razorpay (handled internally)
        if (planCode === 'free') {
            return res.status(400).json({ status: 'error', message: 'Cannot checkout for a free plan.' });
        }

        const planRes = await db.query('SELECT * FROM plans WHERE code = $1 AND is_active = true', [planCode]);
        if (planRes.rows.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Invalid or inactive plan selected.' });
        }

        const planMapKey = `${planCode}_${interval}`;
        let razorpayPlanId = RAZORPAY_PLAN_MAP[planMapKey];
        
        // --- LOCAL SANDBOX MODE ---
        const isMock = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.includes('mock');
        
        if (isMock) {
            console.log('[Sandbox] Creating mock Razorpay subscription...');
            return res.json({ 
                status: 'success', 
                subscription_id: 'sub_mock_123',
                key_id: 'rzp_test_mock'
            });
        }

        if (!razorpayPlanId) {
             // Fallback for real API if mapping is missing (user needs to add real plans)
             return res.status(400).json({ status: 'error', message: 'Razorpay Plan ID not configured for this plan.' });
        }

        const subscription = await razorpay.subscriptions.create({
            plan_id: razorpayPlanId,
            total_count: 120, // Max billing cycles
            customer_notify: 1,
            notes: {
                user_id: req.userId,
                plan_code: planCode,
                interval: interval
            }
        });

        res.json({ status: 'success', subscription_id: subscription.id, key_id: process.env.RAZORPAY_KEY_ID });

    } catch (err) {
        console.error('Checkout error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error during checkout.' });
    }
});

// ─── 2. Verify Payment (Called by Frontend after success) ───
router.post('/verify-subscription', authenticate, async (req, res) => {
    try {
        const { 
            razorpay_payment_id, 
            razorpay_subscription_id, 
            razorpay_signature,
            planCode,
            interval = 'monthly'
        } = req.body;

        const userId = req.userId;

        // --- LOCAL SANDBOX MODE ---
        const isMock = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.includes('mock');
        
        if (isMock) {
            console.log('[Sandbox] Verifying mock Razorpay subscription...');
            // Skip cryptographic signature check for mock
        } else {
            // Real Signature Verification
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(razorpay_payment_id + '|' + razorpay_subscription_id)
                .digest('hex');

            if (expectedSignature !== razorpay_signature) {
                return res.status(400).json({ status: 'error', message: 'Invalid payment signature.' });
            }
        }

        // Upgrade Database
        const planRes = await db.query('SELECT * FROM plans WHERE code = $1', [planCode]);
        if (planRes.rows.length === 0) return res.status(400).json({ status: 'error', message: 'Plan not found.' });
        const plan = planRes.rows[0];
        
        // Update User
        await db.query(`
            UPDATE users 
            SET plan = $1, razorpay_subscription_id = $2,
                plan_starts_at = NOW(), plan_expires_at = NOW() + INTERVAL '1 ${interval === 'yearly' ? 'year' : 'month'}'
            WHERE id = $3
        `, [planCode, razorpay_subscription_id, userId]);

        // Update API Key limit
        await db.query(`
            UPDATE api_keys SET daily_limit = $1 WHERE user_id = $2 AND is_active = true
        `, [plan.daily_limit, userId]);

        // Insert Payment Record
        const insertRes = await db.query(`
            INSERT INTO payments (user_id, razorpay_payment_id, razorpay_subscription_id, razorpay_signature, plan_code, amount, currency, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'paid')
            ON CONFLICT (razorpay_payment_id) DO NOTHING
            RETURNING id
        `, [
            userId, 
            razorpay_payment_id, 
            razorpay_subscription_id, 
            razorpay_signature, 
            planCode, 
            interval === 'yearly' ? plan.price_yearly : plan.price_monthly, 
            'USD' // Razorpay handles INR/USD dynamically, we just record the plan's base USD value for analytics
        ]);

        // If this is the first time we've seen this payment, send email
        if (insertRes.rowCount > 0) {
            console.log(`[Razorpay Verify] Upgraded user ${userId} to ${planCode}`);
            try {
                const userRes = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
                if (userRes.rows.length > 0) {
                    await sendAdminPaymentAlert(
                        userRes.rows[0].email, 
                        plan.name, 
                        parseFloat(interval === 'yearly' ? plan.price_yearly : plan.price_monthly).toFixed(2), 
                        'USD'
                    );
                }
            } catch (e) { console.error('Email error:', e); }
        }

        return res.json({ status: 'success', message: 'Payment verified and applied.' });

    } catch (err) {
        console.error('Verify session error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to verify session.' });
    }
});

module.exports = router;
