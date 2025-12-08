import React from "react";
import { json, type MetaFunction, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "~/utils/supabase.server";
import { Container, Row, Col, Card, Button, ListGroup, ProgressBar, Badge, Alert } from "react-bootstrap";
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

// --- Action (Placeholder for now, mostly client-side logic) ---
export async function action({ request }: ActionFunctionArgs) {
  return json({ status: "ok" });
}

export default function Index() {
  const { env } = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  const [session, setSession] = React.useState<any>(null);
  const [logs, setLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [authError, setAuthError] = React.useState("");

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
    // Check active session
    sbClient.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchLogs(session.user.id);
      else setLoading(false);
    });

    // Listen for auth changes
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
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    const { error } = await sbClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
       // If login fails, try signup (simplified flow for prototype)
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

  const addLog = async (amount: number, type: string) => {
    if (!session) return;
    
    // Optimistic update could go here
    
    const { error } = await sbClient.from("coffee_logs").insert({
      user_id: session.user.id,
      caffeine_amount: amount,
      coffee_type: type,
      drank_at: new Date().toISOString(),
    });

    if (error) {
      alert("Failed to add log: " + error.message);
    } else {
      fetchLogs(session.user.id);
    }
  };

  // Calculate Total
  const totalCaffeine = logs.reduce((sum, log) => sum + log.caffeine_amount, 0);
  const maxSafe = 400; // General guideline
  const progressVariant = totalCaffeine > maxSafe ? "danger" : totalCaffeine > 200 ? "warning" : "success";

  if (loading) {
    return <Container className="p-5 text-center">Loading...</Container>;
  }

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
                <Button variant="primary" type="submit">
                  Sign In / Sign Up
                </Button>
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

      {/* Status Card */}
      <Card className="mb-4 text-center shadow-sm border-0 bg-light">
        <Card.Body>
          <h6 className="text-muted text-uppercase mb-2">Total Caffeine</h6>
          <h2 className="display-4 fw-bold text-dark">{totalCaffeine} <span className="fs-4 text-muted">mg</span></h2>
          <ProgressBar 
            now={(totalCaffeine / maxSafe) * 100} 
            variant={progressVariant} 
            className="mt-3 mb-4" 
            style={{ height: "10px" }} 
          />
          
          {/* Visualization Chart */}
          <div className="mt-4 mb-2">
            <h6 className="text-muted text-uppercase small mb-3">Metabolism Forecast</h6>
            <CaffeineChart logs={logs} />
          </div>

        </Card.Body>
      </Card>

      {/* Quick Add Buttons */}
      <Row className="g-2 mb-4">
        <Col>
          <Button 
            variant="outline-primary" 
            className="w-100 py-3" 
            onClick={() => addLog(100, "Weak/Tea")}
          >
            <div className="fw-bold">Small</div>
            <div className="small opacity-75">100mg</div>
          </Button>
        </Col>
        <Col>
          <Button 
            variant="primary" 
            className="w-100 py-3" 
            onClick={() => addLog(150, "Latte")}
          >
            <div className="fw-bold">Latte</div>
            <div className="small opacity-75">150mg</div>
          </Button>
        </Col>
        <Col>
          <Button 
            variant="dark" 
            className="w-100 py-3" 
            onClick={() => addLog(200, "Americano")}
          >
            <div className="fw-bold">Strong</div>
            <div className="small opacity-75">200mg</div>
          </Button>
        </Col>
      </Row>

      {/* Recent Logs */}
      <h5 className="mb-3">Recent Logs</h5>
      <Card className="shadow-sm border-0">
        <ListGroup variant="flush">
          {logs.length === 0 ? (
            <ListGroup.Item className="text-center text-muted py-4">
              No coffee yet today. Need a boost? 🚀
            </ListGroup.Item>
          ) : (
            logs.map((log) => (
              <ListGroup.Item key={log.id} className="d-flex justify-content-between align-items-center">
                <div>
                  <span className="fw-bold">{log.coffee_type || "Coffee"}</span>
                  <div className="small text-muted">
                    {new Date(log.drank_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <Badge bg="secondary" pill>
                  {log.caffeine_amount} mg
                </Badge>
              </ListGroup.Item>
            ))
          )}
        </ListGroup>
      </Card>
    </Container>
  );
}