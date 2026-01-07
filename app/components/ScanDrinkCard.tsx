import React from "react";
import { Card, Button, Form as BootstrapForm, Row, Col } from "react-bootstrap";
import { createClient } from "@supabase/supabase-js";
import { DRINK_PRESETS } from "~/data";

interface ScanDrinkCardProps {
  onLogDrink: (drink: any) => void;
  onError: (msg: string) => void;
}

// Initialize Supabase client for client-side operations
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

/**
 * ScanDrinkCard Component
 * Handles image upload, triggers background analysis via Netlify Functions,
 * polls Supabase for results, and displays recognition data.
 */
export function ScanDrinkCard({ onLogDrink, onError }: ScanDrinkCardProps) {
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analysisResult, setAnalysisResult] = React.useState<any>(null);
  const [selectedCategory, setSelectedCategory] = React.useState<string>("");
  const [pollStatus, setPollStatus] = React.useState<string>("");

  // Cleanup polling on unmount
  const pollTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const startPolling = (jobId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // Approx 2 minutes (2s interval)

    setPollStatus("Initializing analysis...");
    
    pollTimerRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        stopPolling();
        onError("Analysis timed out. Please try again.");
        setIsAnalyzing(false);
        return;
      }

      if (!supabase) return;

      const { data, error } = await supabase
        .from("analysis_jobs")
        .select("status, result, error_message")
        .eq("id", jobId)
        .single();

      if (error) {
        console.warn("Polling error:", error);
        // Don't stop immediately on network glitch, but maybe after a few errors
        return;
      }

      if (data.status === "completed") {
        stopPolling();
        setIsAnalyzing(false);
        if (data.result) {
          setAnalysisResult(data.result);
          setSelectedCategory(data.result.product_name || "");
        } else {
          onError("Analysis completed but returned no data.");
        }
      } else if (data.status === "failed") {
        stopPolling();
        setIsAnalyzing(false);
        onError(data.error_message || "Analysis failed.");
      } else {
        // Update status text for user feedback
        setPollStatus(data.status === "processing" ? "AI is analyzing image..." : "Waiting for queue...");
      }
    }, 2000);
  };

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!supabase) {
        onError("System configuration error: Supabase client missing");
        return;
    }

    // Basic validation
    if (file.size > 5 * 1024 * 1024) {
      onError("Image is too large (max 5MB)");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setPollStatus("Uploading image...");

    try {
        // 1. Generate Job ID
        const jobId = crypto.randomUUID();

        // 2. Insert Initial Record
        // We use the current user's session implicitly handled by supabase-js if logged in.
        // If not logged in, RLS might block this unless we allow anon inserts.
        const { error: insertError } = await supabase
            .from("analysis_jobs")
            .insert({ 
                id: jobId, 
                status: 'pending' 
                // user_id is automatically set to auth.uid() by default in DB if not provided,
                // but strictly RLS requires an authenticated user.
            });

        if (insertError) {
            console.error("DB Insert Error", insertError);
            throw new Error("Failed to initialize analysis task. Please ensure you are logged in.");
        }

        // 3. Convert Image to Base64
        const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const res = reader.result as string;
                // Remove data URL prefix (data:image/jpeg;base64,)
                const b64 = res.split(",")[1];
                resolve(b64);
            };
            reader.readAsDataURL(file);
        });

        // 4. Trigger Background Function
        // Using relative path assuming the site is served from root or function proxy is set up
        const response = await fetch("/.netlify/functions/analyze-drink-background", {
            method: "POST",
            body: JSON.stringify({
                jobId,
                imageBase64: base64,
                mimeType: file.type
            }),
            headers: {
                "Content-Type": "application/json"
            }
        });

        if (response.status !== 202 && response.status !== 200) {
            throw new Error(`Failed to start analysis (Server returned ${response.status})`);
        }

        // 5. Start Polling
        startPolling(jobId);

    } catch (err: any) {
        console.error(err);
        setIsAnalyzing(false);
        onError(err.message || "Failed to start analysis");
        stopPolling();
    }
  };

  return (
    <>
      <h5 className="mb-3">Scan Drink</h5>
      <Card className="mb-4 shadow-sm border-0">
        <Card.Body>
          {!analysisResult ? (
            <div className="text-center py-3">
              {isAnalyzing ? (
                <div className="d-flex flex-column align-items-center">
                  <div
                    className="spinner-border text-primary mb-2"
                    role="status"
                  />
                  <span className="text-muted">{pollStatus}</span>
                </div>
              ) : (
                <>
                  <BootstrapForm.Label
                    htmlFor="cameraInput"
                    className="btn btn-outline-primary btn-lg w-100 mb-0"
                  >
                    📸 Snap a Photo
                  </BootstrapForm.Label>
                  <input
                    id="cameraInput"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="d-none"
                    onChange={handleImageUpload}
                  />
                  <div className="text-muted small mt-2">
                    Instantly recognize caffeine & sugar
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <div className="d-flex justify-content-between align-items-start mb-3">
                <div>
                  <h6 className="mb-1">
                    {analysisResult.product_name || "Detected Drink"}
                  </h6>
                  <div className="text-muted small">{analysisResult.brand}</div>
                </div>
                <Button
                  variant="close"
                  size="sm"
                  onClick={() => setAnalysisResult(null)}
                />
              </div>

              <Row className="text-center g-2 mb-3">
                <Col xs={6}>
                  <div className="bg-light rounded p-2">
                    <div className="fw-bold text-danger">
                      {Math.round(analysisResult.caffeine_mg || 0)}mg
                    </div>
                    <div className="small text-muted">Caffeine</div>
                  </div>
                </Col>
                <Col xs={6}>
                  <div className="bg-light rounded p-2">
                    <div className="fw-bold text-warning">
                      {Math.round(analysisResult.sugar_g || 0)}g
                    </div>
                    <div className="small text-muted">Sugar</div>
                  </div>
                </Col>
              </Row>

              <BootstrapForm.Group className="mb-3">
                <BootstrapForm.Label className="small text-muted">
                  Select Drink Category
                </BootstrapForm.Label>
                <BootstrapForm.Select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value={analysisResult.product_name}>
                    Match &quot;{analysisResult.product_name}&quot; (Custom)
                  </option>
                  {DRINK_PRESETS.map((p) => (
                    <option key={p.id} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </BootstrapForm.Select>
              </BootstrapForm.Group>

              <Button
                variant="primary"
                className="w-100"
                onClick={() => {
                  onLogDrink({
                    label: selectedCategory || analysisResult.product_name,
                    caffeine: analysisResult.caffeine_mg || 0,
                    sugar: analysisResult.sugar_g || 0,
                    emoji: "📸", // Camera emoji for scanned items
                    variant: "info",
                    id: "scanned_item", // Placeholder
                  });
                  setAnalysisResult(null);
                }}
              >
                Log This Drink
              </Button>

              {analysisResult.note && (
                <div className="mt-2 small text-muted fst-italic">
                  Note: {analysisResult.note}
                </div>
              )}
            </div>
          )}
        </Card.Body>
      </Card>
    </>
  );
}

