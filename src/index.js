const express = require("express");
const cron = require("node-cron");

const { getEnv, parseTargetUrls, nowJstString } = require("./config");
const { checkAll } = require("./checker");
const { notifyConsole } = require("./notifiers/console");
const { pushLineMessage, replyLineMessage, broadcastLineMessage } = require("./notifiers/line");
const { verifyLineSignature } = require("./lineWebhook");
const { LineSessionStore } = require("./lineSessionStore");
const { authCheck, getUserPoints } = require("./toyutoyuApi");
const { generateAiReply, determineQaCategory, qaContentMap } = require("./aiResponder");

const app = express();

const PORT = Number(getEnv("PORT", { defaultValue: "8080" }));

const TARGET_URLS = parseTargetUrls(getEnv("TARGET_URLS"));
const TIMEOUT_MS = Number(getEnv("TIMEOUT_MS", { defaultValue: "10000" }));
const CRON_SCHEDULE = getEnv("CRON_SCHEDULE", { defaultValue: "*/15 * * * *" });
const CRON_TIMEZONE = getEnv("CRON_TIMEZONE", { defaultValue: "Asia/Tokyo" });

const LINE_CHANNEL_SECRET = getEnv("LINE_CHANNEL_SECRET", { defaultValue: "" });
const LINE_CHANNEL_ACCESS_TOKEN = getEnv("LINE_CHANNEL_ACCESS_TOKEN", { defaultValue: "" });
const LINE_TO = getEnv("LINE_TO", { defaultValue: "" });
const LINE_BROADCAST = getEnv("LINE_BROADCAST", { defaultValue: "0" }) === "1";

const TOYUTOYU_WP_BASE_URL = getEnv("TOYUTOYU_WP_BASE_URL", { defaultValue: "https://toyutoyu.com/app/" });
const LOGIN_FLOW_TTL_MS = Number(getEnv("LOGIN_FLOW_TTL_MS", { defaultValue: String(10 * 60 * 1000) }));
const LOGGED_IN_TTL_MS = Number(getEnv("LOGGED_IN_TTL_MS", { defaultValue: String(60 * 60 * 1000) }));

const OPENAI_API_KEY = getEnv("OPENAI_API_KEY", { defaultValue: "" });
const OPENAI_MODEL = getEnv("OPENAI_MODEL", { defaultValue: "gpt-4o" });

const sessionStore = new LineSessionStore({
  loginFlowTtlMs: LOGIN_FLOW_TTL_MS,
  loggedInTtlMs: LOGGED_IN_TTL_MS,
});

// キーワード → Q&Aカテゴリマッピング
// 複数の検索キーワードから正規の Q&A キーワードに変換
const keywordToQaCategoryMap = {
  "いくら": "ポイント単価",
  "単価": "ポイント単価",
  "1ポイント": "ポイント単価",
  "振込": "売上振込",
  "振り込み": "売上振込",
  "売上": "売上振込",
};

const qaKeywordImageMap = {
  "パスワード再設定": [
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488825_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488826_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488827_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488828_0.jpg",
  ],
  "ポイント購入": [
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488832_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488833_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488829_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488830_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488831_0.jpg",
  ],
  "ポイント単価": [],  // 画像なし（テキストのみ）
  "新規登録": [
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488834_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488836_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488837_0.jpg",
  ],
  "ポイント支払": [
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488838_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488839_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488840_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488841_0.jpg",
  ],
  "アカウント削除": [
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488842_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488843_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488844_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488845_0.jpg",
  ],
  "解約": [
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488847_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488848_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488849_0.jpg",
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/S__5488850_0.jpg",
  ],
  "支払い画面エラー": [
    "https://pub-d1e01f0fee96410f83abf27aa8f5b7c7.r2.dev/error-test.png",
  ],
};

function normalizeText(text) {
  return String(text ?? "").trim();
}

