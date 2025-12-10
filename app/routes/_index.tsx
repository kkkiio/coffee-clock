import React from "react";
import {
  json,
  type MetaFunction,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useNavigation, useFetcher } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  ProgressBar,
  Alert,
  Modal,
  Form as BootstrapForm,
} from "react-bootstrap";
import { CaffeineChart } from "~/components/CaffeineChart";
import { LogList } from "~/components/LogList";

export const meta: MetaFunction = () => {
  return [
    { title: "Coffee Clock" },
    { name: "description", content: "Track your caffeine intake" },
  ];
};

// --- Loader: Fetch Env ---
export async function loader({ request }: LoaderFunctionArgs) {
  return json({
    env: {
      SUPABASE_URL: process.env.VITE_SUPABASE_URL,
      SUPABASE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    },
  });
}

// --- Action (Placeholder) ---
export async function action({ request }: ActionFunctionArgs) {
  return json({ status: "ok" });
}

// Utility to format date for datetime-local input
const toLocalISOString = (date: Date) => {
  const tzOffset = date.getTimezoneOffset() * 60000;
  const localISOTime = new Date(date.getTime() - tzOffset)
    .toISOString()
    .slice(0, 16);
  return localISOTime;
};

// --- Configuration ---
const DRINK_PRESETS = [
  {
    id: "espresso",
    label: "Espresso",
    caffeine: 80,
    sugar: 0,
    emoji: "☕",
    variant: "outline-dark",
  },
  {
    id: "americano",
    label: "Americano",
    caffeine: 150,
    sugar: 0,
    emoji: "☕",
    variant: "dark",
  },
  {
    id: "latte",
    label: "Latte",
    caffeine: 120,
    sugar: 10,
    emoji: "🥛",
    variant: "primary",
  },
  {
    id: "lemon_tea",
    label: "Lemon Tea",
    caffeine: 15,
    sugar: 20,
    emoji: "🍋",
    variant: "warning",
  },
  {
    id: "coke_zero",
    label: "Coke Zero",
    caffeine: 35,
    sugar: 0,
    emoji: "🥤",
    variant: "secondary",
  },
];

