const express = require('express');
const passport = require('passport');
const router = express.Router();

const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { 
  validate, 
  registerValidation, 
  loginValidation, 
  profileValidation 
} = require('../middleware/validation');
const { getUserNotifications, markNotificationRead, markAllNotificationsRead } = require('../services/emailService');

// Public routes
router.post('/register', registerValidation, validate, authController.register);
router.post('/login', loginValidation, validate, authController.login);

// Google OAuth routes
router.get('/google', passport.authenticate('google', { 
  scope: ['profile', 'email'] 
}));

router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login?error=oauth_failed' }),
  authController.googleCallback
);

// Protected routes (require authentication)
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, profileValidation, validate, authController.updateProfile);
router.put('/password', authenticate, authController.changePassword);

// Notification routes
router.get('/notifications', authenticate, getUserNotifications);
router.put('/notifications/:id/read', authenticate, markNotificationRead);
router.put('/notifications/read-all', authenticate, markAllNotificationsRead);

// Verify token route
router.get('/verify', authenticate, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.first_name,
      lastName: req.user.last_name
    }
  });
});

// Logout (client-side will clear token)
router.post('/logout', (req, res) => {
  req.logout?.(() => {});
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;
