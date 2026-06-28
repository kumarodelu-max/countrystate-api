const express = require('express');
const router = express.Router();
const { register, login, generateKey, revokeKey, verifyEmail, updateSettings } = require('../controllers/authController');
const authenticate = require('../middleware/auth');
const authController = require('../controllers/authController');
const { rateLimiter } = require('../middleware/rateLimiter');
// Public routes
router.post('/register', register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/verify/:token', authController.verifyEmail);
router.get('/plans', authController.getPublicPlans);
router.get('/unsubscribe', authController.unsubscribeEmail);


// Protected routes (require valid API key)
router.get('/me',                 authenticate, authController.getMe);
router.get('/promos',             authenticate, authController.getActivePromos);
router.post('/keys/generate',     authenticate, generateKey);
router.delete('/keys/:keyId',     authenticate, revokeKey);
router.put('/settings',           authenticate, updateSettings);
router.post('/toggle-subscription', authenticate, authController.toggleSubscription);

module.exports = router;