function isValidEmail(email) {
  const v = String(email ?? "").trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isAiEligibleText(text) {
  const t = normalizeText(text);
  if (!t) return false;
  // Don't send credential-related text to AI.
  if (t.includes("パスワード")) return false;
  // Commands are handled elsewhere.
  if (t === "ログイン" || t === "ポイント" || t === "キャンセル") return false;
  return true;
}

async function replyUsage({ replyToken }) {
  await replyLineMessage({
    channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
    replyToken,
    text:
      "操作:\n- ログイン:『ログイン』→メールアドレス→パスワード\n- ポイント: ログイン後に『ポイント』\n- 中断:『キャンセル』",
  });
}

async function handleLineText({ userId, replyToken, text }) {
  const t = normalizeText(text);
  if (!t) return;

  if (!userId) {
    await replyLineMessage({
      channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
      replyToken,
      text: "個別チャット（ユーザーIDが取得できる環境）でお試しください。",
    });
    return;
  }

  if (t === "キャンセル") {
    sessionStore.clear(userId);
    await replyLineMessage({
      channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
      replyToken,
      text: "キャンセルしました。",
    });
    return;
  }

  if (t === "ログイン") {
    sessionStore.startLoginFlow(userId);
    await replyLineMessage({
      channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
      replyToken,
      text: "メールアドレスを送ってください。\n途中でやめる場合は「キャンセル」と送ってください。",
    });
    return;
  }

  if (t === "ポイント") {
    const sess = sessionStore.get(userId);
    if (!sess || sess.state !== "logged_in" || !sess.email) {
      await replyLineMessage({
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
        replyToken,
        text: "ポイント確認にはログインが必要です。まず「ログイン」と送ってください。",
      });
      return;
    }

    try {
      const result = await getUserPoints({ baseUrl: TOYUTOYU_WP_BASE_URL, email: sess.email });
      const points = result && typeof result === "object" && "points" in result ? result.points : "";
      await replyLineMessage({
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
        replyToken,
        text: `現在のポイントは ${points} です。`,
      });
    } catch (_err) {
      await replyLineMessage({
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
        replyToken,
        text: "ポイント取得に失敗しました。しばらくしてからもう一度お試しください。",
      });
    }

    return;
  }

  // If user is NOT in login flow, route other messages to AI (support/inquiry).
  const current = sessionStore.get(userId);
  if (!current || current.state !== "login") {
    if (!OPENAI_API_KEY) {
      await replyUsage({ replyToken });
      return;
    }

    if (!isAiEligibleText(t)) {
      await replyUsage({ replyToken });
      return;
    }

    // AIで質問内容からQ&Aカテゴリを判定
    try {
      const category = await determineQaCategory({ apiKey: OPENAI_API_KEY, model: OPENAI_MODEL, userText: t });
      
      // Q1～Q12に該当する場合
      if (category && category.match(/^Q\d{1,2}$/)) {
        const categoryToKeywordMap = {
          "Q1": "ポイント設定",
          "Q2": "施設情報",
          "Q3": "売上振込",
          "Q4": "ポイント単価",
          "Q5": "パスワード再設定",
          "Q6": "ポイント購入",
          "Q7": "新規登録",
          "Q8": "ポイント支払",
          "Q9": "問い合わせ",
          "Q10": "アカウント削除",
          "Q11": "解約",
          "Q12": "支払い画面エラー",
        };
        const keyword = categoryToKeywordMap[category];
        const qaContent = keyword ? qaContentMap[keyword] : null;
        const images = keyword ? qaKeywordImageMap[keyword] : [];

        if (qaContent) {
          await replyLineMessage({
            channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
            replyToken,
            text: qaContent,
            imageUrls: images || [],
          });
          return;
        }
      }
    } catch (_err) {
      // AI判定失敗時は通常のAI回答処理へ
    }

    // Q&Aに該当しない場合は通常のAI回答
    try {
      const aiText = await generateAiReply({ apiKey: OPENAI_API_KEY, model: OPENAI_MODEL, userText: t });

      await replyLineMessage({
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
        replyToken,
        text: aiText,
      });
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err ? err.message : String(err);
      await notifyConsole(`AI reply error: ${msg}`);
      await replyLineMessage({
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
        replyToken,
        text: "恐れ入ります、ただいま自動応答が混み合っています。少し時間をおいてからもう一度お試しください。",
      });
    }

    return;
  }

  const sess = current;
  if (!sess || sess.state !== "login") {
    await replyUsage({ replyToken });
    return;
  }

  if (sess.step === "await_email") {
    if (!isValidEmail(t)) {
      await replyLineMessage({
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
        replyToken,
        text: "メールアドレスの形式が正しくないようです。もう一度送ってください。",
      });
      return;
    }

    sessionStore.setAwaitPassword(userId, t);
    await replyLineMessage({
      channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
      replyToken,
      text: "パスワードを送ってください。\n途中でやめる場合は「キャンセル」と送ってください。",
    });
    return;
  }

  if (sess.step === "await_password") {
    try {
      const result = await authCheck({
        baseUrl: TOYUTOYU_WP_BASE_URL,
        email: sess.email,
        password: t,
      });

      if (result && typeof result === "object" && result.success === true) {
        const wpUserId = "user_id" in result ? result.user_id : null;
        sessionStore.setLoggedIn(userId, { email: sess.email, wpUserId });
        await replyLineMessage({
          channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
          replyToken,
          text: "ログインOKです。\nポイントを確認する場合は「ポイント」と送ってください。",
        });
        return;
      }

      await replyLineMessage({
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
        replyToken,
        text: "メールアドレスまたはパスワードが正しくありません。\nやり直す場合は「ログイン」と送ってください。",
      });
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number(err.status) : 0;
      if (status === 401) {
        await replyLineMessage({
          channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
          replyToken,
          text: "メールアドレスまたはパスワードが正しくありません。\nやり直す場合は「ログイン」と送ってください。",
        });
        return;
      }

      await replyLineMessage({
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
        replyToken,
        text: "認証処理でエラーが発生しました。しばらくしてからもう一度お試しください。",
      });
    }

    return;
  }

  await replyLineMessage({
    channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
    replyToken,
    text: "操作: 「ログイン」→ メールアドレス → パスワード の順に送ってください。",
  });
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (_req, res) => {
  res.type("text/plain").send("toyutoyu-suporter is running\n");
});

// Optional LINE webhook endpoint (URL is optional per your request)
app.post(
  "/callback",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      await notifyConsole(
        `LINE webhook received: content-length=${req.get("content-length") || ""} has-signature=${Boolean(
          req.get("x-line-signature")
        )}`
      );
    } catch (_err) {
      // ignore logging errors
    }

    const signature = req.get("x-line-signature") || "";
    const valid = verifyLineSignature({
      channelSecret: LINE_CHANNEL_SECRET,
      rawBodyBuffer: req.body,
      signature,
    });

    if (!valid) {
      await notifyConsole("LINE webhook: invalid signature (check LINE_CHANNEL_SECRET)");
      return res.status(401).send("invalid signature");
    }

    // Ack ASAP. We'll process events after sending the response.
    res.status(200).send("ok");

    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      await notifyConsole("LINE webhook: missing LINE_CHANNEL_ACCESS_TOKEN (cannot reply)");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(req.body).toString("utf8"));
    } catch (_err) {
      await notifyConsole("LINE webhook: invalid JSON body");
      return;
    }

    const events = payload && typeof payload === "object" && Array.isArray(payload.events) ? payload.events : [];
    await notifyConsole(`LINE webhook: events=${events.length}`);

    for (const ev of events) {
      try {
        if (!ev || typeof ev !== "object") continue;
        if (ev.type !== "message") continue;
        if (!ev.message || typeof ev.message !== "object") continue;
        if (ev.message.type !== "text") continue;
        if (!ev.replyToken) continue;

        const userId = ev.source && typeof ev.source === "object" ? ev.source.userId : "";
        await handleLineText({ userId, replyToken: ev.replyToken, text: ev.message.text });
      } catch (err) {
        const msg = err && typeof err === "object" && "message" in err ? err.message : String(err);
        await notifyConsole(`LINE webhook handler error: ${msg}`);
      }
    }
  }
);

