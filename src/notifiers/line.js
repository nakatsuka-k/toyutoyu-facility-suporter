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

async function replyLineMessage({ channelAccessToken, replyToken, userId, text, imageUrls = [] }) {
  // LINE APIは1回のリクエストで最大5メッセージまで
  // テキスト(1) + 画像(最大4) = 5メッセージまで
  const maxImagesPerRequest = 4;
  const firstBatchImages = imageUrls.slice(0, maxImagesPerRequest);
  const remainingImages = imageUrls.slice(maxImagesPerRequest);

  // 最初のバッチ: テキスト + 最初の4枚の画像（合計最大5メッセージ）
  const messages = [{ type: "text", text }];
  for (const imageUrl of firstBatchImages) {
    messages.push({
      type: "image",
      originalContentUrl: imageUrl,
      previewImageUrl: imageUrl,
    });
  }

  console.log(`Sending ${messages.length} messages (${firstBatchImages.length} images)`);

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
    const errMsg = `LINE reply failed: ${res.status} ${res.statusText} ${body}`.trim();
    console.error(errMsg);
    throw new Error(errMsg);
  }

  console.log("LINE reply sent successfully");

  // 残りの画像がある場合は別途pushで送信
  if (remainingImages.length > 0) {
    console.log(`Sending remaining ${remainingImages.length} images via push`);
    const remainingMessages = [];
    for (const imageUrl of remainingImages) {
      remainingMessages.push({
        type: "image",
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl,
      });
    }

    const pushRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: remainingMessages,
      }),
    });

    if (!pushRes.ok) {
      const body = await pushRes.text().catch(() => "");
      console.error(`Warning: Failed to push remaining images: ${pushRes.status} ${body}`);
    }
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
