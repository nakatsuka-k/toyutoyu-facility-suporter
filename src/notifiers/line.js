async function pushLineMessage({ channelAccessToken, to, text }) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LINE push failed: ${res.status} ${res.statusText} ${body}`.trim());
  }
}

async function replyLineMessage({ channelAccessToken, replyToken, text, imageUrls = [] }) {
  const messages = [{ type: "text", text }];

  // テキストメッセージ後に画像を追加
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    for (const imageUrl of imageUrls) {
      messages.push({
        type: "image",
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl,
      });
    }
  }

  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LINE reply failed: ${res.status} ${res.statusText} ${body}`.trim());
  }
}

async function broadcastLineMessage({ channelAccessToken, text }) {
  const res = await fetch("https://api.line.me/v2/bot/message/broadcast", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LINE broadcast failed: ${res.status} ${res.statusText} ${body}`.trim());
  }
}

module.exports = {
  pushLineMessage,
  replyLineMessage,
  broadcastLineMessage,
};
