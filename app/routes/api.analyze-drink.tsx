import { json, type ActionFunctionArgs } from "@remix-run/node";
import { Buffer } from "node:buffer";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const file = formData.get("image");

  if (!file || !(file instanceof File)) {
    return json({ error: "No valid image provided" }, { status: 400 });
  }

  // Convert image to base64
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Image = buffer.toString("base64");
  const mimeType = file.type;

  const apiKey = process.env.BIGMODEL_API_KEY;
  if (!apiKey) {
    console.error("BIGMODEL_API_KEY is missing");
    return json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    // Stage 1: Analyze Image with GLM-4.6V + Web Search
    const analyzeResponse = await fetch(
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "glm-4.6v",
          max_tokens: 8192,
          temperature: 0.5, // Lower temperature for more stable JSON
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
                    url: `data:${mimeType};base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!analyzeResponse.ok) {
      const errText = await analyzeResponse.text();
      console.error("GLM Vision API Error:", errText);
      return json({ error: "Failed to analyze image" }, { status: 500 });
    }

    const resultJson = await analyzeResponse.json();
    console.log("GLM FULL RESPONSE:", JSON.stringify(resultJson, null, 2));

    const finishReason = resultJson.choices?.[0]?.finish_reason;
    const content = resultJson.choices?.[0]?.message?.content;

    // Check if response was truncated
    if (finishReason === "length") {
      console.error("Response was truncated due to token limit");
      return json(
        { error: "AI response was truncated, please try again" },
        { status: 500 }
      );
    }

    // Check if content is empty
    if (!content) {
      const reasoningContent =
        resultJson.choices?.[0]?.message?.reasoning_content;
      console.error(
        "Content was empty!",
        reasoningContent ? "Reasoning content exists but no final answer" : ""
      );
      return json(
        { error: "AI failed to generate a valid response" },
        { status: 500 }
      );
    }

    let parsedData: any = {};
    try {
      parsedData = parseContent(content);
    } catch (e) {
      console.warn("Failed to parse JSON content", content);
      return json(
        { error: "Failed to parse AI response as JSON" },
        { status: 500 }
      );
    }

    return json({
      brand: parsedData.brand || "Unknown",
      productName: parsedData.product_name || "Unknown Drink",
      caffeine: parsedData.caffeine_mg || 0,
      sugar: parsedData.sugar_g || 0,
      note: parsedData.note || "Analysis completed",
      raw: parsedData,
      debug: resultJson,
    });
  } catch (error) {
    console.error("Analysis failed", error);
    return json({ error: "Analysis process failed" }, { status: 500 });
  }
};

/**
 * Robust cleaning of the content
 * 1. Unwrap content from Zhipu's special `<|begin_of_box|>` `<|end_of_box|>` tags
 */
function parseContent(content: string) {
  let cleanContent = content
    .replace(/<\|begin_of_box\|>/g, "")
    .replace(/<\|end_of_box\|>/g, "");
  cleanContent = cleanContent.trim();
  return JSON.parse(cleanContent);
}
