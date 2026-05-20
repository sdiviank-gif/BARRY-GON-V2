const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = "1170844492772192";
const VERIFY_TOKEN = "barrygon2024";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

async function sendWA(to, msg) {
  await axios.post(
    "https://graph.facebook.com/v18.0/" + PHONE_NUMBER_ID + "/messages",
    { messaging_product: "whatsapp", to: to, type: "text", text: { body: msg } },
    { headers: { Authorization: "Bearer " + WHATSAPP_TOKEN, "Content-Type": "application/json" } }
  );
}

async function gemini(text) {
  const prompt = "You are BARRY-GON, a friendly WhatsApp personal assistant. Help with spending tracking, grocery lists, investments, and scheduling. Reply ONLY in valid JSON with no markdown formatting like this: {\"action\":\"log_spending or view_spending or add_grocery or view_groceries or log_investment or view_investments or add_schedule or view_schedule or general_reply\",\"data\":{\"amount\":null,\"category\":null,\"description\":null,\"currency\":null,\"item\":null,\"quantity\":null,\"date\":null,\"time\":null,\"event\":null,\"asset\":null,\"investment_action\":null,\"notes\":null},\"reply\":\"your reply here\"}. User message: " + text;
  const r = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY,
    { contents: [{ parts: [{ text: prompt }] }] }
  );
  const raw = r.data.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

async function appendRow(tab, values) {
  await axios.post(
    "https://sheets.googleapis.com/v4/spreadsheets/" + SPREADSHEET_ID + "/values/" + tab + "!A1:append?valueInputOption=RAW&key=" + GOOGLE_API_KEY,
    { values: [values] }
  );
}

async function getRows(tab) {
  const r = await axios.get(
    "https://sheets.googleapis.com/v4/spreadsheets/" + SPREADSHEET_ID + "/values/" + tab + "!A2:F100?key=" + GOOGLE_API_KEY
  );
  return r.data.values || [];
}

async function handle(from, text) {
  try {
    const result = await gemini(text);
    let reply = result.reply;
    const d = result.data;
    const date = new Date().toLocaleDateString("en-CA");

    if (result.action === "log_spending") {
      await appendRow("Spending", [date, d.category||"General", d.description||"", d.amount||0, d.currency||"CAD"]);
      reply = "Got it. Logged your spending.";
    } else if (result.action === "view_spending") {
      const rows = await getRows("Spending");
      reply = rows.length ? "Recent Spending:\n" + rows.slice(-5).reverse().map(function(r){ return "- " + r[0] + " | " + r[1] + ": $" + r[3]; }).join("\n") : "No spending logged yet.";
    } else if (result.action === "add_grocery") {
      await appendRow("Groceries", [d.item||"", d.quantity||"1", "Pending", date]);
      reply = "Added to your grocery list.";
    } else if (result.action === "view_groceries") {
      const rows = await getRows("Groceries");
      const pending = rows.filter(function(r){ return r[2] === "Pending"; });
      reply = pending.length ? "Grocery List:\n" + pending.map(function(r,i){ return (i+1) + ". " + r[0] + " (" + r[1] + ")"; }).join("\n") : "Your grocery list is empty.";
    } else if (result.action === "log_investment") {
      await appendRow("Investments", [date, d.asset||"", d.investment_action||"", d.amount||0, d.notes||""]);
      reply = "Investment logged.";
    } else if (result.action === "view_investments") {
      const rows = await getRows("Investments");
      reply = rows.length ? "Investments:\n" + rows.slice(-5).reverse().map(function(r){ return "- " + r[0] + " | " + r[2] + " " + r[1] + ": $" + r[3]; }).join("\n") : "No investments logged yet.";
    } else if (result.action === "add_schedule") {
      await appendRow("Schedule", [d.date||"", d.time||"", d.event||"", "No"]);
      reply = "Added to your schedule.";
    } else if (result.action === "view_schedule") {
      const rows = await getRows("Schedule");
      reply = rows.length ? "Schedule:\n" + rows.slice(-5).map(function(r){ return "- " + r[0] + " at " + r[1] + ": " + r[2]; }).join("\n") : "Nothing scheduled yet.";
    }

    await sendWA(from, reply);
  } catch (err) {
    console.error("BARRY-GON Error:", err.message);
    await sendWA(from, "BARRY-GON here. Something went wrong — please try again.");
  }
}

app.get("/webhook", function(req, res) {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async function(req, res) {
  res.sendStatus(200);
  try {
    var val = req.body.entry[0].changes[0].value;
    if (val.messages && val.messages[0] && val.messages[0].type === "text") {
      await handle(val.messages[0].from, val.messages[0].text.body);
    }
  } catch (err) {
    console.error("Webhook error:", err.message);
  }
});

app.get("/", function(req, res) { res.send("BARRY-GON V2 is online."); });
app.get("/ping", function(req, res) { res.status(200).send("pong"); });
app.listen(3000, function() { console.log("BARRY-GON server running on port 3000"); });
