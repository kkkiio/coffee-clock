import { Button, Col, Row } from "react-bootstrap";
import { DRINK_PRESETS } from "~/data";

interface QuickAddSectionProps {
  onAddLog: (drink: (typeof DRINK_PRESETS)[0]) => void;
}

/**
 * QuickAddSection Component
 * Renders a grid of preset drink buttons for quick logging.
 *
 * @param onAddLog - Callback function when a preset drink is clicked
 */
export function QuickAddSection({ onAddLog }: QuickAddSectionProps) {
  return (
    <>
      <h5 className="mb-3">Quick Add</h5>
      <Row className="g-2 mb-4">
        {DRINK_PRESETS.map((drink) => (
          <Col xs={6} sm={4} key={drink.id}>
            <Button
              variant={drink.variant}
              className="w-100 py-3 position-relative overflow-hidden"
              onClick={() => onAddLog(drink)}
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
    </>
  );
}
