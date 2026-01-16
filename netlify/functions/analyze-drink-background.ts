import { type Handler, type HandlerEvent, type HandlerContext } from "@netlify/functions";

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
 * 参数: jobId(string), imageBase64(string), mimeType(string, 可选)
 * 返回: 202 表示任务已启动；失败时返回 4xx/5xx 且包含错误原因。
 * 边缘场景: 缺少参数、JSON 解析失败、上游 API 失败会优先返回错误并写入任务 error_message。
 */
const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
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
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const { jobId, imageBase64, mimeType } = payload;
  if (!jobId || !imageBase64) {
    return jsonResponse(400, { error: "Missing jobId or imageBase64" });
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

     // 2. Call GLM
     const analyzeResponse = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bigModelApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "glm-4v",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "请分析图片中的饮料营养成分（品牌、品名、咖啡因mg、糖g）。JSON格式返回。" },
                { type: "image_url", image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}` } }
              ]
            }
          ]
        })
     });

     if (!analyzeResponse.ok) {
        const txt = await analyzeResponse.text();
        throw new Error(`GLM API Failed: ${analyzeResponse.status} ${trimErrorText(txt)}`);
     }

     const resJson = await analyzeResponse.json();
     const content = resJson.choices?.[0]?.message?.content;
     if (!content) throw new Error("Empty AI response");

     // Parse AI content (simplified for stability)
     let parsedData = {};
     try {
         const jsonStr = content.match(/\{[\s\S]*\}/)?.[0] || content;
         parsedData = JSON.parse(jsonStr);
     } catch (e) {
         console.warn("AI JSON parse failed, saving raw text");
         parsedData = { note: content };
     }

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
        imageBase64Len: imageBase64.length,
      },
    });
  }

  return jsonResponse(202, { message: "Started" });
};

export { handler };
