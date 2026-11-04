import crypto from "crypto";
import Message from "../models/Message.js";
import InstagramAccount from "../models/InstagramAccount.js";
import { generateAIReply } from "../services/aiReply.service.js";
import { sendInstagramTextMessage } from "../services/instagramMessage.service.js";

export function verifyInstagramWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("[Webhook Verification] Received:", { mode, token, challenge });

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.IG_WEBHOOK_VERIFY_TOKEN
  ) {
    console.log("[Webhook Verification] Token matched successfully!");
    return res.status(200).send(challenge);
  }

  console.warn(
    "[Webhook Verification] Failed. Expected:",
    process.env.IG_WEBHOOK_VERIFY_TOKEN,
    "Got:",
    token
  );
  return res.sendStatus(403);
}

// Verify webhook authenticity using the raw request body and Meta app secret.
export function verifyMetaSignature(req, res, next) {
  const appSecret = process.env.IG_CLIENT_SECRET;
  const signature = req.get("x-hub-signature-256");

  // In development, automatically allow testing if signature is not provided (e.g. from Postman)
  if (!signature) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Webhook Signature] No signature provided; automatically bypassed in development mode for easy testing.");
      return next();
    }
    console.warn("[Webhook Signature] Missing x-hub-signature-256 header.");
    return res.status(401).json({ error: "Missing x-hub-signature-256 header" });
  }

  if (!appSecret || !req.rawBody) {
    console.warn("[Webhook Signature] Missing app secret or rawBody.");
    return res.status(401).json({ error: "Missing app secret or rawBody" });
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(req.rawBody)
    .digest("hex")}`;

  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    console.warn("[Webhook Signature] Signature mismatch! Please check IG_CLIENT_SECRET in .env.");
    return res.status(401).json({ error: "Webhook signature mismatch. Check IG_CLIENT_SECRET in .env." });
  }

  return next();
}

async function processIncomingMessage(instagramUserId, event) {
  const message = event.message;
  const senderId = event.sender?.id;
  const recipientId = event.recipient?.id;
  const messageId = message?.mid;
  const text = message?.text?.trim();

  // Ignore non-text, delivery receipts, read receipts, reactions, or bot echo events safely
  if (!message || !messageId || !senderId || !text || message.is_echo) {
    console.log("[Webhook] Message ignored (non-text, echo, or receipt event):", {
      messageId,
      is_echo: message?.is_echo
    });
    return;
  }

  console.log(`[Webhook] Processing message ${messageId} from ${senderId}: "${text}"`);

  const candidateIds = [
    String(instagramUserId),
    String(recipientId || "")
  ].filter(Boolean);

  let account = await InstagramAccount.findOne({
    $or: [
      { instagramUserId: { $in: candidateIds } },
      { appScopedId: { $in: candidateIds } }
    ],
    isActive: true
  });

  if (!account) {
    const activeCount = await InstagramAccount.countDocuments({ isActive: true });
    if (activeCount === 1) {
      account = await InstagramAccount.findOne({ isActive: true });
    }
  }

  if (!account) {
    console.error("No active account matches webhook entry ID:", instagramUserId, "candidate IDs:", candidateIds);
    return;
  }

  // Prevent bot from replying to its own messages
  if (
    senderId === account.instagramUserId ||
    (account.appScopedId && senderId === account.appScopedId)
  ) {
    console.log("[Webhook] Ignoring outgoing message sent by the bot account itself.");
    return;
  }

  let incoming;
  try {
    incoming = await Message.create({
      instagramAccount: account._id,
      messageId,
      senderId: String(senderId),
      recipientId: String(instagramUserId || account.instagramUserId),
      text,
      direction: "incoming",
      status: "received"
    });
  } catch (error) {
    if (error.code === 11000) {
      console.log("Duplicate webhook message ignored:", messageId);
      return;
    }
    throw error;
  }

  try {
    incoming.status = "processing";
    await incoming.save();

    console.log(`[AI] Generating reply for customer message: "${text}"...`);
    const aiReply = await generateAIReply(text);
    console.log(`[AI] Generated reply: "${aiReply}"`);

    console.log(`[Instagram] Sending reply to ${senderId}...`);
    const result = await sendInstagramTextMessage({
      instagramUserId: String(account.instagramUserId),
      recipientId: String(senderId),
      text: aiReply
    });

    incoming.aiReply = aiReply;
    incoming.status = "sent";
    await incoming.save();

    if (result?.message_id) {
      await Message.create({
        instagramAccount: account._id,
        messageId: result.message_id,
        senderId: String(account.instagramUserId),
        recipientId: String(senderId),
        text: aiReply,
        direction: "outgoing",
        status: "sent"
      });
    }

    console.log("Instagram AI reply successfully sent for:", messageId);
  } catch (error) {
    incoming.status = "failed";
    incoming.errorMessage = error.response?.data
      ? JSON.stringify(error.response.data).slice(0, 1000)
      : error.message;
    await incoming.save();

    console.error("Failed to process Instagram message:", error.response?.data || error.message);
  }
}

export async function handleInstagramWebhook(req, res) {
  // Acknowledge quickly; processing is performed asynchronously below.
  res.sendStatus(200);

  try {
    const body = req.body;
    console.log("[Webhook] Received event payload:", JSON.stringify(body, null, 2));

    if (body.object !== "instagram") {
      console.log("[Webhook] Non-instagram event object:", body.object);
      return;
    }

    for (const entry of body.entry || []) {
      const instagramUserId = entry.id;

      for (const event of entry.messaging || []) {
        processIncomingMessage(instagramUserId, event).catch((error) => {
          console.error("Webhook event processing error:", error.message);
        });
      }
    }
  } catch (error) {
    console.error("Instagram webhook handler error:", error.message);
  }
}
