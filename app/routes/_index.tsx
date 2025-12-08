import React from "react";
import { json, type MetaFunction, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import { Container, Row, Col, Card, Button, ListGroup, ProgressBar, Badge, Alert, Modal, Form as BootstrapForm } from "react-bootstrap";
import { CaffeineChart } from "~/components/CaffeineChart";

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
      SUPABASE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
    }
  });
}

// --- Action (Placeholder) ---
export async function action({ request }: ActionFunctionArgs) {
  return json({ status: "ok" });
}

// Utility to format date for datetime-local input
const toLocalISOString = (date: Date) => {
  const tzOffset = date.getTimezoneOffset() * 60000; 
  const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
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
  const [selectedCoffee, setSelectedCoffee] = React.useState<{amount: number, type: string} | null>(null);
  const [logTime, setLogTime] = React.useState(toLocalISOString(new Date()));
  
  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [logToDelete, setLogToDelete] = React.useState<string | null>(null);

  // Initialize Supabase Client
  const [sbClient] = React.useState(() => 
    createClient(env.SUPABASE_URL!, env.SUPABASE_KEY!)
  );

  const fetchLogs = React.useCallback(async (userId: string) => {
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
  }, [sbClient]);

  React.useEffect(() => {
    sbClient.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchLogs(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = sbClient.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchLogs(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [sbClient, fetchLogs]);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    const { error } = await sbClient.auth.signInWithPassword({ email, password });

    if (error) {
       const { error: signUpError } = await sbClient.auth.signUp({ email, password });
       if (signUpError) setAuthError(error.message);
       else setAuthError("Account created! You can now log in.");
    }
  };

  const handleLogout = async () => {
    await sbClient.auth.signOut();
    setLogs([]);
  };

  // Open Add Modal
  const initiateAddLog = (amount: number, type: string) => {
    setSelectedCoffee({ amount, type });
    setLogTime(toLocalISOString(new Date()));
    setShowAddModal(true);
  };

  // Confirm Add
  const confirmAddLog = async () => {
    if (!session || !selectedCoffee) return;
    const dateObj = new Date(logTime);
    const { error } = await sbClient.from("coffee_logs").insert({
      user_id: session.user.id,
      caffeine_amount: selectedCoffee.amount,
      coffee_type: selectedCoffee.type,
      drank_at: dateObj.toISOString(),
    });

    if (error) {
      alert("Failed to add log: " + error.message);
    } else {
      setShowAddModal(false);
      fetchLogs(session.user.id);
    }
  };

  // Delete Handlers
  const promptDelete = (logId: string) => {
    setLogToDelete(logId);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!logToDelete) return;
    const { error } = await sbClient.from("coffee_logs").delete().eq("id", logToDelete);

    if (error) {
      alert("Failed to delete: " + error.message);
    } else {
      setLogs(prev => prev.filter(l => l.id !== logToDelete));
      setShowDeleteModal(false);
    }
  };

  const totalCaffeine = logs.reduce((sum, log) => sum + log.caffeine_amount, 0);
  const maxSafe = 400;
  const progressVariant = totalCaffeine > maxSafe ? "danger" : totalCaffeine > 200 ? "warning" : "success";

  if (loading) return <Container className="p-5 text-center">Loading...</Container>;

  if (!session) {
    return (
      <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: "80vh" }}>
        <Card style={{ width: "400px" }} className="shadow-sm">
          <Card.Body>
            <h2 className="text-center mb-4">☕ Coffee Clock</h2>
            {authError && <Alert variant="danger">{authError}</Alert>}
            <form onSubmit={handleLogin}>
              <div className="mb-3">
                <label className="form-label">Email</label>
                <input type="email" name="email" className="form-control" required placeholder="user@example.com" />
              </div>
              <div className="mb-3">
                <label className="form-label">Password</label>
                <input type="password" name="password" className="form-control" required placeholder="password" />
              </div>
              <div className="d-grid">
                <Button variant="primary" type="submit">Sign In / Sign Up</Button>
              </div>
              <div className="text-center mt-3 text-muted">
                <small>If you don't have an account, one will be created.</small>
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
        <Button variant="outline-secondary" size="sm" onClick={handleLogout}>Sign Out</Button>
      </div>

      <Card className="mb-4 text-center shadow-sm border-0 bg-light">
        <Card.Body>
          <h6 className="text-muted text-uppercase mb-2">Total Caffeine</h6>
          <h2 className="display-4 fw-bold text-dark">{totalCaffeine} <span className="fs-4 text-muted">mg</span></h2>
          <ProgressBar now={(totalCaffeine / maxSafe) * 100} variant={progressVariant} className="mt-3 mb-4" style={{ height: "10px" }} />
          <div className="mt-4 mb-2">
            <h6 className="text-muted text-uppercase small mb-3">Metabolism Forecast</h6>
            <CaffeineChart logs={logs} />
          </div>
        </Card.Body>
      </Card>

      <Row className="g-2 mb-4">
        <Col>
          <Button variant="outline-primary" className="w-100 py-3" onClick={() => initiateAddLog(100, "Weak/Tea")}>
            <div className="fw-bold">Small</div><div className="small opacity-75">100mg</div>
          </Button>
        </Col>
        <Col>
          <Button variant="primary" className="w-100 py-3" onClick={() => initiateAddLog(150, "Latte")}>
            <div className="fw-bold">Latte</div><div className="small opacity-75">150mg</div>
          </Button>
        </Col>
        <Col>
          <Button variant="dark" className="w-100 py-3" onClick={() => initiateAddLog(200, "Americano")}>
            <div className="fw-bold">Strong</div><div className="small opacity-75">200mg</div>
          </Button>
        </Col>
      </Row>

      <h5 className="mb-3">Recent Logs</h5>
      <Card className="shadow-sm border-0">
        <ListGroup variant="flush">
          {logs.length === 0 ? (
            <ListGroup.Item className="text-center text-muted py-4">No coffee yet today. Need a boost? 🚀</ListGroup.Item>
          ) : (
            logs.map((log) => (
              <ListGroup.Item key={log.id} className="d-flex justify-content-between align-items-center">
                <div>
                  <span className="fw-bold">{log.coffee_type || "Coffee"}</span>
                  <div className="small text-muted">{new Date(log.drank_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div className="d-flex align-items-center gap-3">
                  <Badge bg="secondary" pill>{log.caffeine_amount} mg</Badge>
                  <Button variant="link" className="text-danger p-0 text-decoration-none" style={{ fontSize: "1.2rem", lineHeight: 1 }} onClick={() => promptDelete(log.id)} aria-label="Delete log">&times;</Button>
                </div>
              </ListGroup.Item>
            ))
          )}
        </ListGroup>
      </Card>

      {/* Add Modal */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered>
        <Modal.Header closeButton><Modal.Title>Log Coffee</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="lead">Adding: <strong>{selectedCoffee?.type}</strong> ({selectedCoffee?.amount}mg)</p>
          <BootstrapForm.Group controlId="logTime">
            <BootstrapForm.Label>When did you drink it?</BootstrapForm.Label>
            <BootstrapForm.Control type="datetime-local" value={logTime} onChange={(e) => setLogTime(e.target.value)} />
          </BootstrapForm.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={confirmAddLog}>Confirm & Add</Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered size="sm">
        <Modal.Header closeButton><Modal.Title>Delete Log?</Modal.Title></Modal.Header>
        <Modal.Body>Are you sure you want to remove this record?</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete}>Delete</Button>
        </Modal.Footer>
      </Modal>

    </Container>
  );
}
