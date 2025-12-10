import React from "react";
import {
  json,
  type MetaFunction,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useNavigation } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import {
  Container,
  Card,
  Button,
  Alert,
  Modal,
  Form as BootstrapForm,
} from "react-bootstrap";
import { CaffeineChart } from "~/components/CaffeineChart";
import { LogList } from "~/components/LogList";
import { StatsCard } from "~/components/StatsCard";
import { ScanDrinkCard } from "~/components/ScanDrinkCard";
import { QuickAddSection } from "~/components/QuickAddSection";
import { DRINK_PRESETS } from "~/data";

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
  // Note: we accept 'any' to handle both presets and custom scanned drinks
  const initiateAddLog = (drink: any) => {
    setSelectedDrink({
      caffeine: drink.caffeine,
      sugar: drink.sugar,
      type: drink.label || drink.type, // Handle both 'label' (preset) and 'type' (legacy/scanned)
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
      <StatsCard totalCaffeine={totalCaffeine} totalSugar={totalSugar} />

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
      <ScanDrinkCard onLogDrink={initiateAddLog} onError={setErrorMsg} />

      {/* Quick Add Buttons */}
      <QuickAddSection onAddLog={initiateAddLog} />

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
