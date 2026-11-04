import axios from "axios";
import crypto from "crypto";
import InstagramAccount from "../models/InstagramAccount.js";
import { encryptToken } from "../utils/tokenCrypto.js";

const REQUIRED_ENV = [
  "IG_CLIENT_ID",
  "IG_CLIENT_SECRET",
  "IG_REDIRECT_URI"
];

function assertOAuthConfig() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing OAuth configuration: ${missing.join(", ")}`);
  }
}

function generateSignedState() {
  const secret = process.env.SESSION_SECRET || "development-only-change-this-secret";
  const ts = Date.now().toString();
  const rand = crypto.randomBytes(16).toString("hex");
  const hmac = crypto.createHmac("sha256", secret).update(`${ts}.${rand}`).digest("hex");
  return `${ts}.${rand}.${hmac}`;
}

function isValidOAuthState(state, sessionState) {
  if (sessionState && state === sessionState) {
    return true;
  }
  if (!state || typeof state !== "string") {
    return false;
  }
  const parts = state.split(".");
  if (parts.length !== 3) {
    return false;
  }
  const [ts, rand, hmac] = parts;
  const timestamp = Number(ts);
  // Valid for 20 minutes
  if (isNaN(timestamp) || Date.now() - timestamp > 20 * 60 * 1000) {
    return false;
  }
  const secret = process.env.SESSION_SECRET || "development-only-change-this-secret";
  const expectedHmac = crypto.createHmac("sha256", secret).update(`${ts}.${rand}`).digest("hex");
  return hmac === expectedHmac;
}

export function connectInstagram(req, res) {
  try {
    assertOAuthConfig();

    const state = generateSignedState();
    if (req.session) {
      req.session.instagramOAuthState = state;
    }

    const params = new URLSearchParams({
      client_id: process.env.IG_CLIENT_ID,
      redirect_uri: process.env.IG_REDIRECT_URI,
      response_type: "code",
      scope: "instagram_business_basic,instagram_business_manage_messages",
      state
    });

    const redirectUrl = `https://www.instagram.com/oauth/authorize?${params.toString()}`;

    if (req.session && typeof req.session.save === "function") {
      return req.session.save(() => res.redirect(redirectUrl));
    }
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("Instagram OAuth setup error:", error.message);
    return res.status(500).send("Instagram login is not configured correctly.");
  }
}

export async function instagramCallback(req, res) {
  try {
    assertOAuthConfig();

    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).send("Instagram authorization was not completed.");
    }

    const sessionState = req.session?.instagramOAuthState;
    if (!isValidOAuthState(state, sessionState)) {
      return res.status(403).send("Invalid or expired OAuth state.");
    }

    if (req.session) {
      delete req.session.instagramOAuthState;
    }

    if (typeof code !== "string" || !code) {
      return res.status(400).send("Authorization code is missing.");
    }

    const tokenForm = new URLSearchParams({
      client_id: process.env.IG_CLIENT_ID,
      client_secret: process.env.IG_CLIENT_SECRET,
      grant_type: "authorization_code",
      redirect_uri: process.env.IG_REDIRECT_URI,
      code: code.replace(/#_$/, "")
    });

    const shortTokenResponse = await axios.post(
      "https://api.instagram.com/oauth/access_token",
      tokenForm,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000
      }
    );

    const shortToken = shortTokenResponse.data?.access_token;
    if (!shortToken) throw new Error("Instagram did not return an access token.");

    const longTokenResponse = await axios.get(
      "https://graph.instagram.com/access_token",
      {
        params: {
          grant_type: "ig_exchange_token",
          client_secret: process.env.IG_CLIENT_SECRET,
          access_token: shortToken
        },
        timeout: 15000
      }
    );

    const longToken = longTokenResponse.data;
    if (!longToken?.access_token) {
      throw new Error("Could not exchange the short-lived token.");
    }

    const profileResponse = await axios.get(
      "https://graph.instagram.com/me",
      {
        params: {
          fields: "user_id,username",
          access_token: longToken.access_token
        },
        timeout: 15000
      }
    );

    const profile = profileResponse.data;
    const instagramUserId = String(profile.user_id || profile.id || "");
    const appScopedId = String(profile.id || "");

    if (!instagramUserId) {
      throw new Error("Instagram profile did not return a user ID.");
    }

    const encrypted = encryptToken(longToken.access_token);

    // Automatically subscribe the Instagram account to messaging webhooks
    try {
      await axios.post(
        `https://graph.instagram.com/${process.env.IG_API_VERSION || "v24.0"}/${instagramUserId}/subscribed_apps`,
        { subscribed_fields: "messages" },
        {
          headers: {
            Authorization: `Bearer ${longToken.access_token}`,
            "Content-Type": "application/json"
          },
          timeout: 10000
        }
      );
      console.log(`[OAuth] Successfully subscribed ${profile.username} (${instagramUserId}) to messaging webhooks.`);
    } catch (subErr) {
      console.warn("[OAuth] Could not auto-subscribe to webhooks:", subErr.response?.data || subErr.message);
    }

    const filter = (appScopedId && appScopedId !== instagramUserId)
      ? { $or: [{ instagramUserId }, { appScopedId }] }
      : { instagramUserId };

    await InstagramAccount.findOneAndUpdate(
      filter,
      {
        $set: {
          instagramUserId,
          appScopedId,
          username: profile.username || "",
          accessToken: encrypted.value,
          tokenEncrypted: encrypted.encrypted,
          tokenExpiresAt: longToken.expires_in
            ? new Date(Date.now() + Number(longToken.expires_in) * 1000)
            : null,
          isActive: true
        }
      },
      { upsert: true, new: true, runValidators: true }
    );

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(
      `${frontendUrl}/instagram/connected?username=${encodeURIComponent(profile.username || "")}`
    );
  } catch (error) {
    console.error(
      "Instagram OAuth callback failed:",
      error.response?.data || error.message
    );
    return res.status(500).send(
      "Instagram connection failed. Check backend logs and Meta configuration."
    );
  }
}
