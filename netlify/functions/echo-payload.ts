import { type Handler, type HandlerEvent } from "@netlify/functions";

/**
 * Netlify Function: echo-payload
 * 功能: 用于验证携带大 JSON payload 的 POST 是否正常到达函数。
 * 参数: 任意 JSON body
 * 返回: 200，包含 body 长度与 imageBase64 长度（若存在）。
 * 边缘场景: JSON 解析失败或非 POST 会优先返回错误。
 */
export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  let payload: any = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error: any) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const imageBase64 = typeof payload.imageBase64 === "string" ? payload.imageBase64 : "";

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      ok: true,
      bodyLength: (event.body || "").length,
      imageBase64Length: imageBase64.length,
    }),
  };
};
