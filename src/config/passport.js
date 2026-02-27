const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { query } = require('./database');

module.exports = function(passport) {
  // Serialize user for session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id, done) => {
    try {
      const result = await query('SELECT * FROM users WHERE id = $1', [id]);
      done(null, result.rows[0] || null);
    } catch (error) {
      done(error, null);
    }
  });

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user exists
        let result = await query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
        
        if (result.rows.length > 0) {
          // User exists, return user
          return done(null, result.rows[0]);
        }

        // Check if email already exists (user registered via email)
        const email = profile.emails[0]?.value;
        if (email) {
          result = await query('SELECT * FROM users WHERE email = $1', [email]);
          
          if (result.rows.length > 0) {
            // Link Google account to existing user
            await query(
              'UPDATE users SET google_id = $1, profile_picture = $2 WHERE email = $3',
              [profile.id, profile.photos[0]?.value, email]
            );
            result = await query('SELECT * FROM users WHERE email = $1', [email]);
            return done(null, result.rows[0]);
          }
        }

        // Create new user
        const newUser = await query(
          `INSERT INTO users (email, google_id, first_name, last_name, profile_picture)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [
            email,
            profile.id,
            profile.name?.givenName || '',
            profile.name?.familyName || '',
            profile.photos[0]?.value || null
          ]
        );

        // Create default categories for new user
        await createDefaultCategories(newUser.rows[0].id);

        return done(null, newUser.rows[0]);
      } catch (error) {
        return done(error, null);
      }
    }));
  }
};

// Helper function to create default categories
async function createDefaultCategories(userId) {
  const defaultCategories = [
    // Income categories
    { name: 'Salary', type: 'income', color: '#22c55e', icon: 'briefcase' },
    { name: 'Freelance', type: 'income', color: '#10b981', icon: 'laptop' },
    { name: 'Investments', type: 'income', color: '#14b8a6', icon: 'trending-up' },
    { name: 'Other Income', type: 'income', color: '#06b6d4', icon: 'plus-circle' },
    
    // Expense categories
    { name: 'Food & Dining', type: 'expense', color: '#ef4444', icon: 'utensils' },
    { name: 'Transportation', type: 'expense', color: '#f97316', icon: 'car' },
    { name: 'Shopping', type: 'expense', color: '#f59e0b', icon: 'shopping-bag' },
    { name: 'Entertainment', type: 'expense', color: '#eab308', icon: 'film' },
    { name: 'Bills & Utilities', type: 'expense', color: '#84cc16', icon: 'zap' },
    { name: 'Healthcare', type: 'expense', color: '#ec4899', icon: 'heart' },
    { name: 'Education', type: 'expense', color: '#8b5cf6', icon: 'book' },
    { name: 'Other Expenses', type: 'expense', color: '#6366f1', icon: 'more-horizontal' }
  ];

  for (const cat of defaultCategories) {
    try {
      await query(
        `INSERT INTO categories (user_id, name, type, color, icon, is_default)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (user_id, name, type) DO NOTHING`,
        [userId, cat.name, cat.type, cat.color, cat.icon]
      );
    } catch (error) {
      console.error('Error creating default category:', error.message);
    }
  }
}

module.exports.createDefaultCategories = createDefaultCategories;
