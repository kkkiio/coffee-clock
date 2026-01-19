import { getStore, connectLambda } from "@netlify/blobs";
import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event, context) => {
    // 0. Initialize Blobs for Lambda Compatibility Mode
    connectLambda(event as any);

    // 1. Check HTTP Method
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const payload = event.body;
        if (!payload) {
            return { statusCode: 400, body: "No payload provided" };
        }

        // 2. Generate a unique key for the temporary image
        // Using simple random string as basic UUID substitute to avoid extra deps if not needed,
        // but crypto.randomUUID is available in Node 18+ (Netlify default)
        const key = crypto.randomUUID();

        // 3. Store data in Netlify Blobs
        // Store name: "temp-images"
        const store = getStore("temp-images");

        // Set expiration 1 hour from now
        const expiration = Date.now() + 1000 * 60 * 60;

        // Determine content type if possible (optional, just storing raw body string usually)
        // The frontend sends raw base64 or JSON? The previous code sent JSON { jobId, imageBase64... } to background.
        // Here we want to intercept that. 
        // Plan: Send RAW image data or the exact JSON payload?
        // Recommendation: Store the exact JSON payload that was going to go to the background function.
        // This minimizes changes in the background function's parsing logic (other than reading from blob).

        await store.set(key, payload, {
            metadata: { expiration }
        });

        // 4. Return the key
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                key,
                message: "Image stored successfully"
            }),
        };

    } catch (error) {
        console.error("Upload failed", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error during upload" }) };
    }
};
