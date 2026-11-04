import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    instagramAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InstagramAccount",
      required: true,
      index: true
    },
    messageId: {
      type: String,
      required: true
    },
    senderId: {
      type: String,
      required: true
    },
    recipientId: {
      type: String,
      default: ""
    },
    messageType: {
      type: String,
      enum: ["text", "image", "audio", "video", "sticker", "other"],
      default: "text"
    },
    text: {
      type: String,
      default: ""
    },
    aiReply: {
      type: String,
      default: ""
    },
    direction: {
      type: String,
      enum: ["incoming", "outgoing"],
      default: "incoming"
    },
    status: {
      type: String,
      enum: ["received", "processing", "sent", "failed"],
      default: "received"
    },
    errorMessage: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

messageSchema.index(
  { instagramAccount: 1, messageId: 1 },
  { unique: true }
);

export default mongoose.model("Message", messageSchema);
