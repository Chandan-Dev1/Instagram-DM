import axios from "axios";
import InstagramAccount from "../models/InstagramAccount.js";
import { decryptToken } from "../utils/tokenCrypto.js";

function getApiVersion() {
  return process.env.IG_API_VERSION || "v24.0";
}

export async function sendInstagramTextMessage({
  instagramUserId,
  recipientId,
  text
}) {
  let account = await InstagramAccount.findOne({
    $or: [
      { instagramUserId: String(instagramUserId) },
      { appScopedId: String(instagramUserId) }
    ],
    isActive: true
  }).select("+accessToken");

  if (!account) {
    const activeAccounts = await InstagramAccount.find({ isActive: true }).select("+accessToken");
    if (activeAccounts.length === 1) {
      account = activeAccounts[0];
    }
  }

  if (!account) {
    throw new Error(`No active Instagram account found for ${instagramUserId}`);
  }

  const accessToken = decryptToken(
    account.accessToken,
    account.tokenEncrypted
  );

  // Use /me/messages which maps to the authenticated Instagram professional account
  const url = `https://graph.instagram.com/${getApiVersion()}/me/messages`;

  const response = await axios.post(
    url,
    {
      recipient: { id: recipientId },
      message: { text }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    }
  );

  return response.data;
}