export default function Index() {
  const { env } = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  const [session, setSession] = React.useState<any>(null);
  const [logs, setLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [authError, setAuthError] = React.useState("");

  // Modal State
  const [showAddModal, setShowAddModal] = React.useState(false);

  // UI Error State (replaces native alert)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const [selectedDrink, setSelectedDrink] = React.useState<{
    caffeine: number;
    sugar: number;
    type: string;
  } | null>(null);
  const [logTime, setLogTime] = React.useState(toLocalISOString(new Date()));

  // Analysis State
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
        setErrorMsg("Analysis failed: " + res.error);
      }
    }
  }, [analyzeFetcher.data]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic validation
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Image is too large (max 5MB)");
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

  // Initialize Supabase Client
  const [sbClient] = React.useState(() =>
    createClient(env.SUPABASE_URL!, env.SUPABASE_KEY!)
  );

  const fetchLogs = React.useCallback(
    async (userId: string) => {
      setLoading(true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await sbClient
        .from("coffee_logs")
        .select("*")
        .gte("drank_at", today.toISOString())
        .order("drank_at", { ascending: false });

      if (error) console.error("Error fetching logs:", error);
      else setLogs(data || []);
      setLoading(false);
    },
    [sbClient]
  );

  React.useEffect(() => {
    sbClient.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchLogs(session.user.id);
      else setLoading(false);
    });

    const {
      data: { subscription },
    } = sbClient.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchLogs(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [sbClient, fetchLogs]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement)
      .value;

    const { error } = await sbClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const { error: signUpError } = await sbClient.auth.signUp({
        email,
        password,
      });
      if (signUpError) setAuthError(error.message);
      else setAuthError("Account created! You can now log in.");
    }
  };

  const handleLogout = async () => {
    await sbClient.auth.signOut();
    setLogs([]);
  };

  // Open Add Modal
  const initiateAddLog = (drink: (typeof DRINK_PRESETS)[0]) => {
    setSelectedDrink({
      caffeine: drink.caffeine,
      sugar: drink.sugar,
      type: drink.label,
    });
    setLogTime(toLocalISOString(new Date()));
    setShowAddModal(true);
  };

  // Confirm Add
  const confirmAddLog = async () => {
    if (!session || !selectedDrink) return;
    const dateObj = new Date(logTime);
    const { error } = await sbClient.from("coffee_logs").insert({
      user_id: session.user.id,
      caffeine_amount: selectedDrink.caffeine,
      sugar_amount: selectedDrink.sugar,
      coffee_type: selectedDrink.type,
      drank_at: dateObj.toISOString(),
    });

    if (error) {
      setErrorMsg("Failed to add log: " + error.message);
    } else {
      setShowAddModal(false);
      fetchLogs(session.user.id);
    }
  };

  // Delete Handler
  const handleDeleteLog = async (logId: string) => {
    const { error } = await sbClient
      .from("coffee_logs")
      .delete()
      .eq("id", logId);

    if (error) {
      setErrorMsg("Failed to delete: " + error.message);
    } else {
      setLogs((prev) => prev.filter((l) => l.id !== logId));
    }
  };

  // --- Analysis Calculations ---
  const totalCaffeine = logs.reduce(
    (sum, log) => sum + (log.caffeine_amount || 0),
    0
  );
  const totalSugar = logs.reduce(
    (sum, log) => sum + (log.sugar_amount || 0),
    0
  );

  // Caffeine Thresholds
  const maxSafeCaffeine = 400;
  const caffeineVariant =
    totalCaffeine > maxSafeCaffeine
      ? "danger"
      : totalCaffeine > 200
      ? "warning"
      : "success";

  // Sugar Thresholds (WHO: <25g ideal, <50g limit)
  const maxSafeSugar = 50;
  const sugarVariant =
    totalSugar > maxSafeSugar
      ? "danger"
      : totalSugar > 25
      ? "warning"
      : "success";

  if (loading)
    return <Container className="p-5 text-center">Loading...</Container>;

  if (!session) {
    return (
      <Container
        className="d-flex align-items-center justify-content-center"
        style={{ minHeight: "80vh" }}
      >
        <Card style={{ width: "400px" }} className="shadow-sm">
          <Card.Body>
            <h2 className="text-center mb-4">☕ Coffee Clock</h2>
            {authError && <Alert variant="danger">{authError}</Alert>}
            <form onSubmit={handleLogin}>
              <div className="mb-3">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  name="email"
                  className="form-control"
                  required
                  placeholder="user@example.com"
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  name="password"
                  className="form-control"
                  required
                  placeholder="password"
                />
              </div>
              <div className="d-grid">
                <Button variant="primary" type="submit">
                  Sign In / Sign Up
                </Button>
              </div>
              <div className="text-center mt-3 text-muted">
                <small>
                  If you don't have an account, one will be created.
                </small>
              </div>
            </form>
          </Card.Body>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="py-4" style={{ maxWidth: "600px" }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 mb-0">☕ Today's Intake</h1>
        <Button variant="outline-secondary" size="sm" onClick={handleLogout}>
          Sign Out
        </Button>
      </div>

      {/* Global Error Alert */}
      {errorMsg && (
        <Alert variant="danger" onClose={() => setErrorMsg(null)} dismissible>
          {errorMsg}
        </Alert>
      )}

      {/* Stats Cards */}
      <Row className="g-3 mb-4">
        {/* Caffeine Card */}
        <Col xs={12} md={6}>
          <Card className="h-100 shadow-sm border-0 bg-light">
            <Card.Body>
              <h6 className="text-muted text-uppercase mb-2">Caffeine</h6>
              <div className="d-flex align-items-baseline gap-1">
                <h2 className="display-6 fw-bold text-dark mb-0">
                  {totalCaffeine}
                </h2>
                <span className="text-muted">mg</span>
              </div>
              <ProgressBar
                now={(totalCaffeine / maxSafeCaffeine) * 100}
                variant={caffeineVariant}
                className="mt-2"
                style={{ height: "6px" }}
              />
              <div className="small text-muted mt-1">Max: 400mg</div>
            </Card.Body>
          </Card>
        </Col>

        {/* Sugar Card */}
        <Col xs={12} md={6}>
          <Card className="h-100 shadow-sm border-0 bg-light">
            <Card.Body>
              <h6 className="text-muted text-uppercase mb-2">Sugar</h6>
              <div className="d-flex align-items-baseline gap-1">
                <h2 className="display-6 fw-bold text-dark mb-0">
                  {totalSugar}
                </h2>
                <span className="text-muted">g</span>
              </div>
              <ProgressBar
                now={(totalSugar / maxSafeSugar) * 100}
                variant={sugarVariant}
                className="mt-2"
                style={{ height: "6px" }}
              />
              <div className="small text-muted mt-1">Goal: &lt;25g</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Chart Section */}
      <Card className="mb-4 shadow-sm border-0">
        <Card.Body>
          <h6 className="text-muted text-uppercase small mb-3">
            Caffeine Metabolism Forecast
          </h6>
          <CaffeineChart logs={logs} />
        </Card.Body>
      </Card>

      {/* Scan Drink Section */}
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
                  initiateAddLog({
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

      {/* Quick Add Buttons */}
      <h5 className="mb-3">Quick Add</h5>
      <Row className="g-2 mb-4">
        {DRINK_PRESETS.map((drink) => (
          <Col xs={6} sm={4} key={drink.id}>
            <Button
              variant={drink.variant}
              className="w-100 py-3 position-relative overflow-hidden"
              onClick={() => initiateAddLog(drink)}
              style={{ minHeight: "100px" }}
            >
              <div className="fs-2 mb-1">{drink.emoji}</div>
              <div className="fw-bold text-nowrap">{drink.label}</div>
              <div className="small opacity-75 mt-1">
                <span className="d-inline-block me-1">⚡ {drink.caffeine}</span>
                <span className="d-inline-block">🍬 {drink.sugar}</span>
              </div>
            </Button>
          </Col>
        ))}
      </Row>

      {/* Recent Logs List - Extracted Component */}
      <h5 className="mb-3">Recent Logs</h5>
      <Card className="shadow-sm border-0">
        <LogList logs={logs} onDelete={handleDeleteLog} />
      </Card>

      {/* Add Modal */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Log Drink</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="text-center mb-4">
            <h4 className="mb-1">{selectedDrink?.type}</h4>
            <div className="text-muted">
              ⚡ {selectedDrink?.caffeine} mg &nbsp;|&nbsp; 🍬{" "}
              {selectedDrink?.sugar} g
            </div>
          </div>
          <BootstrapForm.Group controlId="logTime">
            <BootstrapForm.Label>When did you drink it?</BootstrapForm.Label>
            <BootstrapForm.Control
              type="datetime-local"
              value={logTime}
              onChange={(e) => setLogTime(e.target.value)}
            />
          </BootstrapForm.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirmAddLog}>
            Confirm & Add
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