async function notify(text) {
  // Always log
  await notifyConsole(text);

  // Optional LINE notification
  if (!LINE_CHANNEL_ACCESS_TOKEN) return;

  if (LINE_BROADCAST) {
    await broadcastLineMessage({
      channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
      text,
    });
    return;
  }

  if (LINE_TO) {
    await pushLineMessage({
      channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
      to: LINE_TO,
      text,
    });
  }
}

function formatFailures({ failures }) {
  const lines = failures.map((f) => {
    if (f.error) {
      return `- ${f.url} ERROR: ${f.error}`;
    }
    return `- ${f.url} HTTP ${f.status} ${f.statusText || ""}`.trim();
  });

  return lines.join("\n");
}

async function runCheckOnce() {
  const { failures } = await checkAll(TARGET_URLS, { timeoutMs: TIMEOUT_MS });

  if (failures.length === 0) {
    return;
  }

  const message = [
    "【と湯と湯 みまもり】あれれ？サイトが開けないみたいです…（しょんぼり）",
    `時刻(JST): ${nowJstString()}`,
    "うまく確認できなかったURLはこちらです（404はOK扱いです）:",
    formatFailures({ failures }),
  ].join("\n");

  await notify(message);
}

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on :${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`Cron schedule: ${CRON_SCHEDULE}`);
  // eslint-disable-next-line no-console
  console.log(`Targets: ${TARGET_URLS.join(", ")}`);
});

cron.schedule(CRON_SCHEDULE, async () => {
  try {
    await runCheckOnce();
  } catch (err) {
    const msg = err && typeof err === "object" && "message" in err ? err.message : String(err);
    await notify(
      [
        "【と湯と湯 みまもり】ごめんなさい…監視処理でエラーが出ちゃいました",
        `時刻(JST): ${nowJstString()}`,
        `内容: ${msg}`,
      ].join("\n")
    );
  }
}, { timezone: CRON_TIMEZONE });
