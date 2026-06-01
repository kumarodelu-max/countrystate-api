const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authenticate = require('../middleware/auth');
const requireAdmin = require('../middleware/adminAuth');

// All admin routes must pass BOTH authentication and admin check
router.use(authenticate);
router.use(requireAdmin);

router.get('/users',                    adminController.getUsers);
router.post('/users',                   adminController.createUser);
router.get('/users/:userId/logs',       adminController.getUserLogs);
router.put('/users/:userId/limit',      adminController.updateUserLimit);
router.post('/users/:userId/promos',    adminController.createPromo);

router.get('/plans',               adminController.getPlans);
router.post('/plans',              adminController.createPlan);
router.put('/plans/:planId',       adminController.updatePlan);

module.exports = router;
