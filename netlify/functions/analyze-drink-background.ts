import { type Handler, type HandlerEvent, type HandlerContext } from "@netlify/functions";
import { getStore, connectLambda } from "@netlify/blobs";

const MAX_ERROR_TEXT_LEN = 500;

const trimErrorText = (text: string, maxLen: number = MAX_ERROR_TEXT_LEN) =>
  text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;

const jsonResponse = (statusCode: number, payload: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

/**
 * Netlify Function: analyze-drink-background
 * 功能: 接收图片(base64)并调用 GLM 分析饮料信息，写入 Supabase 任务结果。
 * 参数: 
 *   方式1 (Legacy): jobId(string), imageBase64(string), mimeType(string, 可选)
 *   方式2 (Blob): blobKey(string), jobId(string, 可选 - 优先读 blob 内的 parameters)
 * 返回: 202 表示任务已启动；失败时返回 4xx/5xx 且包含错误原因。
 */
const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Initialize Blobs for Lambda Compatibility Mode
  connectLambda(event as any);

  console.log("Function handler started.");

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  // Dynamic import to prevent cold-start crashes if dependencies fail
  let createClient;
  try {
    const supabaseModule = await import("@supabase/supabase-js");
    createClient = supabaseModule.createClient;
  } catch (err: any) {
    console.error("Dependency Load Error:", err);
    return jsonResponse(500, {
      error: `Dependency Error: Failed to load supabase-js. ${err.message}`,
    });
  }

  // Env Check
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bigModelApiKey = process.env.BIGMODEL_API_KEY;

  if (!supabaseUrl || !supabaseServiceKey || !bigModelApiKey) {
    return jsonResponse(500, { error: "Config Error: Missing env vars" });
  }

  // Init Supabase
  let supabaseAdmin;
  try {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  } catch (err: any) {
    return jsonResponse(500, { error: `Supabase Init Error: ${err.message}` });
  }

  // Parse Body
  let initialPayload;
  try {
    initialPayload = JSON.parse(event.body || "{}");
  } catch (e) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  let finalPayload = { ...initialPayload };
  let blobStore = null;
  let currentBlobKey = null;

  // Handle Blob Storage Input
  if (initialPayload.blobKey) {
    console.log(`[Blob] Fetching data for key: ${initialPayload.blobKey}`);
    try {
      currentBlobKey = initialPayload.blobKey;
      blobStore = getStore("temp-images");
      const blobData = await blobStore.get(currentBlobKey, { type: "text" });

      if (!blobData) {
        throw new Error("Blob not found or expired");
      }

      // Merge blob data into payload (blob data is expected to be the full original JSON)
      const blobJson = JSON.parse(blobData);
      finalPayload = { ...finalPayload, ...blobJson };

    } catch (err: any) {
      console.error(`[Blob] Error reading blob: ${err.message}`);
      // Fallback or error? If we depend on blob for image, we must error.
      // We will continue to validation checks to handle it gracefully.
    }
  }

  const { jobId, imageBase64, mimeType } = finalPayload;
  if (!jobId || !imageBase64) {
    return jsonResponse(400, { error: "Missing jobId or imageBase64 (or failed to retrieve from blob)" });
  }

  console.log(`[Job: ${jobId}] Starting logic...`);

  const safeUpdateJob = async (data: Record<string, unknown>) => {
    try {
      await supabaseAdmin.from("analysis_jobs").update(data).eq("id", jobId);
    } catch (err) {
      console.error("DB Update Error:", err);
    }
  };

  try {
    // 1. Update status
    await safeUpdateJob({ status: "processing", updated_at: new Date().toISOString() });

    // 2. Call GLM API
    const analyzeResponse = await fetch(
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bigModelApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "glm-4.6v",
          max_tokens: 8192,
          temperature: 0.5,
          tools: [
            {
              type: "web_search",
              web_search: {
                enable: true,
                search_result: true,
              },
            },
          ],
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `
你是一名饮料营养分析助手。
任务：
1. 分析图片，识别饮料的品牌、产品名称、规格（容量/糖度/温度）。
2. 如果图片中可以直接看到明确的营养成分表，提取数据。
3. 如果没有，请利用 web_search 搜索该产品的官方营养成分数据，特别是咖啡因（mg）和含糖量（g）。

请综合图片识别和搜索结果，最终以 JSON 格式返回：
{
  "brand": "品牌名",
  "product_name": "完整商品名",
  "specs_text": "规格描述",
  "caffeine_mg": number | null,
  "sugar_g": number | null,
  "volume_ml": number | null,
  "data_source": "image" | "search" | "estimation",
  "note": "简要说明数据来源或搜索到了什么信息"
}

注意：
- 严格输出 JSON 格式。
- 不要包含 markdown 代码块标记 (如 \`\`\`json)。
- 对于现制饮品（如瑞幸、星巴克），务必搜索官方数据。
`,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    let resultJson;

    if (!analyzeResponse.ok) {
      const errText = await analyzeResponse.text();
      console.error(`[Job: ${jobId}] GLM API Error:`, errText);
      throw new Error(`GLM API Error: ${errText}`);
    } else {
      resultJson = await analyzeResponse.json();
    }

    const content = resultJson.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`[Job: ${jobId}] Empty content from AI`);
      throw new Error("AI response was empty");
    }

    // Parse logic (borrowed from original code)
    let parsedData;
    try {
      const cleanContent = content
        .replace(/<\|begin_of_box\|>/g, "")
        .replace(/<\|end_of_box\|>/g, "")
        .replace(/^```json\s*/, "")
        .replace(/\s*```$/, "")
        .trim();
      parsedData = JSON.parse(cleanContent);
    } catch (e) {
      // Fallback regex
      const match = content.match(/```json([\s\S]*?)```/);
      if (match && match[1]) {
        parsedData = JSON.parse(match[1]);
      } else {
        throw new Error("Failed to parse JSON from AI response");
      }
    }

    // 3. Update status to 'completed' with result
    await safeUpdateJob({
      status: "completed",
      result: parsedData,
      updated_at: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error("Logic Error:", error);
    const msg = error.message || String(error);

    // Update DB if possible
    await safeUpdateJob({
      status: "failed",
      error_message: trimErrorText(msg),
      updated_at: new Date().toISOString(),
    });

    return jsonResponse(500, {
      error: msg,
      jobId,
      meta: {
        mimeType,
        imageBase64Len: imageBase64 ? imageBase64.length : 0,
      },
    });
  } finally {
    // Clean up Blob
    if (blobStore && currentBlobKey) {
      try {
        await blobStore.delete(currentBlobKey);
        console.log(`[Blob] Deleted key: ${currentBlobKey}`);
      } catch (cleanupErr) {
        console.warn(`[Blob] Failed to cleanup key: ${currentBlobKey}`, cleanupErr);
      }
    }
  }

  return jsonResponse(202, { message: "Started" });
};

export { handler };
