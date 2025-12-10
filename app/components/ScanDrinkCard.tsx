import React from "react";
import { useFetcher } from "@remix-run/react";
import { Card, Button, Form as BootstrapForm, Row, Col } from "react-bootstrap";
import { DRINK_PRESETS } from "~/data";

interface ScanDrinkCardProps {
  onLogDrink: (drink: any) => void;
  onError: (msg: string) => void;
}

/**
 * ScanDrinkCard Component
 * Handles image upload, interacts with the analysis API, and displays recognition results.
 * Allows users to review and log the analyzed drink.
 *
 * @param onLogDrink - Callback function to add a log entry
 * @param onError - Callback function to handle errors
 */
export function ScanDrinkCard({ onLogDrink, onError }: ScanDrinkCardProps) {
  const analyzeFetcher = useFetcher();
  const [analysisResult, setAnalysisResult] = React.useState<any>(null);
  const [selectedCategory, setSelectedCategory] = React.useState<string>("");
  const isAnalyzing = analyzeFetcher.state !== "idle";

  React.useEffect(() => {
    if (
      analyzeFetcher.data &&
      (analyzeFetcher.data as any).caffeine !== undefined
    ) {
      const res = analyzeFetcher.data as any;
      // Sanity checks
      if (res.caffeine !== null) {
        setAnalysisResult(res);
        setSelectedCategory(res.productName || "");
      } else if (res.error) {
        onError("Analysis failed: " + res.error);
      }
    }
  }, [analyzeFetcher.data, onError]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic validation
    if (file.size > 5 * 1024 * 1024) {
      onError("Image is too large (max 5MB)");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);
    analyzeFetcher.submit(formData, {
      method: "post",
      action: "/api/analyze-drink",
      encType: "multipart/form-data",
    });
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
                  <span className="text-muted">Analyzing beverage...</span>
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
                    {analysisResult.productName || "Detected Drink"}
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
                      {Math.round(analysisResult.caffeine)}mg
                    </div>
                    <div className="small text-muted">Caffeine</div>
                  </div>
                </Col>
                <Col xs={6}>
                  <div className="bg-light rounded p-2">
                    <div className="fw-bold text-warning">
                      {Math.round(analysisResult.sugar)}g
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
                  <option value={analysisResult.productName}>
                    Match "{analysisResult.productName}" (Custom)
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
                    label: selectedCategory || analysisResult.productName,
                    caffeine: analysisResult.caffeine,
                    sugar: analysisResult.sugar,
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
