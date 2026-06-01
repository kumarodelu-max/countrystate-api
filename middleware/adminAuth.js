/**
 * Admin Authentication Middleware
 * Must be used AFTER the `auth.js` middleware.
 * Verifies that the authenticated user has the 'admin' role.
 */
const requireAdmin = (req, res, next) => {
    if (!req.userRole || req.userRole !== 'admin') {
        return res.status(403).json({
            status: 'error',
            message: 'Forbidden. Admin access required.'
        });
    }
    next();
};

module.exports = requireAdmin;
