const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');
const db = require('../config/db');
const authenticate = require('../middleware/auth');

// ─── 1. Create Checkout Session ─────────────────────────────────
router.post('/create-checkout-session', authenticate, async (req, res) => {
    try {
        const { planCode, interval = 'monthly' } = req.body;
        
        // Get plan details from DB
        const planRes = await db.query('SELECT * FROM plans WHERE code = $1 AND is_active = true', [planCode]);
        if (planRes.rows.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Invalid or inactive plan selected.' });
        }
        
        const plan = planRes.rows[0];
        
        // Prevent upgrading to Free plan via Stripe (handled internally)
        if (planCode === 'free') {
            return res.status(400).json({ status: 'error', message: 'Cannot checkout for a free plan.' });
        }

        const price = interval === 'yearly' ? plan.price_yearly : plan.price_monthly;
        if (!price || price <= 0) {
             return res.status(400).json({ status: 'error', message: 'Invalid plan price.' });
        }

        // Create Checkout Session
        const sessionPayload = {
            payment_method_types: ['card'],
            mode: 'subscription',
            client_reference_id: req.userId,
            metadata: {
                plan_code: planCode,
                interval: interval
            },
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `CountryState API - ${plan.name} Plan (${interval})`,
                            description: `Up to ${parseInt(plan.daily_limit).toLocaleString()} requests/day`,
                        },
                        unit_amount: Math.round(parseFloat(price) * 100), // Stripe expects cents
                        recurring: {
                            interval: interval === 'yearly' ? 'year' : 'month',
                        },
                    },
                    quantity: 1,
                },
            ],
            success_url: `${req.protocol}://${req.get('host')}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.protocol}://${req.get('host')}/?checkout=canceled`,
        };
        
        if (req.userEmail) {
            sessionPayload.customer_email = req.userEmail;
        }

        // --- LOCAL SANDBOX MODE (For sk_test_mock) ---
        if (process.env.STRIPE_SECRET_KEY === 'sk_test_mock') {
            console.log('[Sandbox] Mocking successful payment and upgrading user locally...');
            
            // 1. Upgrade User
            await db.query(`
                UPDATE users 
                SET plan = $1, 
                    stripe_customer_id = 'cus_mock_123', 
                    stripe_subscription_id = 'sub_mock_123',
                    plan_starts_at = NOW(),
                    plan_expires_at = NOW() + INTERVAL '1 ${interval === 'yearly' ? 'year' : 'month'}'
                WHERE id = $2
            `, [planCode, req.userId]);

            // 2. Upgrade Limits
            await db.query(`
                UPDATE api_keys 
                SET daily_limit = $1 
                WHERE user_id = $2 AND is_active = true
            `, [plan.daily_limit, req.userId]);

            // 3. Record fake payment
            await db.query(`
                INSERT INTO payments (user_id, stripe_session_id, stripe_customer_id, plan_code, amount, currency, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'paid')
                ON CONFLICT (stripe_session_id) DO NOTHING
            `, [req.userId, 'cs_test_mock_' + Date.now(), 'cus_mock_123', planCode, price, 'usd']);

            return res.json({ status: 'success', url: sessionPayload.success_url.replace('{CHECKOUT_SESSION_ID}', 'cs_test_mock_123') });
        }
        // ----------------------------------------------

        const session = await stripe.checkout.sessions.create(sessionPayload);

        res.json({ status: 'success', url: session.url });

    } catch (err) {
        console.error('[Stripe] Checkout Error:', err.message || err);
        res.status(500).json({ status: 'error', message: 'Failed to create checkout session. Error: ' + (err.message || 'Unknown') });
    }
});

// ─── 2. Stripe Webhook ──────────────────────────────────────────
// Webhooks must use express.raw({type: 'application/json'}) before parsing,
// but since we globally apply express.json() in server.js, we must handle it there or verify signature carefully.
// To bypass express.json() for webhooks, it's usually defined BEFORE express.json() in server.js.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // req.body is raw buffer here IF we configure server.js correctly
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`[Stripe Webhook] Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        const userId = session.client_reference_id;
        const planCode = session.metadata.plan_code;
        const interval = session.metadata.interval;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (userId && planCode) {
            try {
                // Get plan limits
                const planRes = await db.query('SELECT * FROM plans WHERE code = $1', [planCode]);
                if (planRes.rows.length > 0) {
                    const plan = planRes.rows[0];
                    
                    // Update User
                    await db.query(`
                        UPDATE users 
                        SET plan = $1, 
                            stripe_customer_id = $2, 
                            stripe_subscription_id = $3,
                            plan_starts_at = NOW(),
                            plan_expires_at = NOW() + INTERVAL '1 ${interval === 'yearly' ? 'year' : 'month'}'
                        WHERE id = $4
                    `, [planCode, customerId, subscriptionId, userId]);

                    // Update their active API Key limit
                    await db.query(`
                        UPDATE api_keys 
                        SET daily_limit = $1 
                        WHERE user_id = $2 AND is_active = true
                    `, [plan.daily_limit, userId]);

                    // Insert Payment Record
                    await db.query(`
                        INSERT INTO payments (user_id, stripe_session_id, stripe_customer_id, plan_code, amount, currency, status)
                        VALUES ($1, $2, $3, $4, $5, $6, 'paid')
                        ON CONFLICT (stripe_session_id) DO NOTHING
                    `, [userId, session.id, customerId, planCode, session.amount_total / 100, session.currency]);

                    console.log(`[Stripe] Successfully upgraded user ${userId} to ${planCode}`);
                }
            } catch (dbErr) {
                console.error('[Stripe DB Error]', dbErr);
            }
        }
    }

    // Acknowledge receipt
    res.json({ received: true });
});

module.exports = router;
