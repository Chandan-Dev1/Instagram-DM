import mongoose from "mongoose";

const instagramAccountSchema = new mongoose.Schema(
  {
    instagramUserId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    appScopedId: {
      type: String,
      default: "",
      index: true
    },
    username: {
      type: String,
      default: ""
    },
    accessToken: {
      type: String,
      required: true,
      select: false
    },
    tokenEncrypted: {
      type: Boolean,
      default: false
    },
    tokenExpiresAt: {
      type: Date,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("InstagramAccount", instagramAccountSchema);
