import "dotenv/config";
import { generateAIReply } from "./src/services/aiReply.service.js";

const message = process.argv.slice(2).join(" ") ||
  "Bhai, aap kya services provide karte ho?";

try {
  console.time("Gemini response time");
  const reply = await generateAIReply(message);
  console.timeEnd("Gemini response time");
  console.log("\nCustomer:", message);
  console.log("AI reply:", reply);
} catch (error) {
  console.error("AI test failed:", error.message);
  process.exitCode = 1;
}
