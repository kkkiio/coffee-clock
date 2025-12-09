import React from "react";
import { ListGroup, Button, Modal } from "react-bootstrap";

/**
 * Represents a single drink log entry.
 */
interface Log {
  id: string;
  coffee_type: string | null;
  drank_at: string;
  caffeine_amount: number;
  sugar_amount: number;
}

/**
 * Props for the LogList component.
 */
interface LogListProps {
  /** Array of log entries to display */
  logs: Log[];
  /** Callback function triggered when a log delete is confirmed */
  onDelete: (logId: string) => void;
}

/**
 * LogList Component
 * 
 * Renders a list of recent drink logs with details about caffeine and sugar content.
 * 
 * Functionality:
 * - Displays a list of drinks.
 * - Shows drink type, time, caffeine amount (⚡), and sugar amount (🍬).
 * - Handles the "Delete" workflow internally:
 *   1. User clicks the trash icon.
 *   2. A confirmation modal appears (managed by local state).
 *   3. Upon confirmation, the `onDelete` prop callback is fired.
 */
export function LogList({ logs, onDelete }: LogListProps) {
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [logToDelete, setLogToDelete] = React.useState<string | null>(null);

  const promptDelete = (logId: string) => {
    setLogToDelete(logId);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (logToDelete) {
      onDelete(logToDelete);
      setLogToDelete(null);
      setShowDeleteModal(false);
    }
  };

  return (
    <>
      <ListGroup variant="flush">
        {logs.length === 0 ? (
          <ListGroup.Item className="text-center text-muted py-4">
            No drinks yet. Thirsty? 🥤
          </ListGroup.Item>
        ) : (
          logs.map((log) => (
            <ListGroup.Item
              key={log.id}
              className="d-flex justify-content-between align-items-center"
            >
              <div>
                <span className="fw-bold">{log.coffee_type || "Unknown Drink"}</span>
                <div className="small text-muted">
                  {new Date(log.drank_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <div className="d-flex align-items-center gap-3 text-end">
                <div className="small text-muted">
                  <div>{log.caffeine_amount} mg ⚡</div>
                  {log.sugar_amount > 0 && <div>{log.sugar_amount} g 🍬</div>}
                </div>
                <Button
                  variant="link"
                  className="text-secondary p-0 border-0"
                  style={{ fontSize: "1.1rem" }}
                  onClick={() => promptDelete(log.id)}
                  aria-label="Delete log"
                  title="Delete"
                >
                  <i className="bi bi-trash"></i>
                </Button>
              </div>
            </ListGroup.Item>
          ))
        )}
      </ListGroup>

      {/* Delete Confirmation Modal - Managed internally by the list component for UI, but triggers prop action */}
      <Modal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        centered
        size="sm"
      >
        <Modal.Header closeButton>
          <Modal.Title>Delete Log?</Modal.Title>
        </Modal.Header>
        <Modal.Body>Are you sure you want to remove this record?</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}