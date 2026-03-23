import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "./db.js";

const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback";

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase()?.trim();
          if (!email) {
            return done(new Error("Google profile did not include email"));
          }

          let user = await prisma.user.findUnique({ where: { email } });
          if (!user) {
            const placeholderHash = await bcrypt.hash(`google:${profile.id}`, 12);
            user = await prisma.user.create({
              data: {
                name: profile.displayName || email.split("@")[0] || "Google User",
                email,
                passwordHash: placeholderHash,
                avatarUrl: profile.photos?.[0]?.value || null,
              },
            });
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

export { passport };
