import { type Handler, type HandlerEvent, type HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Admin Client (Service Role) outside handler for reuse
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bigModelApiKey = process.env.BIGMODEL_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase Service Key or URL");
}

const supabaseAdmin = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!supabaseAdmin) {
    console.error("Supabase Admin client not initialized");
    return { statusCode: 500, body: "Server Configuration Error" };
  }

  if (!bigModelApiKey) {
    console.error("BIGMODEL_API_KEY is missing");
    return { statusCode: 500, body: "Server Configuration Error" };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const { jobId, imageBase64, mimeType } = payload;

    if (!jobId || !imageBase64) {
      console.error("Missing jobId or image data");
      return { statusCode: 400, body: "Missing required fields" };
    }

    console.log(`[Job: ${jobId}] Starting background analysis...`);

    // 1. Update status to 'processing'
    await supabaseAdmin
      .from("analysis_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", jobId);

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
    const { error: updateError } = await supabaseAdmin
      .from("analysis_jobs")
      .update({
        status: "completed",
        result: parsedData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (updateError) {
      console.error(`[Job: ${jobId}] Failed to update Supabase:`, updateError);
    } else {
      console.log(`[Job: ${jobId}] Successfully completed.`);
    }

  } catch (error: unknown) {
    console.error(`[Job: ${context?.clientContext?.jobId || "unknown"}] Fatal error:`, error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Attempt to report failure
    try {
        if(supabaseAdmin) {
            const payload = JSON.parse(event.body || "{}");
            if(payload.jobId) {
                await supabaseAdmin
                .from("analysis_jobs")
                .update({
                    status: "failed", 
                    error_message: errorMessage,
                    updated_at: new Date().toISOString()
                })
                .eq("id", payload.jobId);
            }
        }
    } catch(e) {
        console.error("Failed to report error status", e);
    }
  }

  // Background functions return 202 immediately to the client
  // The logic above runs asynchronously
  return {
    statusCode: 202,
    body: JSON.stringify({ message: "Analysis started in background" }),
  };
};

export { handler };
