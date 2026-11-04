import { Router } from "express";
import {
  connectInstagram,
  instagramCallback
} from "../controllers/instagram.controller.js";
import {
  verifyInstagramWebhook,
  handleInstagramWebhook,
  verifyMetaSignature
} from "../controllers/webhook.controller.js";

const router = Router();

router.get("/connect", connectInstagram);
router.get("/callback", instagramCallback);

router.get("/webhook", verifyInstagramWebhook);
router.post("/webhook", verifyMetaSignature, handleInstagramWebhook);

export default router;
